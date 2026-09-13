// Cihaz saati — docs/v90/02-architecture.md §5 (R112).
//
// Tüm tarih hesapları BURADAN geçer; ekranlarda `new Date()` yoktur.
// Saat dilimi her çağrıda okunur: kullanıcı uçakta tz değiştirdiğinde
// bir sonraki hesap yeni tz ile yapılır (R112.4).
import { localDateKey } from '../core/clock/dateKey.ts';
import type { Clock } from '../core/clock/dateKey.ts';
import type { DateKey } from '../domain/types.ts';

export class DeviceClock implements Clock {
  nowUtc(): Date { return new Date(); }
  timeZone(): string {
    // Intl her RN sürümünde hazır; değilse UTC'ye düşmek sessiz yanlış
    // tarihten iyidir ve kullanıcıya Program Ayarları'nda gösterilir.
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }
  todayKey(): DateKey { return localDateKey(this.nowUtc(), this.timeZone()); }
}
