// Şifreli veritabanı sağlayıcısı — §93, docs/v90/02-architecture.md §2.1/§12.2, ADR-002.
//
// Bu dosya şifrelemenin "yapılandırıldığını" değil, GERÇEKTEN ÇALIŞTIĞINI
// doğrular: diskteki baytlara bakar, yanlış anahtarla açmayı dener ve anahtarın
// hiçbir hata mesajına / yedeğe sızmadığını gösterir.
//
// Production'da expo-sqlite (SQLCipher) kullanılır; burada aynı sağlayıcı
// @journeyapps/sqlcipher sürücüsüyle koşar, böylece şifreli yol CI'da da test
// edilir (SqliteDriver portunun varlık sebebi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner, backupPathFor } from '../src/core/db/MigrationRunner.ts';
import { MIGRATIONS, hasColumn } from '../src/core/db/migrations/index.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256, nodeSha256Bytes } from '../src/core/db/hash.ts';
import { DbOpenError } from '../src/core/db/errors.ts';
import type { Db, Migration } from '../src/core/db/types.ts';

import { EncryptedSqliteProvider } from '../src/core/db/EncryptedSqliteProvider.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { EncryptionUnsupportedError, SqliteDatabaseProvider } from '../src/core/db/SqliteDatabaseProvider.ts';
import { sqlcipherNodeDriver } from '../src/core/db/drivers/sqlcipherNode.ts';
import { nodeSqliteDriver } from '../src/core/db/drivers/nodeSqlite.ts';
import {
  DB_KEY_ID, DbKeyError, DbKeyManager, KeyUnavailableError, defaultRandomBytes, isValidKey,
} from '../src/core/db/keys/DbKeyManager.ts';
import { InMemorySecureStore } from '../src/core/db/keys/SecureStore.ts';
import type { SecureStore } from '../src/core/db/keys/SecureStore.ts';
import { InsecureBuildError, assertEncryptedProviderInProduction, warnIfUnencrypted } from '../src/core/db/buildGuard.ts';

import { NodeArchiver, fromUtf8 } from '../src/core/backup/archive.ts';
import { BackupExporter } from '../src/core/backup/BackupExporter.ts';

const SECRET = 'kan-degeri-88-hemoglobin';
const CLOCK = () => new FakeClock('2026-09-07T05:00:00.000Z');

function tempDir(): { dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'v90-enc-'));
  return { dir, path: join(dir, 'v90.sqlite'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Bir dizindeki HİÇBİR dosyada aranan metin geçmemeli (WAL/SHM dahil). */
function filesContaining(dir: string, needle: string): string[] {
  const probe = Buffer.from(needle, 'utf8');
  return readdirSync(dir).filter((f) => readFileSync(join(dir, f)).includes(probe));
}

function encrypted(path: string, store: InMemorySecureStore): EncryptedSqliteProvider {
  return new EncryptedSqliteProvider({ path, driver: sqlcipherNodeDriver, secureStore: store });
}

async function writeSecret(db: Db): Promise<void> {
  await db.execScript('CREATE TABLE IF NOT EXISTS labs (id INTEGER PRIMARY KEY, note TEXT)');
  await db.exec('INSERT INTO labs (note) VALUES (?)', [SECRET]);
}

/** Hata zincirinin tamamını (mesaj + cause + stack) tek metne indirger. */
function errorText(e: unknown): string {
  let out = '';
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur instanceof Error; i++) {
    out += `${cur.name}|${cur.message}|${cur.stack ?? ''}|${JSON.stringify(cur)}\n`;
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

// ─────────────────────────────────────────────── R93.2 · dosya gerçekten şifreli

test('R93.2 · şifreli DB dosyası düz metin sızdırmıyor', async () => {
  const { dir, path, cleanup } = tempDir();
  try {
    const db = await encrypted(path, new InMemorySecureStore()).open();
    await writeSecret(db);
    await db.close();

    const header = readFileSync(path).subarray(0, 16).toString('latin1');
    assert.ok(!header.startsWith('SQLite format 3'),
      `şifreli dosya standart SQLite başlığı taşımamalı, bulundu: ${JSON.stringify(header)}`);
    assert.deepEqual(filesContaining(dir, SECRET), [], 'hassas değer diskte düz metin duruyor');
    assert.deepEqual(filesContaining(dir, 'labs'), [], 'tablo adı bile düz metin olmamalı');
  } finally { cleanup(); }
});

test('test sürücüsü gerçekten SQLCipher (cipher_version dolu)', async () => {
  const { path, cleanup } = tempDir();
  try {
    const db = await encrypted(path, new InMemorySecureStore()).open();
    const row = await db.get<Record<string, string>>('PRAGMA cipher_version');
    await db.close();
    const version = row && Object.values(row)[0];
    assert.ok(version, 'cipher_version boş — sürücü düz SQLite olabilir');
    // ADR-002: sürüm CI çıktısında görünür olmalı (expo-sqlite ile karşılaştırma için).
    console.log(`      SQLCipher sürümü: ${version}`);
  } finally { cleanup(); }
});

test('kontrol · şifresiz sağlayıcı aynı veriyi düz metin yazıyor (test boş koşmuyor)', async () => {
  const { dir, path, cleanup } = tempDir();
  try {
    const provider = new NodeSqliteProvider(path);
    assert.equal(provider.isEncrypted, false);
    const db = await provider.open();
    await writeSecret(db);
    await db.close();

    assert.ok(readFileSync(path).subarray(0, 15).toString('latin1') === 'SQLite format 3');
    assert.ok(filesContaining(dir, SECRET).length > 0,
      'şifresiz yol sızdırmıyorsa yukarıdaki şifreli testi kanıt değildir');
  } finally { cleanup(); }
});

test('aynı anahtar · kapat-aç sonrası veri geri geliyor', async () => {
  const { path, cleanup } = tempDir();
  try {
    const store = new InMemorySecureStore();
    const first = await encrypted(path, store).open();
    assert.equal(first.isEncrypted, true);
    await writeSecret(first);
    await first.close();

    assert.equal(store.size, 1, 'anahtar güvenli depoda tek kayıt olmalı');

    const second = await encrypted(path, store).open();
    const row = await second.get<{ note: string }>('SELECT note FROM labs');
    assert.equal(row?.note, SECRET);
    await second.close();
  } finally { cleanup(); }
});

test('yanlış anahtar · açılış reddediliyor, veri sızmıyor', async () => {
  const { path, cleanup } = tempDir();
  try {
    const db = await encrypted(path, new InMemorySecureStore()).open();
    await writeSecret(db);
    await db.close();

    // Yeni (boş) güvenli depo = başka bir rastgele anahtar.
    const other = new InMemorySecureStore();
    const err = await encrypted(path, other).open().then(
      () => null, (e: unknown) => e);

    assert.ok(err instanceof DbOpenError, `DbOpenError bekleniyordu, gelen: ${err}`);
    assert.match((err as Error).message, /bu anahtarla açılamadı/);
    assert.ok(!errorText(err).includes(SECRET), 'hata mesajı veri sızdırmamalı');
  } finally { cleanup(); }
});

// ─────────────────────────────────────────── R93.5 / R118.2 · anahtar hiç sızmıyor

test('R93.5 · anahtar hata mesajlarına ve stack trace\'e girmiyor', async () => {
  const { path, cleanup } = tempDir();
  try {
    const store = new InMemorySecureStore();
    const db = await encrypted(path, store).open();
    await writeSecret(db);
    await db.close();
    const key = await new DbKeyManager({ secureStore: store }).getOrCreate();

    // 1) Başarılı yolda üretilen hatalar (bozuk SQL) anahtarı taşımamalı.
    const open = await encrypted(path, store).open();
    const sqlErr = await open.exec('SELECT * FROM yok_boyle_tablo').then(() => null, (e: unknown) => e);
    await open.close();
    assert.ok(sqlErr, 'hatalı SQL hata vermeli');
    assert.ok(!errorText(sqlErr).includes(key), 'SQL hatası anahtarı taşıyor');

    // 2) Başarısız açılış yolunda da sızmamalı.
    const wrong = new InMemorySecureStore();
    const openErr = await encrypted(path, wrong).open().then(() => null, (e: unknown) => e);
    const wrongKey = await new DbKeyManager({ secureStore: wrong }).getOrCreate();
    const text = errorText(openErr);
    assert.ok(!text.includes(key) && !text.includes(wrongKey), 'açılış hatası anahtarı taşıyor');
  } finally { cleanup(); }
});

test('R118.2 · anahtar dışa aktarılan yedeğin içinde yok', async () => {
  const { path, cleanup } = tempDir();
  try {
    const store = new InMemorySecureStore();
    const clock = CLOCK();
    const { db } = await new MigrationRunner({
      provider: encrypted(path, store), files: new NodeFileStore(), clock, hash: nodeSha256,
    }).run();
    const now = clock.nowUtc().toISOString();
    await db.exec(
      `INSERT INTO profiles (id, display_name, height_cm, created_at_utc, updated_at_utc, onboarding_completed)
       VALUES ('p1',?,187,?,?,1)`, [SECRET, now, now]);

    const { zip } = await new BackupExporter({
      db, clock, hash: nodeSha256, hashBytes: nodeSha256Bytes,
      archiver: new NodeArchiver(), appVersion: '0.1.0',
    }).export();
    await db.close();

    const key = await new DbKeyManager({ secureStore: store }).getOrCreate();
    const raw = Buffer.from(zip);
    assert.ok(!raw.includes(Buffer.from(key, 'utf8')), 'anahtar yedeğe sızmış');
    assert.ok(!raw.includes(Buffer.from(key, 'hex')), 'anahtar yedeğe ham bayt olarak sızmış');

    // Sıkıştırılmış içeriği de aç: anahtar deflate'in arkasına saklanmış olabilir.
    const entries = await new NodeArchiver().read(zip);
    assert.ok(entries.length > 0);
    for (const e of entries) {
      assert.ok(!Buffer.from(e.data).includes(Buffer.from(key, 'utf8')), `anahtar ${e.path} içinde`);
      assert.ok(!Buffer.from(e.data).includes(Buffer.from(key, 'hex')), `anahtar ${e.path} içinde (ham)`);
    }
    // ADR-002 doğrulama tablosu: `dbkey` anahtar adı bile yedekte geçmemeli.
    for (const e of entries) {
      assert.ok(!fromUtf8(e.data).includes('dbkey'), `'dbkey' ${e.path} içinde`);
    }
    // Test boş koşmasın: yedek gerçekten kullanıcı verisini taşıyor olmalı.
    const data = entries.find((e) => e.path === 'data.json');
    assert.ok(data && fromUtf8(data.data).includes(SECRET), 'yedek kullanıcı verisini taşımalı');
  } finally { cleanup(); }
});

// ─────────────────────────────────────────────────────────── DbKeyManager

test('DbKeyManager · 64 haneli hex üretir ve sabit kalır', async () => {
  const store = new InMemorySecureStore();
  const mgr = new DbKeyManager({ secureStore: store });

  assert.equal(await mgr.exists(), false);
  const k1 = await mgr.getOrCreate();
  assert.equal(k1.length, 64);
  assert.match(k1, /^[0-9a-f]{64}$/);
  assert.ok(isValidKey(k1));
  assert.equal(await mgr.exists(), true);
  assert.equal(await mgr.getOrCreate(), k1, 'ikinci çağrı yeni anahtar üretmemeli');

  // Bağımsız iki kurulum aynı anahtarı üretmemeli.
  const k2 = await new DbKeyManager({ secureStore: new InMemorySecureStore() }).getOrCreate();
  assert.notEqual(k2, k1);
});

test('DbKeyManager · destroy anahtarı siler (tüm verimi sil akışı)', async () => {
  const store = new InMemorySecureStore();
  const mgr = new DbKeyManager({ secureStore: store });
  const k1 = await mgr.getOrCreate();
  await mgr.destroy();
  assert.equal(await mgr.exists(), false);
  assert.equal(store.size, 0);
  assert.notEqual(await mgr.getOrCreate(), k1, 'silinen anahtar geri gelmemeli');
});

test('ADR-002 · güvenli depo okunamıyorsa YENİ anahtar üretilmez', async () => {
  // iOS: ilk kilit açılmadan Keychain erişilemez. Yeni anahtar üretmek mevcut
  // şifreli veritabanını kalıcı olarak açılamaz hale getirirdi.
  const throwing: SecureStore = {
    get: async () => { throw new Error('protected data unavailable'); },
    set: async () => { throw new Error('yazılmamalı'); },
    remove: async () => {},
  };
  await assert.rejects(
    () => new DbKeyManager({ secureStore: throwing }).getOrCreate(),
    KeyUnavailableError);

  // Depo boş ama şifreli DB dosyası duruyor → yine üretilmez.
  const store = new InMemorySecureStore();
  const mgr = new DbKeyManager({ secureStore: store, dbExists: async () => true });
  await assert.rejects(() => mgr.getOrCreate(), KeyUnavailableError);
  assert.equal(store.size, 0, 'reddedilen yolda anahtar yazılmamalı');

  // Gerçekten ilk kurulum (DB yok) → üretilir.
  const fresh = new DbKeyManager({ secureStore: store, dbExists: async () => false });
  assert.match(await fresh.getOrCreate(), /^[0-9a-f]{64}$/);
});

test('ADR-002 · kilitli cihaz senaryosu mevcut veriyi kilitlemiyor', async () => {
  const { path, cleanup } = tempDir();
  try {
    const files = new NodeFileStore();
    const store = new InMemorySecureStore();
    const make = () => new EncryptedSqliteProvider({
      path, driver: sqlcipherNodeDriver, secureStore: store,
      fileExists: (p) => files.exists(p),
    });

    const db = await make().open();
    await writeSecret(db);
    await db.close();

    // Anahtar geçici olarak "okunamaz" oluyor (cihaz kilitli gibi).
    const saved = (await store.get(DB_KEY_ID))!;
    await store.remove(DB_KEY_ID);
    await assert.rejects(() => make().open(), KeyUnavailableError,
      'anahtar yokken sessizce yeni anahtar üretip DB\'yi kilitlememeli');

    // Kilit açılınca aynı anahtarla veri yerinde.
    await store.set(DB_KEY_ID, saved);
    const again = await make().open();
    assert.equal((await again.get<{ note: string }>('SELECT note FROM labs'))?.note, SECRET);
    await again.close();
  } finally { cleanup(); }
});

test('defaultRandomBytes · Node\'da 32 bayt üretir ve tekrar etmez', async () => {
  const a = await defaultRandomBytes(32);
  const b = await defaultRandomBytes(32);
  assert.equal(a.length, 32);
  assert.notDeepEqual([...a], [...b]);
  assert.ok(!a.every((x) => x === 0));
});

test('DbKeyManager · bozuk kayıt reddedilir ve mesaja yazılmaz', async () => {
  const store = new InMemorySecureStore();
  await store.set('v90.dbkey', 'GIZLI-BOZUK-ANAHTAR');
  const err = await new DbKeyManager({ secureStore: store }).getOrCreate()
    .then(() => null, (e: unknown) => e);
  assert.ok(err instanceof DbKeyError);
  assert.ok(!errorText(err).includes('GIZLI-BOZUK-ANAHTAR'), 'geçersiz anahtar mesaja yazılmış');
  assert.match((err as Error).message, /uzunluk 19/);

  // Büyük harfli hex de reddedilir: PRAGMA key metni birebir eşleşmelidir.
  assert.equal(isValidKey('A'.repeat(64)), false);
  assert.equal(isValidKey('a'.repeat(63)), false);
  assert.equal(isValidKey('a'.repeat(64)), true);
});

test('DbKeyManager · bozuk rastgele üretici sessizce kabul edilmez', async () => {
  const zeros = new DbKeyManager({
    secureStore: new InMemorySecureStore(), randomBytes: () => new Uint8Array(32),
  });
  await assert.rejects(() => zeros.getOrCreate(), DbKeyError);

  const short = new DbKeyManager({
    secureStore: new InMemorySecureStore(), randomBytes: () => new Uint8Array(8),
  });
  await assert.rejects(() => short.getOrCreate(), DbKeyError);
});

// ──────────────────────────────────────────────── R93.3 / R93.7 · yanlış kurulum

test('R93.3 · şifreleme desteklemeyen sürücü anahtarla eşleştirilemez', () => {
  assert.throws(
    () => new SqliteDatabaseProvider({
      driver: nodeSqliteDriver, path: ':memory:',
      keyManager: new DbKeyManager({ secureStore: new InMemorySecureStore() }),
    }),
    EncryptionUnsupportedError,
    'node:sqlite anahtar aldığında sessizce ŞİFRESİZ açmamalı',
  );
});

test('R93.7 · production şifresiz sağlayıcıyla veya Expo Go ile başlamıyor', () => {
  const enc = { isEncrypted: true };
  const plain = { isEncrypted: false };

  assert.throws(() => assertEncryptedProviderInProduction(plain, { isProduction: true, isExpoGo: false }),
    InsecureBuildError);
  assert.throws(() => assertEncryptedProviderInProduction(enc, { isProduction: true, isExpoGo: true }),
    InsecureBuildError, 'R93.4 · Expo Go uğruna şifrelemeden vazgeçilmez');
  assert.doesNotThrow(() => assertEncryptedProviderInProduction(enc, { isProduction: true, isExpoGo: false }));
  // Geliştirmede şifresiz çalışmak serbest ama uyarılı.
  assert.doesNotThrow(() => assertEncryptedProviderInProduction(plain, { isProduction: false, isExpoGo: true }));

  const warnings: string[] = [];
  warnIfUnencrypted(plain, { isProduction: false, isExpoGo: true }, (m) => warnings.push(m));
  warnIfUnencrypted(enc, { isProduction: false, isExpoGo: false }, (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /ŞİFRESİZ/);
});

test('InsecureBuildError kullanıcıya anlaşılır mesaj verir, teknik detayı ayırır', () => {
  const e = new InsecureBuildError('teknik ayrıntı (R93.7)');
  assert.match(e.messageTr, /güvenli veritabanı/);
  assert.ok(!e.messageTr.includes('R93'), 'kullanıcıya requirement kodu gösterilmez');
  assert.equal(e.message, 'teknik ayrıntı (R93.7)', 'teknik metin log için ayrı durur');
  assert.deepEqual(e.actions, ['contactSupport']);
});

// ───────────────────────────────────────── 02 §12.2 · migration şifreli yolda da çalışır

test('şifreli DB üzerinde migration çalışıyor ve yedeği de şifreli', async () => {
  const { dir, path, cleanup } = tempDir();
  try {
    const store = new InMemorySecureStore();
    const files = new NodeFileStore();
    const m1 = MIGRATIONS[0]!;
    const m2: Migration = {
      version: 2, name: '002_test',
      source: 'ALTER TABLE profiles ADD COLUMN notlar TEXT',
      up: async (tx) => {
        if (!(await hasColumn(tx, 'profiles', 'notlar'))) {
          await tx.execScript('ALTER TABLE profiles ADD COLUMN notlar TEXT');
        }
      },
    };
    const run = (migrations: readonly Migration[]) => new MigrationRunner({
      provider: encrypted(path, store), files, clock: CLOCK(), hash: nodeSha256, migrations,
    }).run();

    const first = await run([m1]);
    assert.equal(first.backupPath, null, 'yeni kurulumda yedek alınmaz');
    const now = '2026-09-07T05:00:00.000Z';
    await first.db.exec(
      `INSERT INTO profiles (id, display_name, height_cm, created_at_utc, updated_at_utc, onboarding_completed)
       VALUES ('p1',?,187,?,?,1)`, [SECRET, now, now]);
    await first.db.close();

    const second = await run([m1, m2]);
    assert.deepEqual(second.applied, [2]);
    assert.equal(second.backupPath, backupPathFor(path, 1), 'bekleyen migration öncesi yedek alınmalı');
    const row = await second.db.get<{ display_name: string; notlar: string | null }>(
      'SELECT display_name, notlar FROM profiles WHERE id = ?', ['p1']);
    assert.equal(row?.display_name, SECRET, 'AT-16 · eski veri korunmalı');
    assert.equal(row?.notlar, null);
    await second.db.close();

    // Migration yedeği ham dosya kopyasıdır → o da şifreli olmalı.
    assert.ok(await files.exists(second.backupPath!));
    assert.deepEqual(filesContaining(dir, SECRET), [], 'migration yedeği düz metin sızdırıyor');
  } finally { cleanup(); }
});
