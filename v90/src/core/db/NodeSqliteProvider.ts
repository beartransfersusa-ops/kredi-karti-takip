// node:sqlite adaptörü — test ve geliştirme aracı.
// Production'da EncryptedSqliteProvider (expo-sqlite + SQLCipher) kullanılır (02 §2.1, §12.2);
// ikisi de aynı Db portunu uygular, bu yüzden domain kodu ikisini ayırt etmez.

import { DatabaseSync } from 'node:sqlite';
import type { Db, DatabaseProvider, ExecResult, Tx } from './types.ts';

class NodeTx implements Tx {
  protected readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  async exec(sql: string, params: readonly unknown[] = []): Promise<ExecResult> {
    const st = this.db.prepare(sql);
    const r = st.run(...(params as never[]));
    return { changes: Number(r.changes) };
  }
  async execScript(sql: string): Promise<void> { this.db.exec(sql); }
  async get<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }
}

class NodeDb extends NodeTx implements Db {
  readonly path: string;
  readonly isEncrypted = false;
  #inTx = false;

  constructor(db: DatabaseSync, path: string) { super(db); this.path = path; }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (this.#inTx) throw new Error('iç içe transaction desteklenmiyor (02 §3)');
    this.#inTx = true;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = await fn(this);
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* zaten kapalı */ }
      throw e;
    } finally {
      this.#inTx = false;
    }
  }

  async close(): Promise<void> { this.db.close(); }
}

export class NodeSqliteProvider implements DatabaseProvider {
  readonly path: string;
  readonly isEncrypted = false;
  constructor(path = ':memory:') { this.path = path; }

  async open(): Promise<Db> {
    const db = new DatabaseSync(this.path);
    // 02 §7.1 dayanıklılık: WAL + FULL fsync. Bellek içi DB'de WAL yok sayılır.
    if (this.path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA foreign_keys = ON');
    return new NodeDb(db, this.path);
  }
}
