// Web platform adaptörleri — docs/v90/02-architecture.md §12.2 (web hedefi), ADR-013.
//
// Tarayıcı olmadan sınanabilen parçalar: PrefixBlobStore (BlobStore'un düz
// anahtar-değer deposu üzerindeki gerçekleştirmesi; boş dizin işareti dahil),
// RoutedBlobStore (`.sqlite` adlarının görüntü deposuna yönlendirilmesi),
// EncryptedKvStore (fotoğraf/meta değerlerinin AES-GCM ile şifrelenmesi, R93.1)
// ve sekme kilidi mantığı. IndexedDB gerçekleştirmeleri (platform/web/idb.ts,
// keyProvider.ts) yalnızca tarayıcıda koşar; burada bellek depoları ve sahte
// kilit yöneticisi vardır. Uçtan uca yedek akışı: test/webBackup.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedKvStore } from '../src/core/backup/EncryptedKvStore.ts';
import { InMemoryKvStore } from '../src/core/backup/KvStore.ts';
import { PrefixBlobStore, normalize } from '../src/core/backup/PrefixBlobStore.ts';
import { RoutedBlobStore, isImageName } from '../src/core/backup/RoutedBlobStore.ts';
import { EncryptedImageStore, InMemoryKeyProvider } from '../src/core/db/EncryptedImageStore.ts';
import { DbOpenError } from '../src/core/db/errors.ts';
import { InMemoryImageStore } from '../src/core/db/imageStore.ts';
import { requestTabLock } from '../src/platform/web/tabLock.ts';
import type { LockManagerLike } from '../src/platform/web/tabLock.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

async function seeded(entries: Record<string, string>): Promise<{ kv: InMemoryKvStore; blobs: PrefixBlobStore }> {
  const kv = new InMemoryKvStore();
  const blobs = new PrefixBlobStore(kv);
  for (const [k, v] of Object.entries(entries)) await blobs.write(k, bytes(v));
  return { kv, blobs };
}

// ── InMemoryKvStore

test('InMemoryKvStore: get kopya döndürür, keys önekle ve sıralı', async () => {
  const kv = new InMemoryKvStore();
  const src = bytes('abc');
  await kv.put('b', src);
  src[0] = 0;                                              // çağıranın tamponu depoyu bozmaz
  const got = await kv.get('b');
  assert.equal(text(got!), 'abc');
  got![0] = 0;
  assert.equal(text((await kv.get('b'))!), 'abc');         // dönen kopya da depoyu bozmaz

  await kv.put('a/2', bytes('x'));
  await kv.put('a/1', bytes('y'));
  await kv.put('ab', bytes('z'));
  assert.deepEqual(await kv.keys('a/'), ['a/1', 'a/2']);
  assert.deepEqual(await kv.keys('a'), ['a/1', 'a/2', 'ab']);
  assert.equal(await kv.get('yok'), null);
  await kv.delete('yok');                                  // sessiz
  assert.equal(kv.size, 4);
});

// ── PrefixBlobStore

test('list yalnızca doğrudan çocukları verir; iç içe ve dizin işareti yok', async () => {
  const { blobs } = await seeded({
    'photos/a.jpg': '1', 'photos/b.jpg': '2', 'photos/nested/c.jpg': '3',
    'photos.import/d.jpg': '4', 'other.txt': '5',
  });
  assert.deepEqual((await blobs.list('photos')).sort(), ['a.jpg', 'b.jpg']);
  assert.deepEqual(await blobs.list('photos.import'), ['d.jpg']);
  assert.deepEqual(await blobs.list('yok'), []);
  assert.deepEqual(await blobs.list('photos/'), ['a.jpg', 'b.jpg']);   // sondaki / önemsiz
});

test('read/write/remove: eksik dosya read\'de fırlatır, remove sessiz', async () => {
  const { blobs, kv } = await seeded({ 'photos/a.jpg': 'A' });
  assert.equal(text(await blobs.read('photos/a.jpg')), 'A');
  await blobs.write('photos/a.jpg', bytes('A2'));          // üzerine yazma
  assert.equal(text(await blobs.read('photos/a.jpg')), 'A2');
  await assert.rejects(blobs.read('photos/yok.jpg'), /dosya yok/);
  await blobs.remove('photos/yok.jpg');                     // sessiz
  await blobs.remove('photos/a.jpg');
  assert.equal(kv.size, 0);
});

test('ensureDir 0 baytlık dizin işareti koyar: list gizler, exists görür, tekrar çağrı yazmaz', async () => {
  const { blobs, kv } = await seeded({});
  await blobs.ensureDir('photos');
  assert.deepEqual(await kv.keys(''), ['photos/']);
  assert.equal((await kv.get('photos/'))!.byteLength, 0);
  assert.equal(await blobs.exists('photos'), true);
  assert.equal(await blobs.exists('photos/'), true);
  assert.deepEqual(await blobs.list('photos'), [], 'işaret listede görünmez');
  await blobs.ensureDir('photos/');                          // idempotent; sondaki / önemsiz
  assert.equal(kv.size, 1);
  await blobs.write('photos/x.jpg', bytes('x'));
  assert.deepEqual(await blobs.list('photos'), ['x.jpg']);
  await assert.rejects(blobs.read('photos/'), /dosya yok/);  // işaret dosya gibi okunmaz
});

test('F1 · sıfır dosyalı dizin taşınır (ensureDir → 0 yazma → rename); işaret birlikte gider', async () => {
  const { blobs, kv } = await seeded({});
  await blobs.ensureDir('photos.import');
  await blobs.rename('photos.import', 'photos');
  assert.deepEqual(await kv.keys(''), ['photos/']);
  assert.equal(await blobs.exists('photos.import'), false);
  assert.equal(await blobs.exists('photos'), true);
  assert.deepEqual(await blobs.list('photos'), []);
});

test('removeDir işareti de siler; kaynağı ne işaret ne çocuk ne dosya olan rename fırlatır', async () => {
  const { blobs, kv } = await seeded({ 'photos/a.jpg': '1' });
  await blobs.ensureDir('photos');
  await blobs.ensureDir('empty');
  assert.deepEqual(await kv.keys(''), ['empty/', 'photos/', 'photos/a.jpg']);
  await blobs.removeDir('photos');
  await blobs.removeDir('empty');
  assert.equal(kv.size, 0);
  assert.equal(await blobs.exists('photos'), false);
  await assert.rejects(blobs.rename('photos', 'x'), /yeniden adlandırılacak dosya yok/);
  assert.equal(kv.size, 0);
});

test('rename dizin: hedefteki eski işaret ve içerik temizlenir, kaynağın işareti taşınır', async () => {
  const { blobs, kv } = await seeded({ 'photos/old.jpg': 'old', 'photos.import/n.jpg': 'new' });
  await blobs.ensureDir('photos');
  await blobs.ensureDir('photos.import');
  await blobs.rename('photos.import', 'photos');
  assert.deepEqual(await kv.keys(''), ['photos/', 'photos/n.jpg']);
  assert.equal(text(await blobs.read('photos/n.jpg')), 'new');
});

test('removeDir önekli tüm anahtarları siler, komşu öneklere dokunmaz', async () => {
  const { blobs, kv } = await seeded({
    'photos/a.jpg': '1', 'photos/n/b.jpg': '2', 'photos.import/c.jpg': '3', 'photosx': '4',
  });
  await blobs.removeDir('photos');
  assert.deepEqual(await kv.keys(''), ['photos.import/c.jpg', 'photosx']);
  await blobs.removeDir('yok');                            // sessiz
});

test('exists: dosya için anahtar, dizin için önek', async () => {
  const { blobs } = await seeded({ 'photos/a.jpg': '1' });
  assert.equal(await blobs.exists('photos/a.jpg'), true);
  assert.equal(await blobs.exists('photos'), true);        // dizin: çocuğu var
  assert.equal(await blobs.exists('photos/'), true);
  assert.equal(await blobs.exists('photos/b.jpg'), false);
  assert.equal(await blobs.exists('photo'), false);        // önek değil, dizin sınırı
  assert.equal(await blobs.exists('photos.import'), false);
});

test('rename tek dosya: taşır, hedef varsa üzerine yazar, kaynak yoksa fırlatır', async () => {
  const { blobs, kv } = await seeded({ 'a.sqlite': 'A', 'b.sqlite': 'B' });
  await blobs.rename('a.sqlite', 'b.sqlite');
  assert.deepEqual(await kv.keys(''), ['b.sqlite']);
  assert.equal(text(await blobs.read('b.sqlite')), 'A');
  await assert.rejects(blobs.rename('yok.sqlite', 'c.sqlite'), /yeniden adlandırılacak dosya yok/);
  assert.deepEqual(await kv.keys(''), ['b.sqlite']);        // başarısız rename iz bırakmaz
});

test('rename dizin: tüm anahtarları taşır ve hedefteki eski içeriği kaldırır', async () => {
  const { blobs, kv } = await seeded({
    'photos.import/a.jpg': 'newA', 'photos.import/sub/x.jpg': 'newX',
    'photos/old.jpg': 'old', 'photos/a.jpg': 'oldA',
  });
  await blobs.rename('photos.import', 'photos');
  assert.deepEqual(await kv.keys(''), ['photos/a.jpg', 'photos/sub/x.jpg']);
  assert.equal(text(await blobs.read('photos/a.jpg')), 'newA');   // eski a.jpg ezildi
  assert.equal(await blobs.exists('photos.import'), false);
});

test('BackupImporter değişim sırası (02 §12.3 adım 5) beklenen anahtarları bırakır', async () => {
  // Canlı: photos/{p1,p2}; staging: photos.import/{p2,p3}; eski geri alma kopyası: photos.pre-import/{stale}
  const { blobs, kv } = await seeded({
    'photos/p1.jpg': 'live1', 'photos/p2.jpg': 'live2',
    'photos.import/p2.jpg': 'imp2', 'photos.import/p3.jpg': 'imp3',
    'photos.pre-import/stale.jpg': 'stale',
  });
  const photosDir = 'photos';
  const preImport = `${photosDir}.pre-import`;
  const staging = `${photosDir}.import`;

  await blobs.removeDir(preImport);
  if (await blobs.exists(photosDir)) await blobs.rename(photosDir, preImport);
  await blobs.rename(staging, photosDir);

  assert.deepEqual(await kv.keys(''), [
    'photos.pre-import/p1.jpg', 'photos.pre-import/p2.jpg',
    'photos/p2.jpg', 'photos/p3.jpg',
  ]);
  assert.equal(text(await blobs.read('photos/p2.jpg')), 'imp2');
  assert.equal(text(await blobs.read('photos.pre-import/p2.jpg')), 'live2');
  assert.deepEqual((await blobs.list(photosDir)).sort(), ['p2.jpg', 'p3.jpg']);

  // Geri alma penceresi kaydı: importer `photos.pre-import/../restore-point.json` yazar.
  await blobs.write(`${preImport}/../restore-point.json`, bytes('{}'));
  assert.equal(await blobs.exists('restore-point.json'), true);
  assert.deepEqual((await blobs.list(preImport)).sort(), ['p1.jpg', 'p2.jpg']);   // kayıt "dizin"e sızmadı

  // Geri alma (swap rollback): pre-import → photos
  await blobs.rename(preImport, photosDir);
  assert.deepEqual((await blobs.list(photosDir)).sort(), ['p1.jpg', 'p2.jpg']);
  assert.equal(await blobs.exists(preImport), false);
});

test('ilk fotoğraf yazımı: dizin yokken de çalışır (ensureDir + write + list)', async () => {
  const { blobs } = await seeded({});
  await blobs.ensureDir('photos');
  await blobs.write('photos/x.jpg', bytes('x'));
  assert.deepEqual(await blobs.list('photos'), ['x.jpg']);
});

test('BackupImporter değişim sırası · fotoğrafsız yedek, canlı dizin yokken ve varken (F1)', async () => {
  const { blobs, kv } = await seeded({});
  const photosDir = 'photos';
  const preImport = `${photosDir}.pre-import`;
  const staging = `${photosDir}.import`;
  const swap = async () => {
    // importer adım 4: staging temizlenir, var edilir, 0 dosya yazılır
    await blobs.removeDir(staging);
    await blobs.ensureDir(staging);
    // adım 5
    await blobs.removeDir(preImport);
    if (await blobs.exists(photosDir)) await blobs.rename(photosDir, preImport);
    await blobs.rename(staging, photosDir);
  };

  await swap();                                             // canlı dizin hiç yoktu
  assert.deepEqual(await kv.keys(''), ['photos/']);
  assert.deepEqual(await blobs.list(photosDir), []);
  assert.equal(await blobs.exists(preImport), false);

  await swap();                                             // canlı dizin boş ama işaretli: pre-import'a taşınır
  assert.deepEqual(await kv.keys(''), ['photos.pre-import/', 'photos/']);

  await blobs.rename(preImport, photosDir);                 // geri alma: boş dizin geri gelir
  assert.deepEqual(await kv.keys(''), ['photos/']);
});

test('normalize: . ve .. çözülür, çift ve sondaki / atılır', () => {
  assert.equal(normalize('photos.pre-import/../restore-point.json'), 'restore-point.json');
  assert.equal(normalize('./photos//a.jpg/'), 'photos/a.jpg');
  assert.equal(normalize('../a'), 'a');                   // kökün üstüne çıkılmaz
  assert.equal(normalize('v90.sqlite'), 'v90.sqlite');
});

// ── RoutedBlobStore

function routed() {
  const kv = new InMemoryKvStore();
  const images = new InMemoryImageStore();
  const blobs = new RoutedBlobStore(new PrefixBlobStore(kv), images);
  return { kv, images, blobs };
}

test('RoutedBlobStore · isImageName: yalnızca dizinsiz `.sqlite` adları', () => {
  assert.equal(isImageName('v90.sqlite'), true);
  assert.equal(isImageName('v90.import.sqlite'), true);
  assert.equal(isImageName('v90.pre-import.sqlite'), true);
  assert.equal(isImageName('v90.bak.v3.sqlite'), true);
  assert.equal(isImageName('photos/x.sqlite'), false);
  assert.equal(isImageName('photos'), false);
  assert.equal(isImageName('restore-point.json'), false);
  assert.equal(isImageName('v90.sqlite.bak'), false);
});

test('RoutedBlobStore · görüntü adları ImageStore\'a, kalanı iç depoya gider', async () => {
  const { kv, images, blobs } = routed();
  await blobs.write('v90.sqlite', bytes('DB'));
  await blobs.write('photos/a.jpg', bytes('A'));
  assert.deepEqual(images.names(), ['v90.sqlite']);
  assert.deepEqual(await kv.keys(''), ['photos/a.jpg']);
  assert.equal(text(await blobs.read('v90.sqlite')), 'DB');
  assert.equal(text(await blobs.read('photos/a.jpg')), 'A');
  assert.equal(await blobs.exists('v90.sqlite'), true);
  assert.equal(await blobs.exists('yok.sqlite'), false);
  assert.deepEqual(await blobs.list('v90.sqlite'), [], 'görüntü dosyadır, çocuğu yok');
  await blobs.ensureDir('v90.sqlite');                        // görüntü adı için no-op
  await blobs.removeDir('v90.sqlite');
  assert.deepEqual(images.names(), ['v90.sqlite']);
  await assert.rejects(blobs.read('yok.sqlite'), /dosya yok/);
  await blobs.remove('yok.sqlite');                           // sessiz
  await blobs.remove('v90.sqlite');
  assert.deepEqual(images.names(), []);
});

test('RoutedBlobStore · BackupImporter değişimi (02 §12.3 adım 5) görüntü deposunda yapılır', async () => {
  const { images, blobs } = routed();
  await blobs.write('v90.sqlite', bytes('live'));
  await blobs.write('v90.import.sqlite', bytes('staged'));
  await blobs.write('v90.pre-import.sqlite', bytes('stale'));
  await blobs.remove('v90.pre-import.sqlite');
  await blobs.rename('v90.sqlite', 'v90.pre-import.sqlite');
  await blobs.rename('v90.import.sqlite', 'v90.sqlite');
  assert.deepEqual(images.names().sort(), ['v90.pre-import.sqlite', 'v90.sqlite']);
  assert.equal(text(await blobs.read('v90.sqlite')), 'staged');
  assert.equal(text(await blobs.read('v90.pre-import.sqlite')), 'live');
  await assert.rejects(blobs.rename('yok.sqlite', 'v90.sqlite'), /dosya yok/);
  assert.equal(text(await blobs.read('v90.sqlite')), 'staged', 'başarısız rename hedefe dokunmadı');
  // Görüntü → düz ad (yolu değişir): yükle + kaydet + sil çapraz da çalışır
  await blobs.rename('v90.pre-import.sqlite', 'dump/pre.bin');
  assert.deepEqual(images.names(), ['v90.sqlite']);
  assert.equal(text(await blobs.read('dump/pre.bin')), 'live');
});

// ── EncryptedKvStore

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 1, 2, 3, 4, 5, 6, 7, 8]);
const containsBytes = (hay: Uint8Array, needle: Uint8Array): boolean => Buffer.from(hay).includes(Buffer.from(needle));

test('R93.1 · EncryptedKvStore: düz depoda ne fotoğraf baytı ne düz metin görünür; aynı anahtar çözer', async () => {
  const inner = new InMemoryKvStore();
  const keys = new InMemoryKeyProvider();
  const kv = new EncryptedKvStore(inner, keys);
  const json = '{"importedAtUtc":"2026-09-14T09:00:00.000Z"}';
  await kv.put('photos/a.jpg', JPEG);
  await kv.put('restorePoint', bytes(json));

  const raw = (await inner.get('photos/a.jpg'))!;
  assert.deepEqual(Array.from(raw.subarray(0, 5)), [0x56, 0x39, 0x30, 0x45, 0x01], 'V90E + sürüm 1 (görüntüyle aynı çerçeve)');
  assert.equal(raw.byteLength, 17 + JPEG.byteLength + 16, 'başlık + şifreli metin + etiket');
  assert.equal(containsBytes(raw, JPEG), false, 'fotoğraf sızmadı');
  assert.equal(containsBytes(raw, JPEG.subarray(0, 4)), false, 'JPEG SOI/APP0 işareti sızmadı');
  assert.equal(Buffer.from((await inner.get('restorePoint'))!).includes('importedAtUtc'), false, 'JSON sızmadı');

  assert.deepEqual(await kv.get('photos/a.jpg'), JPEG);
  assert.equal(text((await kv.get('restorePoint'))!), json);
  assert.deepEqual(await kv.keys('photos/'), ['photos/a.jpg'], 'anahtar adları düz');
  assert.equal(await kv.get('yok'), null, 'olmayan anahtar null (hata değil)');

  await kv.put('photos/b.jpg', JPEG);
  assert.notDeepEqual(await inner.get('photos/b.jpg'), raw, 'her yazım yeni IV');
  await kv.delete('photos/a.jpg');
  assert.deepEqual(await inner.keys(''), ['photos/b.jpg', 'restorePoint']);

  // Aynı anahtar: görüntü deposu ile aynı sağlayıcı, ikinci bir anahtar yok.
  const images = new EncryptedImageStore(new InMemoryImageStore(), keys);
  await images.save('v90.sqlite', bytes('SQLite format 3'));
  assert.equal(text((await images.load('v90.sqlite'))!), 'SQLite format 3');
});

test('EncryptedKvStore · boş değer (dizin işareti) gidip gelir; PrefixBlobStore üstünde F1 sırası çalışır', async () => {
  const inner = new InMemoryKvStore();
  const kv = new EncryptedKvStore(inner, new InMemoryKeyProvider());
  await kv.put('photos/', new Uint8Array(0));
  assert.equal((await inner.get('photos/'))!.byteLength, 17 + 16, 'düz depoda başlık + etiket');
  assert.deepEqual(await kv.get('photos/'), new Uint8Array(0));

  const blobs = new PrefixBlobStore(kv);
  await blobs.ensureDir('photos.import');
  await blobs.rename('photos.import', 'photos');
  assert.equal(await blobs.exists('photos'), true);
  assert.deepEqual(await blobs.list('photos'), []);
  assert.deepEqual(await inner.keys(''), ['photos/']);
});

test('R93.5 · EncryptedKvStore: yanlış anahtar, kurcalanmış ve çerçevesiz kayıt → DbOpenError; metinde veri yok', async () => {
  const inner = new InMemoryKvStore();
  const kv = new EncryptedKvStore(inner, new InMemoryKeyProvider());
  await kv.put('photos/a.jpg', JPEG);

  const other = new EncryptedKvStore(inner, new InMemoryKeyProvider());
  await assert.rejects(other.get('photos/a.jpg'), (e: unknown) => {
    assert.ok(e instanceof DbOpenError);
    assert.match(e.message, /kayıt bu anahtarla çözülemedi/);
    assert.equal(e.messageTr, 'Veritabanı açılamadı.');
    assert.equal(containsBytes(bytes(e.message), JPEG.subarray(0, 4)), false);
    return true;
  });

  const raw = (await inner.get('photos/a.jpg'))!;
  raw[raw.byteLength - 1] = raw[raw.byteLength - 1]! ^ 0xff;
  await inner.put('photos/a.jpg', raw);
  await assert.rejects(kv.get('photos/a.jpg'), DbOpenError);

  await inner.put('photos/a.jpg', bytes('düz kayıt'));      // çerçeve değil
  await assert.rejects(kv.get('photos/a.jpg'), DbOpenError);
});

// ── Sekme kilidi

function fakeLocks(grant: boolean): LockManagerLike & { held: boolean; released: boolean } {
  const f = {
    held: false, released: false,
    async request(_name: string, opts: { ifAvailable: boolean }, cb: (lock: object | null) => Promise<unknown> | unknown) {
      assert.equal(opts.ifAvailable, true);              // asla bekleme kuyruğuna girmez
      if (!grant) return cb(null);
      f.held = true;
      const p = Promise.resolve(cb({}));
      p.finally(() => { f.released = true; });
      return p;
    },
  };
  return f;
}

test('tab lock: Web Locks yoksa sessizce geçer', async () => {
  await requestTabLock(undefined);
});

test('tab lock: kilit alınırsa döner ve kilit bırakılmaz', async () => {
  const locks = fakeLocks(true);
  await requestTabLock(locks);
  assert.equal(locks.held, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(locks.released, false);                   // sekme ömrü boyunca tutulur
});

test('tab lock: başka sekme tutuyorsa DbOpenError', async () => {
  await assert.rejects(requestTabLock(fakeLocks(false)), (e: unknown) => {
    assert.ok(e instanceof DbOpenError);
    assert.match(e.message, /başka bir sekmede açık/);
    assert.equal(e.messageTr, 'Veritabanı açılamadı.');
    return true;
  });
});

test('tab lock: request hata verirse hata iletilir', async () => {
  const locks: LockManagerLike = { async request() { throw new Error('SecurityError'); } };
  await assert.rejects(requestTabLock(locks), /SecurityError/);
});
