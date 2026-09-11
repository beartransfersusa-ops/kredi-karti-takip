// DB portları — docs/v90/02-architecture.md §3, §12.
// Domain ve servis katmanı yalnızca bu arayüzleri görür; expo-sqlite/SQLCipher
// ve node:sqlite birer adaptördür.

export interface ExecResult { changes: number }

export interface Tx {
  exec(sql: string, params?: readonly unknown[]): Promise<ExecResult>;
  /** Birden çok ifade; parametre almaz (yalnızca migration/DDL). */
  execScript(sql: string): Promise<void>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface Db extends Tx {
  /** Tek kullanıcı eylemi = tek transaction (03 §0). İç içe çağrı hatadır. */
  withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly path: string;
  readonly isEncrypted: boolean;
}

export interface DatabaseProvider {
  open(): Promise<Db>;
  readonly path: string;
  readonly isEncrypted: boolean;
}

/** İleri-yalnız, idempotent migration (02 §12.1, 03 §2). `down` yoktur. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  /** İçeriği belirleyen SQL/kod; checksum bundan hesaplanır. */
  readonly source: string;
  up(tx: Tx): Promise<void>;
}

/** Migration öncesi dosya yedeği için (02 §12.1 adım 2). */
export interface FileStore {
  exists(path: string): Promise<boolean>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  size(path: string): Promise<number>;
  /** Yazılabilir boş alan (bayt). Bilinmiyorsa null. */
  freeSpace(): Promise<number | null>;
}

export interface SchemaMigrationRow {
  version: number;
  name: string;
  checksum: string;
  applied_at_utc: string;
}
