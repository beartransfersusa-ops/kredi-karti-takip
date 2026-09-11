// @journeyapps/sqlcipher sürücüsü — YALNIZCA TEST.
//
// Varlık sebebi: şifreli yolu CI'da gerçekten çalıştırmak. Production'da
// expoSqlite sürücüsü kullanılır; ikisi de aynı SqliteDriver portunu uygular,
// bu yüzden aradaki tek fark bağlantıyı kimin açtığıdır.

import type { SqliteConnection, SqliteDriver } from '../SqliteDriver.ts';

interface Sqlite3Db {
  run(sql: string, params: unknown[], cb: (err: Error | null) => void): void;
  get(sql: string, params: unknown[], cb: (err: Error | null, row?: unknown) => void): void;
  all(sql: string, params: unknown[], cb: (err: Error | null, rows?: unknown[]) => void): void;
  exec(sql: string, cb: (err: Error | null) => void): void;
  close(cb: (err: Error | null) => void): void;
}

const promisify = <T>(fn: (cb: (e: Error | null, v?: T) => void) => void): Promise<T | undefined> =>
  new Promise((resolve, reject) => fn((e, v) => (e ? reject(e) : resolve(v))));

class Conn implements SqliteConnection {
  readonly #db: Sqlite3Db;
  #changes = 0;
  constructor(db: Sqlite3Db) { this.#db = db; }

  async exec(sql: string, params: readonly unknown[] = []) {
    const db = this.#db;
    const self = this;
    await new Promise<void>((resolve, reject) => {
      db.run(sql, [...params], function (this: { changes?: number }, e: Error | null) {
        if (e) reject(e); else { self.#changes = this?.changes ?? 0; resolve(); }
      } as never);
    });
    return { changes: this.#changes };
  }
  async execScript(sql: string) { await promisify<void>((cb) => this.#db.exec(sql, cb)); }
  async get<T>(sql: string, params: readonly unknown[] = []) {
    return (await promisify<unknown>((cb) => this.#db.get(sql, [...params], cb))) as T | undefined;
  }
  async all<T>(sql: string, params: readonly unknown[] = []) {
    return ((await promisify<unknown[]>((cb) => this.#db.all(sql, [...params], cb))) ?? []) as T[];
  }
  async close() { await promisify<void>((cb) => this.#db.close(cb)); }
}

export const sqlcipherNodeDriver: SqliteDriver = {
  name: '@journeyapps/sqlcipher',
  supportsEncryption: true,
  async open(path) {
    const mod = await import('@journeyapps/sqlcipher');
    const sqlite3 = (mod as unknown as { default?: { Database: new (p: string) => Sqlite3Db } }).default
      ?? (mod as unknown as { Database: new (p: string) => Sqlite3Db });
    return new Conn(new sqlite3.Database(path));
  },
};
