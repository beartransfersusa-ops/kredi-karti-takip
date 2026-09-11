// Hata taksonomisi — docs/v90/02-architecture.md §15.
// Her sınıf kullanıcıya gösterilecek Türkçe mesajı ve önerilen aksiyonları taşır.

export type ErrorAction = 'retry' | 'restoreBackup' | 'exportBackup' | 'freeSpace' | 'reload' | 'contactSupport';

export class AppError extends Error {
  readonly messageTr: string;
  readonly actions: ErrorAction[];
  override readonly cause?: unknown;
  constructor(messageTr: string, actions: ErrorAction[], technical: string, cause?: unknown) {
    super(technical);
    this.name = new.target.name;
    this.messageTr = messageTr;
    this.actions = actions;
    this.cause = cause;
  }
}

export class DbOpenError extends AppError {
  constructor(technical: string, cause?: unknown) {
    super('Veritabanı açılamadı.', ['retry', 'restoreBackup', 'contactSupport'], technical, cause);
  }
}

/** Checksum/sürüm uyuşmazlığı — kullanıcıya DbOpenError ekranı gösterilir (02 §12.1). */
export class DbIntegrityError extends AppError {
  constructor(technical: string, cause?: unknown) {
    super('Veritabanı bütünlüğü doğrulanamadı.', ['retry', 'restoreBackup', 'contactSupport'], technical, cause);
  }
}

export class MigrationFailedError extends AppError {
  readonly version: number;
  readonly restored: boolean;
  constructor(version: number, restored: boolean, technical: string, cause?: unknown) {
    super('Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene.',
      ['retry', 'exportBackup'], technical, cause);
    this.version = version;
    this.restored = restored;
  }
}

export class InsufficientSpaceError extends AppError {
  constructor(needBytes: number, freeBytes: number) {
    super('Alan yetersiz. Güncelleme için cihazında yer açman gerekiyor.', ['freeSpace', 'retry'],
      `yedek için ${needBytes} bayt gerekli, ${freeBytes} bayt boş`);
  }
}

export class DbWriteError extends AppError {
  constructor(technical: string, cause?: unknown) {
    super('Kaydedilemedi. Boş alanı kontrol edip tekrar dene.', ['retry'], technical, cause);
  }
}
