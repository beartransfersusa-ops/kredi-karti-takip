// Program/oturum domain hataları — docs/v90/02-architecture.md §15.
import { AppError } from '../../core/db/errors.ts';

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super('Bu işlem şu anki durumda yapılamaz.', ['reload'], `geçersiz geçiş: ${from} → ${to}`);
  }
}
export class ProgramNotActiveError extends AppError {
  constructor() { super('Program dondurulmuş. Devam ettirmeden antrenman yapılamaz.', ['reload'], 'program aktif değil'); }
}
export class ProgramNotPausedError extends AppError {
  constructor() { super('Program zaten aktif.', ['reload'], 'program dondurulmuş değil'); }
}
export class ActiveSessionExistsError extends AppError {
  constructor() { super('Devam eden bir antrenmanın var. Önce onu bitir ya da iptal et.', ['reload'], 'aktif oturum mevcut'); }
}
export class SessionNotActiveError extends AppError {
  constructor(id: string) { super('Bu antrenman artık açık değil.', ['reload'], `oturum aktif değil: ${id}`); }
}
export class PendingPartialDecisionError extends AppError {
  constructor() { super('Yarım kalan antrenman için bir karar bekleniyor.', ['reload'], 'karar bekleyen kısmi antrenman var'); }
}
export class InvalidRescheduleDateError extends AppError {
  constructor(key: string) { super('Geçmiş bir güne taşıyamazsın.', ['reload'], `geçersiz tarih: ${key}`); }
}
export class SetAlreadyLoggedError extends AppError {
  constructor() {
    super('Bu harekete set girdin. Değiştirmek yerine yeni hareket olarak ekleyebilirsin.', ['reload'],
      'harekete set loglanmış');
  }
}
export class ValidationError extends AppError {
  constructor(messageTr: string, technical: string) { super(messageTr, ['reload'], technical); }
}
