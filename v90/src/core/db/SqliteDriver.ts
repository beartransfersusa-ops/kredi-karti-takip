// SQLite sürücü portu — docs/v90/02-architecture.md §2.1, §12.2.
//
// Tek bir DatabaseProvider dört sürücüyle çalışır:
//   expoSqlite      → production, iOS/Android (SQLCipher, şifreli)
//   sqlJs           → production, web (bellek içi; görüntü depoda AES-GCM ile
//                     şifrelenir — SQLCipher DEĞİLDİR, ADR-013)
//   sqlcipherNode   → test (gerçek şifrelemeyi doğrular)
//   nodeSqlite      → test/geliştirme (şifresiz, hızlı)
// Böylece şifreli yol yalnızca cihazda değil, CI'da da test edilir.

export interface SqliteConnection {
  exec(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  execScript(sql: string): Promise<void>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
  /**
   * Bellek içi motorlar (sql.js) görüntüyü kalıcı depoya yazar; sağlayıcı
   * bunu her başarılı COMMIT'ten ve transaction dışı her yazmadan sonra
   * çağırır. Dosya tabanlı sürücüler (SQLite dosyaya kendisi yazar)
   * uygulamaz.
   */
  persist?(): Promise<void>;
}

export interface SqliteDriver {
  readonly name: string;
  /** SQLCipher derlenmiş mi? `PRAGMA key` yalnızca true ise anlamlıdır. */
  readonly supportsEncryption: boolean;
  /**
   * Sürücü/depo dosyayı SQLite'ın DIŞINDA şifreliyor (ör. web'de AES-GCM
   * görüntü). SQLCipher'ın yerini TUTMAZ: böyle bir sürücüye `PRAGMA key`
   * hiçbir zaman gönderilmez; sağlayıcının `isEncrypted` bayrağı yalnızca
   * depo gerçekten şifreliyorsa true olur (R93.4 dürüstlük).
   */
  readonly encryptsAtRest?: boolean;
  open(path: string): Promise<SqliteConnection>;
}
