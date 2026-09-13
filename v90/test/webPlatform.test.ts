// Web platform adaptörleri — docs/v90/02-architecture.md §12.2 (web hedefi), ADR-013.
//
// Tarayıcı olmadan sınanabilen parçalar: PrefixBlobStore (BlobStore'un düz
// anahtar-değer deposu üzerindeki gerçekleştirmesi) ve sekme kilidi mantığı.
// IndexedDB / WebCrypto gerçekleştirmeleri (platform/web/idb.ts, keyProvider.ts)
// yalnızca tarayıcıda koşar; burada InMemoryKvStore ve sahte kilit yöneticisi vardır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKvStore } from '../src/core/backup/KvStore.ts';
import { PrefixBlobStore, normalize } from '../src/core/backup/PrefixBlobStore.ts';
import { DbOpenError } from '../src/core/db/errors.ts';
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

test('ensureDir hiçbir şey yazmaz', async () => {
  const { blobs, kv } = await seeded({});
  await blobs.ensureDir('photos');
  assert.equal(kv.size, 0);
  assert.equal(await blobs.exists('photos'), false);
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

test('normalize: . ve .. çözülür, çift ve sondaki / atılır', () => {
  assert.equal(normalize('photos.pre-import/../restore-point.json'), 'restore-point.json');
  assert.equal(normalize('./photos//a.jpg/'), 'photos/a.jpg');
  assert.equal(normalize('../a'), 'a');                   // kökün üstüne çıkılmaz
  assert.equal(normalize('v90.sqlite'), 'v90.sqlite');
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
