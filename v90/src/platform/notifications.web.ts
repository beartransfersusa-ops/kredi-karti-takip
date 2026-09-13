// Yerel bildirim planlayıcı — WEB: yok (docs/v90/02-architecture.md §7.2, R91.5).
//
// Tarayıcıda sekme arka plandayken zamanlanmış bildirim güvenilir değildir;
// hiç planlanmaz. Dinlenme sayacı bundan ETKİLENMEZ: kalan süre her zaman
// `rest_started_at_utc + rest_duration_seconds` formülünden hesaplanır (R91.5).
// Yerel karşılığı: notifications.ts (aynı dışa aktarım adı).
import type { NotificationScheduler } from '../domain/workout/RestTimerService.ts';

export class PlatformNotificationScheduler implements NotificationScheduler {
  async schedule(_atUtc: string, _bodyTr: string): Promise<string | null> {
    return null;                               // bildirim yok; sayaç yine doğru çalışır
  }

  async cancel(_notificationId: string): Promise<void> { /* planlanan yok */ }
}
