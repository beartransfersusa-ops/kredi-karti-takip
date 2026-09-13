// Yerel bildirim planlayıcı — docs/v90/02-architecture.md §7.2, ADR-003 (R91.5).
//
// Dinlenme sayacı bildirimden BAĞIMSIZ çalışır: kalan süre her zaman
// `rest_started_at_utc + rest_duration_seconds` formülünden hesaplanır.
// Bildirim yalnızca ekran kapalıyken haber vermek içindir; izin yoksa
// sessizce atlanır ve sayaç yine doğru çalışır (R91.5).
import type { NotificationScheduler } from '../domain/workout/RestTimerService.ts';

export class ExpoNotificationScheduler implements NotificationScheduler {
  #permission: 'unknown' | 'granted' | 'denied' = 'unknown';

  async schedule(atUtc: string, bodyTr: string): Promise<string | null> {
    const seconds = Math.round((new Date(atUtc).getTime() - Date.now()) / 1000);
    if (seconds <= 0) return null;             // zaten geçmiş; planlamaya gerek yok
    if (!(await this.#ensurePermission())) return null;
    try {
      const N = await import('expo-notifications');
      return await N.scheduleNotificationAsync({
        content: { body: bodyTr, sound: true, interruptionLevel: 'timeSensitive' },
        trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
      });
    } catch {
      return null;                             // bildirim yoksa antrenman aksamaz
    }
  }

  async cancel(notificationId: string): Promise<void> {
    try {
      const N = await import('expo-notifications');
      await N.cancelScheduledNotificationAsync(notificationId);
    } catch { /* zaten gitmiş olabilir */ }
  }

  async #ensurePermission(): Promise<boolean> {
    if (this.#permission !== 'unknown') return this.#permission === 'granted';
    try {
      const N = await import('expo-notifications');
      const current = await N.getPermissionsAsync();
      const granted = current.granted
        ? true
        : current.canAskAgain ? (await N.requestPermissionsAsync()).granted : false;
      this.#permission = granted ? 'granted' : 'denied';
      return granted;
    } catch {
      this.#permission = 'denied';
      return false;
    }
  }
}
