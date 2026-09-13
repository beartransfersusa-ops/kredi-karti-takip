// Tek bağlantı = tek sıra — src/core/db/SqliteDatabaseProvider.ts (02 §3).
//
// Eşzamanlı withTransaction çağrıları (iki ekranın aynı anda okuması, komut +
// yeniden okuma, sekmeye dönüşte yinelenen sorgu) hata değil SIRA demektir;
// iç içe çağrı ise kendini bekler ve eşikte açık hatayla çıkar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function openCounter(lockTimeoutMs = 300) {
  const db = await new NodeSqliteProvider(':memory:', { lockTimeoutMs }).open();
  await db.execScript('CREATE TABLE c (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL); INSERT INTO c VALUES (1, 0)');
  return db;
}

test('02 §3 · eşzamanlı transaction\'lar sıraya girer, hiçbiri kaybolmaz', async () => {
  const db = await openCounter();
  const N = 25;
  await Promise.all(Array.from({ length: N }, () => db.withTransaction(async (tx) => {
    const { n } = (await tx.get<{ n: number }>('SELECT n FROM c WHERE id = 1'))!;
    await sleep(1);                                        // araya girme fırsatı
    await tx.exec('UPDATE c SET n = ? WHERE id = 1', [n + 1]);
  })));
  assert.equal((await db.get<{ n: number }>('SELECT n FROM c WHERE id = 1'))!.n, N);
  await db.close();
});

test('02 §3 · iç içe çağrı eşikte açık hatayla çıkar; kilit serbest kalır', async () => {
  const db = await openCounter(150);
  await assert.rejects(
    db.withTransaction(async () => {
      await db.withTransaction(async () => { /* kendini bekler */ });
    }),
    /iç içe çağrı olabilir/,
  );
  // Dış transaction geri alındı, kilit bırakıldı: sonraki çağrı normal çalışır.
  await db.withTransaction((tx) => tx.exec('UPDATE c SET n = 7 WHERE id = 1'));
  assert.equal((await db.get<{ n: number }>('SELECT n FROM c WHERE id = 1'))!.n, 7);
  await db.close();
});

test('02 §3 · transaction dışı okuma açık transaction\'ın ORTASINA düşmez', async () => {
  const db = await openCounter();
  const writing = db.withTransaction(async (tx) => {
    await tx.exec('UPDATE c SET n = 1 WHERE id = 1');
    await sleep(30);
    await tx.exec('UPDATE c SET n = 2 WHERE id = 1');
  });
  await sleep(5);                                          // transaction açıkken oku
  const seen = (await db.get<{ n: number }>('SELECT n FROM c WHERE id = 1'))!.n;
  await writing;
  assert.equal(seen, 2, 'okuma COMMIT\'i bekledi; yarım durumu (1) görmedi');
  await db.close();
});

test('02 §3 · başarısız transaction kilidi bırakır, sıradaki çalışır', async () => {
  const db = await openCounter();
  const failing = db.withTransaction(async (tx) => {
    await tx.exec('UPDATE c SET n = 99 WHERE id = 1');
    throw new Error('iş kuralı');
  }).catch((e: Error) => e.message);
  const next = db.withTransaction((tx) => tx.exec('UPDATE c SET n = 5 WHERE id = 1'));
  assert.equal(await failing, 'iş kuralı');
  await next;
  assert.equal((await db.get<{ n: number }>('SELECT n FROM c WHERE id = 1'))!.n, 5, 'geri alma sonrası sıradaki yazdı');
  await db.close();
});

test('02 §3 · close() açık transaction\'ı bekler', async () => {
  const db = await openCounter();
  let finished = false;
  const tx = db.withTransaction(async (t) => { await sleep(20); await t.exec('UPDATE c SET n = 3 WHERE id = 1'); finished = true; });
  await db.close();
  assert.equal(finished, true, 'close, transaction bitmeden dönmedi');
  await tx;
});
