// expo-sqlite sürücüsü — PRODUCTION.
//
// SQLCipher, app.config.ts içindeki config plugin ile derlenir:
//   ['expo-sqlite', { useSQLCipher: true }]
// Bu, Expo Go'da ÇALIŞMAZ; Development Build / prebuild zorunludur (R93.4).

import type { SqliteConnection, SqliteDriver } from '../SqliteDriver.ts';

class Conn implements SqliteConnection {
  readonly #db: import('expo-sqlite').SQLiteDatabase;
  constructor(db: import('expo-sqlite').SQLiteDatabase) { this.#db = db; }
  async exec(sql: string, params: readonly unknown[] = []) {
    const r = await this.#db.runAsync(sql, params);
    return { changes: r.changes };
  }
  async execScript(sql: string) { await this.#db.execAsync(sql); }
  async get<T>(sql: string, params: readonly unknown[] = []) {
    return (await this.#db.getFirstAsync<T>(sql, params)) ?? undefined;
  }
  async all<T>(sql: string, params: readonly unknown[] = []) {
    return this.#db.getAllAsync<T>(sql, params);
  }
  async close() { await this.#db.closeAsync(); }
}

export const expoSqliteDriver: SqliteDriver = {
  name: 'expo-sqlite',
  supportsEncryption: true,
  async open(path) {
    const { openDatabaseAsync } = await import('expo-sqlite');
    return new Conn(await openDatabaseAsync(path));
  },
};
