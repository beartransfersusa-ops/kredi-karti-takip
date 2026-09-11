// SQLite sürücü portu — docs/v90/02-architecture.md §2.1, §12.2.
//
// Tek bir DatabaseProvider üç sürücüyle çalışır:
//   expoSqlite      → production (SQLCipher, şifreli)
//   sqlcipherNode   → test (gerçek şifrelemeyi doğrular)
//   nodeSqlite      → test/geliştirme (şifresiz, hızlı)
// Böylece şifreli yol yalnızca cihazda değil, CI'da da test edilir.

export interface SqliteConnection {
  exec(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  execScript(sql: string): Promise<void>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface SqliteDriver {
  readonly name: string;
  /** SQLCipher derlenmiş mi? `PRAGMA key` yalnızca true ise anlamlıdır. */
  readonly supportsEncryption: boolean;
  open(path: string): Promise<SqliteConnection>;
}
