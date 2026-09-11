// node:sqlite sürücüsü — test ve geliştirme. Şifreleme DESTEKLEMEZ.
import { DatabaseSync } from 'node:sqlite';
import type { SqliteConnection, SqliteDriver } from '../SqliteDriver.ts';

class Conn implements SqliteConnection {
  readonly #db: DatabaseSync;
  constructor(db: DatabaseSync) { this.#db = db; }
  async exec(sql: string, params: readonly unknown[] = []) {
    const r = this.#db.prepare(sql).run(...(params as never[]));
    return { changes: Number(r.changes) };
  }
  async execScript(sql: string) { this.#db.exec(sql); }
  async get<T>(sql: string, params: readonly unknown[] = []) {
    return this.#db.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async all<T>(sql: string, params: readonly unknown[] = []) {
    return this.#db.prepare(sql).all(...(params as never[])) as T[];
  }
  async close() { this.#db.close(); }
}

export const nodeSqliteDriver: SqliteDriver = {
  name: 'node:sqlite',
  supportsEncryption: false,
  async open(path) { return new Conn(new DatabaseSync(path)); },
};
