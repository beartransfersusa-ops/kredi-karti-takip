// Dinlenme sayacı — docs/v90/04-domain-engines.md §2.2.4, 02 §7.2, ADR-003.
//
// Kalan süre ASLA sayaçtan okunmaz; her zaman zaman damgasından türetilir.
// Bu sayede ekran kilidi, arka plan ve uygulama yeniden başlatma sayacı bozmaz.

import type { Tx } from '../../core/db/types.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import type { IdGenerator } from '../../core/id.ts';
import { uuid } from '../../core/id.ts';
import { restTimers } from '../../core/db/repositories.ts';
import type { RestTimerRow } from '../../core/db/repositories.ts';

/** Bildirim planlama yan etkisi transaction DIŞINDA yapılır (commit sonrası). */
export interface NotificationScheduler {
  schedule(atUtc: string, bodyTr: string): Promise<string | null>;
  cancel(notificationId: string): Promise<void>;
}

export const NO_NOTIFICATIONS: NotificationScheduler = {
  async schedule() { return null; },
  async cancel() { /* no-op */ },
};

export interface RestTimerView {
  id: string;
  remainingSeconds: number;
  durationSeconds: number;
  state: RestTimerRow['state'];
  expired: boolean;
}

/** clamp(0, duration): cihaz saati geri alınsa da süreden büyük değer çıkmaz. */
export function remainingSeconds(row: RestTimerRow, now: Date): number {
  const elapsed = Math.floor((now.getTime() - Date.parse(row.rest_started_at_utc)) / 1000);
  return Math.min(row.rest_duration_seconds, Math.max(0, row.rest_duration_seconds - elapsed));
}

export function view(row: RestTimerRow, now: Date): RestTimerView {
  const remaining = remainingSeconds(row, now);
  return {
    id: row.id, remainingSeconds: remaining, durationSeconds: row.rest_duration_seconds,
    state: row.state, expired: row.state === 'running' && remaining === 0,
  };
}

export class RestTimerService {
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #notifications: NotificationScheduler;

  constructor(deps: { clock: Clock; notifications?: NotificationScheduler; newId?: IdGenerator }) {
    this.#clock = deps.clock;
    this.#newId = deps.newId ?? uuid;
    this.#notifications = deps.notifications ?? NO_NOTIFICATIONS;
  }

  /** Transaction içinde: çalışan sayaç kapatılır, yenisi açılır. */
  async startInTx(tx: Tx, input: {
    sessionId: string; sessionExerciseId?: string | null; setLogId?: string | null; durationSeconds: number;
  }): Promise<{ id: string; cancelNotificationIds: string[] }> {
    if (!(input.durationSeconds > 0)) throw new Error('dinlenme süresi > 0 olmalı');
    const cancelNotificationIds = await this.closeRunningInTx(tx);
    const now = this.#clock.nowUtc().toISOString();
    const id = this.#newId();
    await restTimers.insert(tx, {
      id, session_id: input.sessionId,
      session_exercise_id: input.sessionExerciseId ?? null,
      set_log_id: input.setLogId ?? null,
      rest_started_at_utc: now, rest_duration_seconds: input.durationSeconds,
      state: 'running', notification_id: null, updated_at_utc: now,
    });
    return { id, cancelNotificationIds };
  }

  /** Commit sonrası: bildirimi planla ve id'sini kaydet (R91.5). */
  async attachNotification(tx: Tx, timerId: string, startedAtUtc: string, durationSeconds: number): Promise<void> {
    const at = new Date(Date.parse(startedAtUtc) + durationSeconds * 1000).toISOString();
    const notificationId = await this.#notifications.schedule(at, 'Dinlenme bitti – sıradaki set');
    if (notificationId) await restTimers.patch(tx, timerId, { notification_id: notificationId }, this.#clock.nowUtc().toISOString());
  }

  async skip(tx: Tx, timerId: string): Promise<string[]> {
    const row = await tx.get<RestTimerRow>('SELECT * FROM rest_timers WHERE id = ?', [timerId]);
    if (!row || row.state !== 'running') return [];
    await restTimers.patch(tx, timerId, { state: 'skipped' }, this.#clock.nowUtc().toISOString());
    return row.notification_id ? [row.notification_id] : [];
  }

  /**
   * Çalışan sayacı kapatır. Süresi dolmuşsa `completed`, dolmamışsa `skipped`
   * (02 §7.2): bitmiş bir sayacı "atlandı" saymak geçmişi yanlış gösterirdi.
   */
  async closeRunningInTx(tx: Tx): Promise<string[]> {
    const running = await restTimers.running(tx);
    if (!running) return [];
    const now = this.#clock.nowUtc();
    const state = remainingSeconds(running, now) === 0 ? 'completed' : 'skipped';
    await restTimers.patch(tx, running.id, { state }, now.toISOString());
    return running.notification_id ? [running.notification_id] : [];
  }

  /** Okuma anında tembel tamamlama: süresi dolmuş sayaç `completed` olur. */
  async current(tx: Tx): Promise<RestTimerView | null> {
    const row = await restTimers.running(tx);
    if (!row) return null;
    const now = this.#clock.nowUtc();
    const v = view(row, now);
    if (v.expired) {
      await restTimers.patch(tx, row.id, { state: 'completed' }, now.toISOString());
      return { ...v, state: 'completed' };
    }
    return v;
  }

  async cancelNotifications(ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.#notifications.cancel(id);
  }
}
