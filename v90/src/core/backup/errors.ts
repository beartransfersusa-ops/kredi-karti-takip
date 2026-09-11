import { AppError } from '../db/errors.ts';

export class BackupExportError extends AppError {
  constructor(technical: string, cause?: unknown) {
    super('Yedek oluşturulamadı.', ['retry'], technical, cause);
  }
}

/** R95.7: import başarısız olduğunda mevcut veri ASLA değişmez. */
export class BackupImportError extends AppError {
  readonly stage: string;
  constructor(stage: string, messageTr: string, technical: string, cause?: unknown) {
    super(messageTr, ['retry'], technical, cause);
    this.stage = stage;
  }
}

export const importFailed = (stage: string, technical: string, cause?: unknown) =>
  new BackupImportError(stage, 'İçe aktarma başarısız; mevcut verin değişmedi.', technical, cause);
