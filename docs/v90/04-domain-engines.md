# V90 – Domain Motorları (Algoritmalar)

> `02-architecture.md` (sorumluluk sınırları ve kararlar) ve `03-data-model.md` (tablolar, tipler) ile birlikte okunur. Bu belge **algoritmaların kanonik kaynağıdır**: servis imzaları, eşik sabitleri, kural tabloları ve test vektörleri burada tanımlanır. 02 ile çelişki bulunursa önce 02 güncellenir, sonra bu belge hizalanır.
>
> Her bölüm aynı yapıyı izler: sorumluluk ve girdiler/çıktılar → TypeScript arayüzleri ve sözde kod → kural/geçiş tablosu → sınır ve hata durumları → test vektörleri → ilgili gereksinimler → tutarsızlık / açık nokta.
>
> **"Tutarsızlık / açık nokta"** başlıkları bilinçli olarak belgede bırakılmıştır: bunlar 01/02/03 ile bu belge arasında fark edilen çelişkileri, türetilmiş isimleri ve ürün onayı bekleyen tasarım kararlarını listeler. Uygulamaya başlamadan önce gözden geçirilmelidir.

## İçindekiler

1. ChallengeCalendar, TrainingSequence, Scheduler, MissedWorkoutResolver, PauseService (§88, §89)
2. ActiveSessionService, komut modeli ve RestTimerService (§90, §91, §113)
3. IncrementResolver, roundToAvailable ve LoadBehavior.effectiveLoad (§100, §101)
4. ProgressionEngine – double progression ve Recommendation üretimi (§104, §121, §122)
5. PlateauEngine (§104)
6. VolumeGuardrails, VolumeAnalytics ve recovery değerlendirmesi (§105, §106)
7. PrDetector ve tahmini performans (§107)
8. SubstitutionEngine ve EquipmentProfile (§98, §99, §120)
9. AdherenceCalculator, TrendCalculator, KPI'lar ve Day 90 raporu (§103, §123, §96)
10. RecipeBuilder, CopyService ve besin kaynağı yönetimi (§109, §110, §111)
11. MeasurementQuality, BaselineResolver ve MeasurementGuide (§96, §97, §119)
12. Zaman, localDateKey, DayRolloverObserver ve timezone senaryoları (§112, §113)

---

## 1. ChallengeCalendar, TrainingSequence, Scheduler, MissedWorkoutResolver, PauseService (§88, §89)

> Kapsam: `domain/program/` altındaki beş bileşen ve `scheduled_workouts` durum makinesi. `02-architecture.md §6` sözleşmesinin algoritma düzeyinde açılımıdır. Tablo/kolon adları `03-data-model.md §1.4–§1.5`, servis ve sözlük adları `02 §3/§4/§6` ile birebirdir. Kullanıcıya görünen her eylem tek `db.withTransaction(tx => …)` içinde yazılır (02 §3 transaction kuralı); zaman yalnızca `Clock` portundan alınır (02 §5.2); her komut `command_id` ile idempotenttir (02 §15, `command_log`).

Bu bölümün tamamını ayakta tutan dört değişmez (invariant):

| # | Değişmez | Kaynak |
|---|----------|--------|
| I-1 | `challengeDay` **saklanmaz**, her okunuşta `programs` + `program_pauses` + `clock.todayKey()`'den türetilir. `trainingSequenceIndex` **saklanır** (`programs.training_sequence_index`) ve yalnızca `TrainingSequence.advanceSequence()` ile değişir. | R88.1, R88.2, 02 §4 |
| I-2 | `programs.training_sequence_index`'i değiştiren her yazma, aynı transaction'da bir `sequence_events` satırı üretir; `cause ∈ {completed, skipped, partialCountedDone}`. Başka hiçbir kod yolu bu kolonu yazmaz. | R88.6, R89.7, 03 §1.4 |
| I-3 | Program başına en fazla **bir** açık plan (`status IN ('planned','inProgress')`) — `ux_sched_one_open`. Gelecek antrenmanlar saklanmaz, öngörü olarak türetilir. | 02 §6.2, 03 §1.5 |
| I-4 | Açık planın `sequence_index`'i == `programs.training_sequence_index`. Sapma = `DbIntegrityError` (sessizce düzeltilmez). | 02 §6.2 |

### 1.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Sorumluluk | Okur | Yazar | Çağıran |
|---------|------------|------|-------|---------|
| `ChallengeCalendar` | `challengeDay`, `pausedDays`, program evresi (`phase`), öngörülen bitiş günü. Saf fonksiyon; DB'ye yazmaz. | `programs` (start_date_key, calendar_mode, duration_days), `program_pauses`, `clock.todayKey()` | — | Dashboard, program takvimi, `DAY_CHANGED` / `TZ_CHANGED` aboneleri |
| `TrainingSequence` | Sıradaki şablonu bulma (`current`), sırayı ilerletme (`advanceSequence` — **tek giriş noktası**), `is_cyclic` sarma. | `programs`, `program_templates.is_cyclic`, `workout_templates`, `scheduled_workouts` (guard) | `programs.training_sequence_index`, `programs.sequence_wraps`, `sequence_events` | Yalnızca `Scheduler.finish / skip / decidePartial` |
| `Scheduler` | Sıradaki tek planı garanti etme (`ensurePlanned`), tercih gününü bulma, sanal öngörü takvimi (`forecast`), `scheduled_workouts` FSM geçişleri (`markInProgress`, `reschedule`, `skip`, `finish`, `decidePartial`, `reopenAfterCancel`). | `programs`, `scheduled_workouts`, `workout_templates`, `training_profiles.preferred_workout_days_json` | `scheduled_workouts` | `AppBootstrap`, `DayRolloverObserver.DAY_CHANGED`, `ActiveSessionService`, `MissedWorkoutResolver`, `PauseService` |
| `MissedWorkoutResolver` | Türetilmiş `missed` görünümünü bulma (`detect`) ve üç kullanıcı kararını komut olarak uygulama (`moveToToday`, `moveToDate`, `skipForReal`). | `programs`, `scheduled_workouts`, `workout_templates` | — (Scheduler'a delege eder) | Ana ekran kartı (R88.5), `AppBootstrap`, `DAY_CHANGED` |
| `PauseService` | Dondurma / devam ettirme / takvim modu değişimi. | `programs`, `program_pauses`, `workout_sessions` (guard), `scheduled_workouts` | `programs.status`, `programs.calendar_mode`, `program_pauses`, `settings_history` | Program Settings (R89.1) |

Girdi/çıktı özeti:

```
ChallengeCalendar.challengeDay(program, pauses, todayKey)      → ChallengeDayInfo            (salt okunur)
TrainingSequence.advanceSequence(tx, {programId, cause, scheduledWorkoutId}) → SequenceAdvanceResult
Scheduler.ensurePlanned(tx, programId, todayKey, {earliestDateKey?})       → EnsurePlannedResult
Scheduler.forecast(input)                                       → ForecastEntry[]             (sanal, saklanmaz)
MissedWorkoutResolver.detect(programId, todayKey)               → MissedWorkout | null        (salt okunur)
PauseService.pause / resume / setCalendarMode(cmd)              → void                        (tek tx)
```

### 1.2 TypeScript arayüzleri ve sözde kod

#### 1.2.1 Ortak tipler ve takvim aritmetiği

```ts
// 03 §3 ile aynı adlar
type DateKey = string;                                   // 'YYYY-MM-DD' — sözlük sırası = kronolojik sıra, string karşılaştırma geçerli
type CalendarMode = 'strictCalendar' | 'activeDays';
type ProgramStatus = 'active' | 'paused' | 'completed' | 'abandoned';
type ScheduledWorkoutStatus = 'planned' | 'inProgress' | 'completed' | 'partiallyCompleted' | 'skipped' | 'rescheduled';
type PauseReason = 'illness' | 'travel' | 'injury' | 'work' | 'personal' | 'other';
// 03 §1.5 / §1.4 CHECK kısıtlarıyla birebir
type RescheduleReason = 'moveToToday' | 'moveToDate' | 'resume' | 'partialContinuation';   // 'cancelSession' 03'ten kaldırıldı: iptal yerinde inProgress→planned yapar
type PartialDecision = 'countAsDone' | 'continueLater';
type SequenceEventCause = 'completed' | 'skipped' | 'partialCountedDone' | 'manualAdjust';
type SequenceAdvanceCause = Exclude<SequenceEventCause, 'manualAdjust'>;   // advanceSequence() yalnızca bunları kabul eder (R88.6) — bkz. açık nokta A-3

// Satır tipleri: 03 §4 `<Tablo>Row` kalıbı, kolon adları camelCase (açık nokta A-13)
interface ProgramRow {
  id: string; programTemplateId: string; status: ProgramStatus;
  startDateKey: DateKey; startTimeZone: string; calendarMode: CalendarMode;
  trainingSequenceIndex: number; sequenceWraps: number; durationDays: number;
  completedAtUtc: string | null; createdAtUtc: string; updatedAtUtc: string;
}
interface ProgramPauseRow {
  id: string; programId: string; reason: PauseReason | null; note: string | null;
  startedAtUtc: string; startDateKey: DateKey; endedAtUtc: string | null; endDateKey: DateKey | null; timeZone: string;
}
interface ScheduledWorkoutRow {
  id: string; programId: string; sequenceIndex: number; workoutTemplateId: string; plannedDateKey: DateKey;
  status: ScheduledWorkoutStatus; rescheduledToId: string | null; rescheduledFromId: string | null;
  rescheduleReason: RescheduleReason | null; remainingExerciseIds: string[] | null;   // remaining_exercise_ids_json
  partialDecision: PartialDecision | null; resolvedAtUtc: string | null; createdAtUtc: string; updatedAtUtc: string;
}
interface SequenceEventRow {
  id: string; programId: string; fromIndex: number; toIndex: number; cause: SequenceEventCause;
  scheduledWorkoutId: string | null; occurredAtUtc: string;
}
interface WorkoutTemplateRow { id: string; programTemplateId: string; sequenceOrder: number; name: string; nameTr: string; estimatedMinutes: number | null }

// core/time (02 §3) — saf takvim aritmetiği. Girdi zaten yerel gün anahtarıdır; timezone'a bakmaz (R112.1, R112.2).
export function daysBetween(fromKey: DateKey, toKey: DateKey): number {
  const utcNoon = (k: DateKey) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), 12); // öğlen → yaz saati sınırı etkisiz
  return Math.round((utcNoon(toKey) - utcNoon(fromKey)) / 86_400_000);                              // negatif olabilir
}
export function addDays(key: DateKey, n: number): DateKey;              // daysBetween(key, addDays(key, n)) === n
export function dayOfWeek(key: DateKey): 0 | 1 | 2 | 3 | 4 | 5 | 6;    // 0 = Pazar — training_profiles.preferred_workout_days_json ile aynı kodlama
export const maxKey = (...k: DateKey[]) => k.reduce((a, b) => (a > b ? a : b));
export const minKey = (...k: DateKey[]) => k.reduce((a, b) => (a < b ? a : b));
export const clampDay = (d: number, max: number) => Math.min(Math.max(d, 1), max);
```

#### 1.2.2 `ChallengeCalendar`

```ts
interface ChallengeDayInfo {
  day: number;                        // 02 §6.1 formülü: clamp(rawDay, 1, durationDays). UI "Day X / 90" bunu gösterir
  rawDay: number;                     // clamp'siz; phase için
  durationDays: number;               // programs.duration_days
  phase: 'notStarted' | 'inProgress' | 'finished';
  calendarMode: CalendarMode;
  pausedDaysTotal: number;            // tüm dondurma günleri (mod'dan bağımsız, bilgi)
  pausedDaysApplied: number;          // hesaba katılan: activeDays → total, strictCalendar → 0
  isPausedToday: boolean;             // açık pause var (end_date_key IS NULL)
  projectedEndDateKey: DateKey | null;// null = activeDays + açık pause → bitiş henüz belirsiz (R123: sahte kesinlik yok)
}

export class ChallengeCalendar {
  constructor(private readonly clock: Clock) {}

  /**
   * Dondurma aralıklarındaki tam yerel gün sayısı: [start_date_key, end_date_key) — başlangıç günü dahil, devam günü hariç (02 §6.1).
   * Açık pause (end_date_key IS NULL) için geçici bitiş = todayKey; yani dondurmanın başladığı gün ancak ertesi günden itibaren
   * "dondurulmuş gün" olarak sayılır → challengeDay dondurma günü geri gitmez, monoton kalır (açık nokta A-8).
   */
  pausedDays(pauses: readonly ProgramPauseRow[], startDateKey: DateKey, todayKey: DateKey): number {
    let total = 0;
    for (const p of pauses) {
      const from = maxKey(p.startDateKey, startDateKey);          // program başlangıcından öncesi sayılmaz
      const to = minKey(p.endDateKey ?? todayKey, todayKey);      // geleceğe taşan/bozuk kayıt bugünle sınırlanır
      total += Math.max(0, daysBetween(from, to));                // ters aralık (tz batıya seyahat) → 0
    }
    return total;
  }

  challengeDay(program: ProgramRow, pauses: readonly ProgramPauseRow[], todayKey: DateKey = this.clock.todayKey()): ChallengeDayInfo {
    const elapsed = daysBetween(program.startDateKey, todayKey) + 1;                 // başlangıç günü = Day 1
    const pausedDaysTotal = this.pausedDays(pauses, program.startDateKey, todayKey);
    const pausedDaysApplied = program.calendarMode === 'activeDays' ? pausedDaysTotal : 0;   // R89.5
    const rawDay = elapsed - pausedDaysApplied;
    const phase = todayKey < program.startDateKey ? 'notStarted'
                : rawDay > program.durationDays   ? 'finished'
                : 'inProgress';
    const isPausedToday = pauses.some(p => p.endDateKey === null);
    const projectedEndDateKey =
      program.calendarMode === 'strictCalendar' ? addDays(program.startDateKey, program.durationDays - 1)
      : isPausedToday ? null
      : addDays(program.startDateKey, program.durationDays - 1 + pausedDaysTotal);
    return { day: clampDay(rawDay, program.durationDays), rawDay, durationDays: program.durationDays, phase,
             calendarMode: program.calendarMode, pausedDaysTotal, pausedDaysApplied, isPausedToday, projectedEndDateKey };
  }
}
```

Notlar: `todayKey` cihazın **o anki** timezone'una göredir (`clock.todayKey()`); `programs.start_date_key` oluşturulduğu anda sabitlenir, `start_time_zone` yalnızca denetim içindir. Timezone değişince `Day X/90` en fazla ±1 gün oynar ve bu beklenen davranıştır (02 §5.5, AT-13). `calendar_mode` değişimi hiçbir saklı değeri değiştirmez; sonraki okuma yeni modla türetir (R89.5, R89.8).

#### 1.2.3 `TrainingSequence`

```ts
interface SequencePosition { index: number; template: WorkoutTemplateRow | null; templateCount: number; isCyclic: boolean; wraps: number; isExhausted: boolean }
interface SequenceAdvanceResult { fromIndex: number; toIndex: number; wrapped: boolean; exhausted: boolean; eventId: string }

export class TrainingSequence {
  constructor(private readonly programs: ProgramRepository, private readonly templates: WorkoutTemplateRepository,
              private readonly scheduled: ScheduledWorkoutRepository, private readonly events: SequenceEventRepository,
              private readonly clock: Clock) {}

  async current(tx: Tx, programId: string): Promise<SequencePosition> {
    const p = await this.programs.get(tx, programId);
    const list = await this.templates.listByProgramTemplate(tx, p.programTemplateId);        // ORDER BY sequence_order
    const { isCyclic } = await this.templates.programTemplate(tx, p.programTemplateId);      // program_templates.is_cyclic
    const template = list.find(t => t.sequenceOrder === p.trainingSequenceIndex) ?? null;
    if (template === null && isCyclic) throw new DbIntegrityError('cyclic program with out-of-range training_sequence_index');
    return { index: p.trainingSequenceIndex, template, templateCount: list.length, isCyclic, wraps: p.sequenceWraps, isExhausted: template === null };
  }

  /**
   * TEK giriş noktası (R88.6). Çağıran, planın hedef durumunu AYNI tx içinde zaten yazmış olmalıdır; burada doğrulanır.
   * Çağıranlar: Scheduler.finish('completed') → 'completed'; Scheduler.skip → 'skipped'; Scheduler.decidePartial('countAsDone') → 'partialCountedDone'.
   */
  async advanceSequence(tx: Tx, input: { programId: string; cause: SequenceAdvanceCause; scheduledWorkoutId: string }): Promise<SequenceAdvanceResult> {
    const program = await this.programs.get(tx, input.programId);
    if (program.status !== 'active') throw new ProgramNotActiveError(program.status);                 // R89.3: dondurmada sıra ilerlemez
    const sw = await this.scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.programId !== program.id || sw.sequenceIndex !== program.trainingSequenceIndex) throw new SequencePlanMismatchError(); // I-4
    const expected: Record<SequenceAdvanceCause, (s: ScheduledWorkoutRow) => boolean> = {
      completed:          s => s.status === 'completed',
      skipped:            s => s.status === 'skipped',
      partialCountedDone: s => s.status === 'partiallyCompleted' && s.partialDecision === 'countAsDone',
    };
    if (!expected[input.cause](sw)) throw new InvalidTransitionError(sw.status, `advance:${input.cause}`);

    const pos = await this.current(tx, program.id);
    const from = program.trainingSequenceIndex;
    let to = from + 1, wrapped = false;
    if (to >= pos.templateCount) {
      if (pos.isCyclic) { to = 0; wrapped = true; }        // 02 §6.3: templates.length modunda döner
      else { to = pos.templateCount; }                      // lineer: nöbetçi değer = "sıra tamamlandı" (açık nokta A-5)
    }
    const now = this.clock.nowUtc().toISOString();
    await this.programs.update(tx, program.id, { trainingSequenceIndex: to, sequenceWraps: program.sequenceWraps + (wrapped ? 1 : 0), updatedAtUtc: now });
    const eventId = uuid();
    await this.events.insert(tx, { id: eventId, programId: program.id, fromIndex: from, toIndex: to, cause: input.cause,
                                   scheduledWorkoutId: sw.id, occurredAtUtc: now });                    // I-2 denetim izi
    return { fromIndex: from, toIndex: to, wrapped, exhausted: !pos.isCyclic && to === pos.templateCount, eventId };
  }
}
```

#### 1.2.4 `Scheduler`

```ts
type EnsurePlannedResult =
  | { action: 'created'; scheduledWorkoutId: string; sequenceIndex: number; plannedDateKey: DateKey }
  | { action: 'exists';  scheduledWorkoutId: string; status: 'planned' | 'inProgress' }
  | { action: 'none';    reason: 'programNotActive' | 'sequenceExhausted' | 'pendingPartialDecision' };

interface ForecastEntry {
  sequenceIndex: number; workoutTemplateId: string; nameTr: string; dateKey: DateKey;
  isVirtual: true;                 // saklanmaz; UI "öngörü" rozeti basar (R123.4)
  wrapsAhead: number;              // kaç sarma sonrası
  isBeyondProgramEnd: boolean;     // projectedEndDateKey'den sonra
}

export class Scheduler {
  constructor(private readonly programs: ProgramRepository, private readonly scheduled: ScheduledWorkoutRepository,
              private readonly profiles: TrainingProfileRepository, private readonly sequence: TrainingSequence,
              private readonly clock: Clock) {}

  /** preferredDays boşsa her gün uygundur (0 = Pazar). Zod: z.array(z.number().int().min(0).max(6)).max(7) → en fazla 7 adım. */
  firstPreferredDayOnOrAfter(fromKey: DateKey, preferredDays: readonly number[]): DateKey {
    if (preferredDays.length === 0) return fromKey;
    for (let i = 0; i < 7; i++) { const k = addDays(fromKey, i); if (preferredDays.includes(dayOfWeek(k))) return k; }
    throw new Error('unreachable');
  }

  /** 02 §6.2. İdempotent: plan varsa yazmaz. Yalnızca SIRADAKİ (training_sequence_index) antrenman planlanır. */
  async ensurePlanned(tx: Tx, programId: string, todayKey: DateKey, opts: { earliestDateKey?: DateKey } = {}): Promise<EnsurePlannedResult> {
    const program = await this.programs.get(tx, programId);
    if (program.status !== 'active') return { action: 'none', reason: 'programNotActive' };                    // adım 1, R89.3
    const open = await this.scheduled.findOpen(tx, programId);            // WHERE status IN ('planned','inProgress') — ux_sched_one_open
    if (open) {
      if (open.sequenceIndex !== program.trainingSequenceIndex) throw new SequencePlanMismatchError();         // I-4
      return { action: 'exists', scheduledWorkoutId: open.id, status: open.status as 'planned' | 'inProgress' };
    }
    const pending = await this.scheduled.findUndecidedPartial(tx, programId, program.trainingSequenceIndex);
    //                       WHERE status='partiallyCompleted' AND partial_decision IS NULL AND sequence_index=?
    if (pending) return { action: 'none', reason: 'pendingPartialDecision' };                                  // açık nokta A-7
    const pos = await this.sequence.current(tx, programId);
    if (pos.isExhausted) return { action: 'none', reason: 'sequenceExhausted' };                               // lineer program bitti
    const prefs = await this.profiles.preferredWorkoutDays(tx);                                                // training_profiles.preferred_workout_days_json
    const earliest = maxKey(todayKey, program.startDateKey, opts.earliestDateKey ?? todayKey);                 // başlangıçtan önce plan yok (A-16)
    const plannedDateKey = this.firstPreferredDayOnOrAfter(earliest, prefs);                                   // adım 2
    const now = this.clock.nowUtc().toISOString(); const id = uuid();
    await this.scheduled.insert(tx, { id, programId, sequenceIndex: pos.index, workoutTemplateId: pos.template!.id, plannedDateKey,
      status: 'planned', rescheduledToId: null, rescheduledFromId: null, rescheduleReason: null, remainingExerciseIds: null,
      partialDecision: null, resolvedAtUtc: null, createdAtUtc: now, updatedAtUtc: now });
    return { action: 'created', scheduledWorkoutId: id, sequenceIndex: pos.index, plannedDateKey };
  }

  /** Sanal öngörü takvimi (02 §6.2 adım 3). Saklanmaz. Açık planın gününden SONRAKİ tercih günlerine sıradaki şablonları dizer. */
  forecast(input: { program: ProgramRow; templates: WorkoutTemplateRow[]; isCyclic: boolean; preferredDays: number[];
                    openPlan: ScheduledWorkoutRow | null; todayKey: DateKey; calendar: ChallengeDayInfo; count: number }): ForecastEntry[] {
    const { templates, isCyclic, preferredDays, openPlan, todayKey, calendar, count } = input;
    const n = templates.length; const out: ForecastEntry[] = [];
    let index = openPlan ? openPlan.sequenceIndex + 1 : input.program.trainingSequenceIndex;   // açık plan varsa ondan sonrası
    let wraps = 0;
    let cursor = openPlan ? addDays(maxKey(openPlan.plannedDateKey, todayKey), 1) : todayKey;  // kaçırılmış plan → öngörü bugünden sonra başlar
    for (let i = 0; i < count; i++) {
      if (index >= n) { if (!isCyclic) break; index = 0; wraps++; }
      const dateKey = this.firstPreferredDayOnOrAfter(cursor, preferredDays);
      out.push({ sequenceIndex: index, workoutTemplateId: templates[index].id, nameTr: templates[index].nameTr, dateKey, isVirtual: true,
                 wrapsAhead: wraps, isBeyondProgramEnd: calendar.projectedEndDateKey !== null && dateKey > calendar.projectedEndDateKey });
      cursor = addDays(dateKey, 1); index++;
    }
    return out;
  }

  // ---------- scheduled_workouts FSM geçişleri (02 §6.3). Hepsi çağıranın tx'i içinde çalışır. ----------

  /** planned → inProgress. ActiveSessionService.start() aynı tx'te çağırır; workout_sessions.scheduled_workout_id = dönen id. */
  async markInProgress(tx: Tx, scheduledWorkoutId: string, todayKey: DateKey): Promise<ScheduledWorkoutRow> {
    let sw = await this.scheduled.get(tx, scheduledWorkoutId);
    const program = await this.programs.get(tx, sw.programId);
    if (program.status !== 'active') throw new ProgramNotActiveError(program.status);
    if (sw.status !== 'planned') throw new InvalidTransitionError(sw.status, 'inProgress');
    if (sw.plannedDateKey !== todayKey) {                       // kaçırılmış (geçmiş) veya erken (gelecek) plan → önce bugüne taşı (A-9)
      const { newId } = await this.reschedule(tx, { scheduledWorkoutId: sw.id, newDateKey: todayKey, reason: 'moveToToday', todayKey });
      sw = await this.scheduled.get(tx, newId);
    }
    await this.scheduled.update(tx, sw.id, { status: 'inProgress', updatedAtUtc: this.clock.nowUtc().toISOString() });
    return { ...sw, status: 'inProgress' };
  }

  /** planned → rescheduled + yeni planned (R88.7: sıra değişmez, geçmiş saklanır). */
  async reschedule(tx: Tx, input: { scheduledWorkoutId: string; newDateKey: DateKey; reason: RescheduleReason; todayKey: DateKey })
      : Promise<{ oldId: string; newId: string }> {
    const old = await this.scheduled.get(tx, input.scheduledWorkoutId);
    if (old.status !== 'planned') throw new InvalidTransitionError(old.status, 'rescheduled');       // inProgress → önce cancelSession
    if (input.newDateKey < input.todayKey) throw new InvalidRescheduleDateError(input.newDateKey);   // geçmişe taşıma = anında missed (A-14)
    if (input.newDateKey === old.plannedDateKey) return { oldId: old.id, newId: old.id };            // no-op
    const now = this.clock.nowUtc().toISOString(); const newId = uuid();
    // 3 adım: ux_sched_one_open (önce kapat, sonra aç) ve FK'ler anında denetlendiği için ileri bağ en sonda
    await this.scheduled.update(tx, old.id, { status: 'rescheduled', resolvedAtUtc: now, updatedAtUtc: now });                 // (1)
    await this.scheduled.insert(tx, { id: newId, programId: old.programId, sequenceIndex: old.sequenceIndex,                     // (2)
      workoutTemplateId: old.workoutTemplateId, plannedDateKey: input.newDateKey, status: 'planned',
      rescheduledFromId: old.id, rescheduledToId: null, rescheduleReason: input.reason,                                          // reason YENİ kayıtta (A-10)
      remainingExerciseIds: old.remainingExerciseIds,                                                                            // kısmi devam planı taşınırsa korunur
      partialDecision: null, resolvedAtUtc: null, createdAtUtc: now, updatedAtUtc: now });
    await this.scheduled.update(tx, old.id, { rescheduledToId: newId });                                                        // (3)
    return { oldId: old.id, newId };                                                                                            // sequence_events YOK
  }

  /** planned → skipped ("Gerçekten atla"; UI onay diyaloğu bu çağrıdan önce geçilmiş olmalı). */
  async skip(tx: Tx, input: { scheduledWorkoutId: string; todayKey: DateKey }): Promise<SequenceAdvanceResult> {
    const sw = await this.scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.status !== 'planned') throw new InvalidTransitionError(sw.status, 'skipped');
    const now = this.clock.nowUtc().toISOString();
    await this.scheduled.update(tx, sw.id, { status: 'skipped', resolvedAtUtc: now, updatedAtUtc: now });
    const adv = await this.sequence.advanceSequence(tx, { programId: sw.programId, cause: 'skipped', scheduledWorkoutId: sw.id });
    await this.ensurePlanned(tx, sw.programId, input.todayKey);                 // sıradaki, bugünden itibaren ilk uygun gün
    return adv;
  }

  /** inProgress → completed | partiallyCompleted. ActiveSessionService.finish() aynı tx'te çağırır; outcome 02 §7.5 kuralıyla belirlenir. */
  async finish(tx: Tx, input: { scheduledWorkoutId: string; outcome: 'completed' | 'partiallyCompleted'; sessionCalendarDateKey: DateKey; todayKey: DateKey;
                                remainingExerciseIds?: string[] })   // partiallyCompleted için zorunlu: ActiveSessionService.finish hesaplar (02 §6.3)
      : Promise<SequenceAdvanceResult | null> {
    const sw = await this.scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.status !== 'inProgress') throw new InvalidTransitionError(sw.status, input.outcome);
    const now = this.clock.nowUtc().toISOString();
    if (input.outcome === 'completed') {
      await this.scheduled.update(tx, sw.id, { status: 'completed', resolvedAtUtc: now, updatedAtUtc: now });
      const adv = await this.sequence.advanceSequence(tx, { programId: sw.programId, cause: 'completed', scheduledWorkoutId: sw.id });
      await this.ensurePlanned(tx, sw.programId, input.todayKey,
        { earliestDateKey: maxKey(input.todayKey, addDays(input.sessionCalendarDateKey, 1)) });   // antrenman gününe ikinci plan yok (A-15)
      return adv;
    }
    // Kalan hareketler bitirme transaction'ında yazılır (02 §6.3): finish–karar arasında kapanışta bilgi kaybolmaz
    await this.scheduled.update(tx, sw.id, { status: 'partiallyCompleted', partialDecision: null,
      remainingExerciseIds: input.remainingExerciseIds ?? [], updatedAtUtc: now });  // karar bekler; resolved_at_utc NULL
    return null;
  }

  /** partiallyCompleted → karar (02 §6.3 / §7.5). */
  async decidePartial(tx: Tx, input: { scheduledWorkoutId: string; decision: PartialDecision; plannedDateKey?: DateKey;   // kullanıcı tarih seçtiyse (moveToDate eşdeğeri)
                                       sessionCalendarDateKey: DateKey; todayKey: DateKey })
      : Promise<SequenceAdvanceResult | { continuationId: string }> {
    const sw = await this.scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.status !== 'partiallyCompleted' || sw.partialDecision !== null) throw new InvalidTransitionError(sw.status, `partial:${input.decision}`);
    const now = this.clock.nowUtc().toISOString();
    if (input.decision === 'countAsDone') {
      await this.scheduled.update(tx, sw.id, { partialDecision: 'countAsDone', resolvedAtUtc: now, updatedAtUtc: now });
      const adv = await this.sequence.advanceSequence(tx, { programId: sw.programId, cause: 'partialCountedDone', scheduledWorkoutId: sw.id });
      await this.ensurePlanned(tx, sw.programId, input.todayKey, { earliestDateKey: maxKey(input.todayKey, addDays(input.sessionCalendarDateKey, 1)) });
      return adv;
    }
    const remaining = sw.remainingExerciseIds ?? [];                                                  // finish() yazdı (T5)
    if (remaining.length === 0) throw new InvalidTransitionError(sw.status, 'partial:continueLater(empty)');   // UI bu seçeneği gizler
    const prefs = await this.profiles.preferredWorkoutDays(tx);
    const plannedDateKey = input.plannedDateKey && input.plannedDateKey > input.todayKey
      ? input.plannedDateKey                                                                            // kullanıcı seçimi (≥ yarın)
      : this.firstPreferredDayOnOrAfter(addDays(input.todayKey, 1), prefs);                            // varsayılan: ertesi ilk uygun gün
    const continuationId = uuid();
    await this.scheduled.update(tx, sw.id, { partialDecision: 'continueLater', resolvedAtUtc: now, updatedAtUtc: now });
    await this.scheduled.insert(tx, { id: continuationId, programId: sw.programId, sequenceIndex: sw.sequenceIndex,             // AYNI sıra
      workoutTemplateId: sw.workoutTemplateId, plannedDateKey, status: 'planned', rescheduledFromId: sw.id, rescheduledToId: null,
      rescheduleReason: 'partialContinuation', remainingExerciseIds: remaining, partialDecision: null, resolvedAtUtc: null,
      createdAtUtc: now, updatedAtUtc: now });
    await this.scheduled.update(tx, sw.id, { rescheduledToId: continuationId });
    return { continuationId };                                                                                                // sıra DEĞİŞMEZ
  }

  /** inProgress → planned. ActiveSessionService.cancel() aynı tx'te çağırır (oturum 'cancelled', set_logs.discarded=1 orada yazılır — 02 §7.1). */
  async reopenAfterCancel(tx: Tx, scheduledWorkoutId: string): Promise<void> {
    const sw = await this.scheduled.get(tx, scheduledWorkoutId);
    if (sw.status !== 'inProgress') throw new InvalidTransitionError(sw.status, 'planned');
    await this.scheduled.update(tx, sw.id, { status: 'planned', updatedAtUtc: this.clock.nowUtc().toISOString() });
    // planned_date_key, remaining_exercise_ids_json korunur; sıra DEĞİŞMEZ; sequence_events YOK; yeni kayıt YOK (A-4)
  }
}
```

#### 1.2.5 `MissedWorkoutResolver`

```ts
interface MissedWorkout {
  scheduledWorkoutId: string; sequenceIndex: number; workoutTemplateId: string; nameTr: string;
  plannedDateKey: DateKey; plannedWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; daysLate: number;
  remainingExerciseIds: string[] | null;     // kısmi devam planı kaçırıldıysa kart "kalan N hareket" der
}

export class MissedWorkoutResolver {
  constructor(private readonly db: Db, private readonly programs: ProgramRepository, private readonly scheduled: ScheduledWorkoutRepository,
              private readonly templates: WorkoutTemplateRepository, private readonly scheduler: Scheduler, private readonly clock: Clock) {}

  /**
   * Türetilmiş görünüm (02 §6.3): status='planned' AND planned_date_key < today AND programs.status='active'. Hiçbir şey yazmaz.
   * SQL: SELECT sw.* FROM scheduled_workouts sw JOIN programs p ON p.id = sw.program_id
   *      WHERE sw.program_id = ? AND sw.status = 'planned' AND sw.planned_date_key < ? AND p.status = 'active'
   */
  async detect(programId: string, todayKey: DateKey = this.clock.todayKey()): Promise<MissedWorkout | null> {
    const program = await this.programs.get(this.db, programId);
    if (program.status !== 'active') return null;                                                    // R89.3: dondurmada uyarı yok
    const open = await this.scheduled.findOpen(this.db, programId);
    if (!open || open.status !== 'planned' || !(open.plannedDateKey < todayKey)) return null;        // inProgress → resume kartı (R90.4), missed değil
    const t = await this.templates.get(this.db, open.workoutTemplateId);
    return { scheduledWorkoutId: open.id, sequenceIndex: open.sequenceIndex, workoutTemplateId: t.id, nameTr: t.nameTr,
             plannedDateKey: open.plannedDateKey, plannedWeekday: dayOfWeek(open.plannedDateKey),
             daysLate: daysBetween(open.plannedDateKey, todayKey), remainingExerciseIds: open.remainingExerciseIds };
  }

  /** "Bugüne taşı" (R88.5). Sıra değişmez. */
  moveToToday(cmd: { commandId: string; scheduledWorkoutId: string }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'missed.moveToToday')) return;                    // command_log — retry güvenli
      const today = this.clock.todayKey();
      return this.scheduler.reschedule(tx, { scheduledWorkoutId: cmd.scheduledWorkoutId, newDateKey: today, reason: 'moveToToday', todayKey: today });
    });
  }
  /** "Başka güne taşı" (R88.5). dateKey < today → InvalidRescheduleDateError (Scheduler.reschedule içinde). Sıra değişmez. */
  moveToDate(cmd: { commandId: string; scheduledWorkoutId: string; dateKey: DateKey }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'missed.moveToDate')) return;
      return this.scheduler.reschedule(tx, { scheduledWorkoutId: cmd.scheduledWorkoutId, newDateKey: cmd.dateKey, reason: 'moveToDate', todayKey: this.clock.todayKey() });
    });
  }
  /** "Gerçekten atla" (R88.5). UI onay diyaloğu ("Bu antrenman tamamen atlanacak, sıradaki antrenmana geçilecek.") bu komuttan ÖNCE. Sıra +1. */
  skipForReal(cmd: { commandId: string; scheduledWorkoutId: string }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'missed.skip')) return;
      return this.scheduler.skip(tx, { scheduledWorkoutId: cmd.scheduledWorkoutId, todayKey: this.clock.todayKey() });
    });
  }
}
// alreadyExecuted(tx, commandId, type): command_log'a INSERT dener; PK çakışması → true (no-op). Aynı tx'te yazıldığı için etki ile birlikte commit olur.
```

Kart davranışı: `detect()` non-null döndükçe ana ekranda **"Kaçırılan antrenman: {nameTr} ({haftaGünü})"** kartı ve üç buton (R88.5). Kart kapatılabilir; kapatma bilgisi yalnızca bellekte, `todayKey` anahtarlıdır ve `DAY_CHANGED`'de sıfırlanır → ertesi gün kart yeniden görünür (02 §6.4; açık nokta A-12). `detect() !== null` iken `ActiveSessionService.start(templateId)` (plansız, ad-hoc başlatma) `MissedWorkoutPendingError` ile reddedilir; kaçırılan planın kendisi karttan "Başla" ile başlatılabilir (`markInProgress` içeride `moveToToday` uygular).

#### 1.2.6 `PauseService`

```ts
export class PauseService {
  constructor(private readonly db: Db, private readonly programs: ProgramRepository, private readonly pauses: ProgramPauseRepository,
              private readonly scheduled: ScheduledWorkoutRepository, private readonly sessions: WorkoutSessionRepository,
              private readonly profiles: TrainingProfileRepository, private readonly settingsHistory: SettingsHistoryRepository,
              private readonly scheduler: Scheduler, private readonly clock: Clock) {}

  /** Programı Dondur (R89.1, R89.2). */
  pause(cmd: { commandId: string; programId: string; reason?: PauseReason; note?: string }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'program.pause')) return;
      const program = await this.programs.get(tx, cmd.programId);
      if (program.status !== 'active') throw new ProgramNotActiveError(program.status);          // 'paused' → zaten dondurulmuş
      if (await this.sessions.findActive(tx)) throw new ActiveSessionExistsError();               // önce bitir / iptal et (A-6)
      if (await this.scheduled.findUndecidedPartial(tx, program.id, program.trainingSequenceIndex)) throw new PendingPartialDecisionError(); // (A-6)
      const now = this.clock.nowUtc().toISOString(), todayKey = this.clock.todayKey();
      await this.programs.update(tx, program.id, { status: 'paused', updatedAtUtc: now });
      await this.pauses.insert(tx, { id: uuid(), programId: program.id, reason: cmd.reason ?? null, note: cmd.note ?? null,
        startedAtUtc: now, startDateKey: todayKey, endedAtUtc: null, endDateKey: null, timeZone: this.clock.timeZone() });   // R89.8
      // Açık plan (planned) DOKUNULMAZ: planned_date_key korunur (02 §6.5). missed türetimi programs.status şartıyla susar (R89.3).
    });
  }

  /** Devam ettir (R89.4). */
  resume(cmd: { commandId: string; programId: string }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'program.resume')) return;
      const program = await this.programs.get(tx, cmd.programId);
      if (program.status !== 'paused') throw new ProgramNotPausedError(program.status);
      const open = await this.pauses.findOpen(tx, program.id);                                    // end_date_key IS NULL — tam bir tane
      if (!open) throw new DbIntegrityError('paused program without open pause');
      const now = this.clock.nowUtc().toISOString(), todayKey = this.clock.todayKey();
      await this.pauses.update(tx, open.id, { endedAtUtc: now, endDateKey: maxKey(todayKey, open.startDateKey) });   // tz batıya seyahatte end < start olmasın
      await this.programs.update(tx, program.id, { status: 'active', updatedAtUtc: now });
      const plan = await this.scheduled.findOpen(tx, program.id);
      if (plan && plan.status === 'planned' && plan.plannedDateKey < todayKey) {                  // dondurmada kalan plan → ilk uygun güne (02 §6.5)
        const prefs = await this.profiles.preferredWorkoutDays(tx);
        await this.scheduler.reschedule(tx, { scheduledWorkoutId: plan.id, newDateKey: this.scheduler.firstPreferredDayOnOrAfter(todayKey, prefs),
                                              reason: 'resume', todayKey });                      // sıra AYNI (R89.4)
      }
      await this.scheduler.ensurePlanned(tx, program.id, todayKey);                                // plan yoksa oluştur
    });
  }

  /** Takvim modu (R89.5, R89.6). challengeDay türetildiği için başka yazma yok. */
  setCalendarMode(cmd: { commandId: string; programId: string; mode: CalendarMode }) {
    return this.db.withTransaction(async tx => {
      if (await alreadyExecuted(tx, cmd.commandId, 'program.setCalendarMode')) return;
      const program = await this.programs.get(tx, cmd.programId);
      if (program.calendarMode === cmd.mode) return;                                              // no-op
      const now = this.clock.nowUtc().toISOString();
      await this.programs.update(tx, program.id, { calendarMode: cmd.mode, updatedAtUtc: now });
      await this.settingsHistory.insert(tx, { id: uuid(), key: 'program.calendarMode',              // anahtar adı türetildi (A-11)
        oldValueJson: JSON.stringify(program.calendarMode), newValueJson: JSON.stringify(cmd.mode), changedAtUtc: now });   // 02 §6.5
    });
  }
}
```

#### 1.2.7 Orkestrasyon: açılış, gün geçişi, timezone değişimi

```ts
// features/program — AppBootstrap, DayRolloverObserver.DAY_CHANGED, TZ_CHANGED ve AppState→active aynı fonksiyonu çağırır.
async function refreshProgramDay(programId: string) {
  const todayKey = clock.todayKey();
  await db.withTransaction(tx => scheduler.ensurePlanned(tx, programId, todayKey));   // (1) idempotent; yalnızca plan yoksa yazar
  const [program, pauses, openPlan] = await Promise.all([…]);
  const calendar = challengeCalendar.challengeDay(program, pauses, todayKey);           // (2) Day X / 90 — türetilmiş
  const missed = await missedWorkoutResolver.detect(programId, todayKey);              // (3) türetilmiş görünüm → kart
  const forecast = scheduler.forecast({ program, templates, isCyclic, preferredDays, openPlan, todayKey, calendar, count: 6 }); // (4) öngörü
  programStore.set({ calendar, missed, openPlan, forecast });                          // DB'nin türevi (R90.7)
}
```

Sıra önemlidir: önce `ensurePlanned` (resume/skip sonrası plan boşluğu kapanır), sonra `detect` (yeni oluşturulan plan `planned_date_key ≥ today` olduğundan asla missed çıkmaz).

### 1.3 Kural / geçiş tablosu

#### 1.3.1 `scheduled_workouts` durum makinesi

Her satır tek transaction'dır. "Sıra etkisi" = `programs.training_sequence_index`; **+1** her zaman I-2 gereği bir `sequence_events` satırıyla birlikte gelir.

| # | Geçiş | Tetikleyici / komut | Guard | Aynı transaction'daki DB yazımları | Sıra etkisi | `sequence_events.cause` | Ardından `ensurePlanned(earliest)` |
|---|-------|---------------------|-------|-------------------------------------|-------------|-------------------------|-------------------------------------|
| T1 | ∅ → `planned` | `Scheduler.ensurePlanned` (bootstrap, `DAY_CHANGED`, resume, T4/T6/T8 sonrası) | `programs.status='active'`; açık plan yok; karar bekleyen kısmi yok; `!isExhausted` | `scheduled_workouts` INSERT: `sequence_index = programs.training_sequence_index`, `planned_date_key = firstPreferredDayOnOrAfter(max(today, start_date_key, earliest))` | — | — | — |
| T2 | `planned` → `rescheduled` + yeni `planned` | `Scheduler.reschedule` (`moveToToday` / `moveToDate` / `resume`) | eski `status='planned'`; `newDateKey ≥ today`; `commandId` yeni | (1) eski: `status='rescheduled'`, `resolved_at_utc`; (2) yeni INSERT: aynı `sequence_index`, `workout_template_id`, `remaining_exercise_ids_json`; `rescheduled_from_id`, `reschedule_reason`; (3) eski: `rescheduled_to_id` | değişmez (R88.7) | — | — (yeni plan zaten var) |
| T3 | `planned` → `inProgress` | `ActiveSessionService.start` → `Scheduler.markInProgress` | `programs.status='active'`; aktif oturum yok (`ux_sessions_single_active`); `planned_date_key ≠ today` ise önce T2(`moveToToday`) | `status='inProgress'`; `workout_sessions` INSERT (`scheduled_workout_id`) — 02 §7.1 | değişmez | — | — |
| T4 | `inProgress` → `completed` | `ActiveSessionService.finish` (`allDone` / `resumeCardFinish`) → `Scheduler.finish('completed')` | tüm planlanan working set'ler loglandı veya kalan hareketler açıkça `skipped` (02 §7.5) | `status='completed'`, `resolved_at_utc`; `workout_sessions.status='completed'`, `completed_at_utc`; `programs.training_sequence_index` (+`sequence_wraps` sarmada); `sequence_events` INSERT | **+1** | `completed` | `max(today, session.calendar_date_key + 1)` |
| T5 | `inProgress` → `partiallyCompleted` | `finish("Bugün burada bitir")` → `Scheduler.finish('partiallyCompleted')` | en az bir planlanan working set eksik | `status='partiallyCompleted'`, `partial_decision=NULL`, `remaining_exercise_ids_json` (kalan/yarım hareketlerin şablon id'leri, aynı tx); `workout_sessions.status='partial'`, `ended_reason='finishHereToday'` (R103.2, R103.3) | değişmez (karar bekler) | — | engellenir: `none/pendingPartialDecision` |
| T6 | `partiallyCompleted` ⟶ karar `countAsDone` ("bitmiş say") | `Scheduler.decidePartial` | `status='partiallyCompleted'` ve `partial_decision IS NULL` | `partial_decision='countAsDone'`, `resolved_at_utc`; `programs.training_sequence_index`; `sequence_events` | **+1** | `partialCountedDone` | `max(today, session.calendar_date_key + 1)` |
| T7 | `partiallyCompleted` ⟶ karar `continueLater` + yeni `planned` | `Scheduler.decidePartial` | `partial_decision IS NULL`; satırdaki `remaining_exercise_ids_json` boş değil | `partial_decision='continueLater'`, `resolved_at_utc`, `rescheduled_to_id`; yeni INSERT: **aynı** `sequence_index`, `remaining_exercise_ids_json` (kopya), `reschedule_reason='partialContinuation'`, `rescheduled_from_id`, `planned_date_key = kullanıcı seçimi (≥ yarın) ?? firstPreferredDayOnOrAfter(today + 1)` | değişmez | — | — |
| T8 | `planned` → `skipped` | `Scheduler.skip` ("Gerçekten atla", onay diyaloğu sonrası) | `status='planned'` (kaçırılmış olması şart değil) | `status='skipped'`, `resolved_at_utc`; `programs.training_sequence_index`; `sequence_events` | **+1** | `skipped` | `today` |
| T9 | `inProgress` → `planned` | `ActiveSessionService.cancel` (`userCancel` / `resumeCardCancel`) → `Scheduler.reopenAfterCancel` | `status='inProgress'` | `status='planned'` (`planned_date_key` **korunur**); `workout_sessions.status='cancelled'`, `ended_reason`; `set_logs.discarded=1` (02 §7.1) | değişmez | — | — |
| T10 | `planned` ⇒ **missed** (türetilmiş, saklanmaz) | `MissedWorkoutResolver.detect` | `planned_date_key < today AND programs.status='active'` | **yok** | değişmez | — | — |

Yasak geçişler (hepsi `InvalidTransitionError`, hiçbir yazma yapılmaz):

| Yasak | Neden / doğru yol |
|-------|-------------------|
| `inProgress` → `rescheduled` / `skipped` | Aktif oturum varken plan taşınamaz/atlanamaz; önce T9 (`cancelSession`) veya T4/T5. |
| `planned` → `completed` / `partiallyCompleted` | Oturumsuz bitirme yok; yalnızca T3 → T4/T5. |
| Terminal durumdan (`completed`, `skipped`, `rescheduled`, karara bağlanmış `partiallyCompleted`) herhangi bir geçiş | Geçmiş değişmez; düzeltme yeni kayıtla yapılır. |
| İkinci açık plan oluşturma | I-3, `ux_sched_one_open` DB düzeyinde de reddeder. |
| T4/T6/T8 dışında `programs.training_sequence_index` yazımı | I-2, R88.6. Integration testi: her komut sonrası indeks değiştiyse `sequence_events` sayısı tam +1. |

#### 1.3.2 Program durumu geçişleri (kapsamdakiler)

| # | Geçiş | Komut | Guard | Yazımlar | Plana etkisi |
|---|-------|-------|-------|----------|--------------|
| P1 | `active` → `paused` | `PauseService.pause(reason?, note?)` | `status='active'`; aktif oturum yok; karar bekleyen kısmi yok | `programs.status='paused'`; `program_pauses` INSERT (`started_at_utc`, `start_date_key`, `time_zone`, `reason`, `note`; `end_*` NULL) | Açık plan dokunulmaz; missed türetimi susar (R89.3) |
| P2 | `paused` → `active` | `PauseService.resume()` | `status='paused'`; tam bir açık pause | `program_pauses` UPDATE `ended_at_utc`, `end_date_key = max(today, start_date_key)`; `programs.status='active'` | Plan `planned` ve `planned_date_key < today` ise T2(`resume`) → `firstPreferredDayOnOrAfter(today)`; sonra `ensurePlanned(today)`. Sıra aynı (R89.4) |
| P3 | `calendar_mode` değişimi | `PauseService.setCalendarMode(mode)` | mod farklı | `programs.calendar_mode`; `settings_history` INSERT (`key='program.calendarMode'`) | Hiçbir tarih/plan/indeks değişmez; `challengeDay` sonraki okumada yeni modla türetilir (R89.5) |
| — | `active` → `completed` / `abandoned` | (bu bölümün kapsamı dışı — açık nokta A-5) | | | |

#### 1.3.3 `challengeDay` kuralları

| # | Kural | Formül / davranış |
|---|-------|-------------------|
| C1 | `strictCalendar` (varsayılan, R89.6) | `day = clamp(daysBetween(start_date_key, today) + 1, 1, duration_days)` |
| C2 | `activeDays` | `day = clamp(daysBetween(start_date_key, today) + 1 − pausedDays, 1, duration_days)` |
| C3 | `pausedDays` | Σ kapalı pause: `daysBetween(start_date_key, end_date_key)` (başlangıç dahil, devam hariç); açık pause: `daysBetween(start_date_key, today)`; program başlangıcından öncesi ve negatif aralıklar 0 |
| C4 | `phase` | `today < start_date_key` → `notStarted`; `rawDay > duration_days` → `finished`; aksi `inProgress`. `day` her durumda 1..duration_days aralığında kalır; UI `phase`'e göre "Başlamadı" / "Tamamlandı" gösterir, "Day 1" veya "Day 90" olarak yutmaz (R123) |
| C5 | `projectedEndDateKey` | strict: `start + duration − 1`; activeDays kapalı pause'lar: `+ pausedDaysTotal`; activeDays açık pause: `null` ("dondurma bitince netleşir") |
| C6 | Mod değişimi | Saklı hiçbir değer değişmez; aynı gün mod değişince `day` anında farklı görünür (beklenen, R89.5) |
| C7 | `today` kaynağı | Yalnızca `clock.todayKey()` (cihazın o anki tz'si). UTC'den türetme yok (R112.2). Timezone değişimi ±1 gün oynatır, kayıtlar kaymaz (02 §5.5) |
| C8 | Sıradan bağımsızlık | `challengeDay` hiçbir `scheduled_workouts` / `sequence_events` verisine bakmaz; `trainingSequenceIndex` hiçbir takvim verisine bakmaz (R88.1, R88.8) |

### 1.4 Sınır durumları ve hata durumları

#### 1.4.1 Sınır durumları

| # | Durum | Davranış | Gerekçe |
|---|-------|----------|---------|
| E1 | `today < start_date_key` (program ileri tarihli) | `phase='notStarted'`, `day=1`; `ensurePlanned` planı `start_date_key`'den önceye koymaz (`earliest ≥ start_date_key`) | R123, A-16 |
| E2 | `today = start_date_key` | Day 1; ilk plan bugün (tercih günüyse) | C1 |
| E3 | `today = start + 89` | Day 90, `phase='inProgress'` (son gün) | C1 |
| E4 | `today ≥ start + 90` (strict) | `day=90`, `phase='finished'`; planlama devam eder (program hâlâ `active`), öngörüler `isBeyondProgramEnd=true` | A-5 |
| E5 | Dondurma günü (açık pause, aynı gün) | `pausedDays=0`; activeDays ile strict aynı değeri gösterir; ertesi günden itibaren fark açılır | C3, A-8 |
| E6 | Aynı gün dondur + devam et | `[S, S)` → 0 gün; plan dokunulmaz (`planned_date_key ≥ today`) | C3 |
| E7 | Birden çok pause | Toplanır; örtüşme imkânsız (P1 guard: `status='active'` şart) | C3 |
| E8 | Timezone batıya seyahat: `end_date_key < start_date_key` olabilir | `resume()` `end_date_key = max(today, start_date_key)` yazar; `pausedDays` yine `max(0, …)` | C3 |
| E9 | Timezone doğuya seyahat: yerel gün atlar | Bugünün planı anında `missed` görünebilir; kart çıkar, kullanıcı "Bugüne taşı" der. ±1 gün beklenen davranış (02 §5.5). Kart metni takvim günü değişimini belirtmeli (A-17) | AT-13 |
| E10 | Gece yarısı uygulama açıkken (`DAY_CHANGED`) | `refreshProgramDay` → bugünün planı `missed` olur; `inProgress` ise olmaz (aktif oturum) | R112.5 |
| E11 | Antrenman 23:50 başlayıp 00:10 biter | `session.calendar_date_key` = başlangıç günü (R113.3); sonraki plan `earliest = max(today, calendar_date_key + 1)` = ertesi gün olan "bugün" → ardışık gün antrenmanı mümkün (Pzt/Sal/Çar örneği) | A-15 |
| E12 | `preferred_workout_days_json = '[]'` | Her gün uygun; plan `earliest` gününe düşer | 1.2.4 |
| E13 | Tercih günü olmayan bugün, "Gerçekten atla" | Yeni plan bugünden itibaren ilk tercih günü (bugün değilse ileri) | T8 |
| E14 | Bugünün planı `skip` edilir | Sıradaki şablon aynı güne planlanabilir (`earliest=today`) — kullanıcı "Legs yerine bugün Upper" yapabilir | T8 |
| E15 | Erken başlatma (`planned_date_key > today`) | `markInProgress` önce T2(`moveToToday`); değişmez: açık/tamamlanmış planın `planned_date_key` == oturumun `calendar_date_key` (override hariç) | A-9 |
| E16 | Kaçırılan plan karttan doğrudan "Başla" | Aynı tx: T2(`moveToToday`) + T3 | 02 §6.4 |
| E17 | Kaçırılan plan bir kısmi devam planıysa | `remaining_exercise_ids_json` taşınır; kart "kalan N hareket" | T2 |
| E18 | Zincirleme taşıma (D → E → G …) | Sınır yok; geçmiş `rescheduled_from_id / rescheduled_to_id` ile izlenir | R88.7 |
| E19 | Program bitişinden sonraya taşıma | İzin verilir; UI `isBeyondProgramEnd` uyarısı gösterir | — |
| E20 | Lineer programda sıra biter (`index == templates.length`) | `isExhausted`; `ensurePlanned → none/sequenceExhausted`; `forecast` boş; UI "Program sırası tamamlandı" | A-5 |
| E21 | Döngüsel programda `index ≥ templates.length` | `DbIntegrityError` (veri bozulması; sessiz düzeltme yok) | 1.2.3 |
| E22 | Karar bekleyen kısmi antrenman + uygulama kapandı | `ensurePlanned → none/pendingPartialDecision`; ana ekranda "Kısmi antrenman kararı bekliyor" kartı; `pause()` reddedilir | A-7, A-6 |
| E23 | Karar bekleyen kısmi antrenman + gün değişti | Kart kalır; `missed` üretilmez (durum `planned` değil); karar `countAsDone` → `earliest = max(today, session.calendar_date_key+1) = today` | T6 |
| E24 | Dondurmadayken kaçırılmış plan var | Uyarı yok; resume'da T2(`resume`) ile ilk uygun güne taşınır, kullanıcı sonra isterse atlar | R89.3, R89.4 |
| E25 | Aynı `commandId` ile tekrar (R117 retry) | `command_log` PK → no-op; sıra iki kez ilerlemez, ikinci plan oluşmaz | 02 §15 |
| E26 | Resume kartından "Antrenmanı İptal Et" ertesi gün | T9: plan `planned(planned_date_key=dün)` → aynı anda `missed` → kart | 02 §7.1 |
| E27 | `programs.status ∈ {completed, abandoned}` | `detect → null`; `ensurePlanned → none/programNotActive`; `pause` reddedilir | — |

#### 1.4.2 Hata durumları

Hata sınıfları `core/errors` AppError taksonomisine eklenir (02 §15; adlar bu belgede türetildi — A-13). Hiçbiri kısmi yazma bırakmaz (transaction geri alınır).

| Hata | Ne zaman | Kullanıcıya (Türkçe) | Aksiyon |
|------|----------|----------------------|---------|
| `InvalidTransitionError(from, to)` | 1.3.1 yasak geçiş; karar verilmiş kısmi için ikinci karar; boş `remainingExerciseIds` ile `continueLater` | "Bu işlem şu an yapılamaz." (+ Ayrıntılar) | Ekranı yenile (`refreshProgramDay`) |
| `ProgramNotActiveError(status)` | `paused`/`completed`/`abandoned` programda `advanceSequence`, `markInProgress`, `pause` | "Program dondurulmuş. Devam ettirmek için Program Ayarları'na git." | Program Ayarları'na bağlantı |
| `ProgramNotPausedError(status)` | `resume` aktif programda | "Program zaten devam ediyor." | — |
| `ActiveSessionExistsError` | `pause` sırasında aktif oturum var | "Devam eden antrenmanın var. Önce bitir ya da iptal et." | Aktif antrenmana git |
| `PendingPartialDecisionError` | `pause` sırasında karar bekleyen kısmi antrenman | "Önce kısmi antrenman için karar ver." | Karar kartına git |
| `InvalidRescheduleDateError(dateKey)` | `newDateKey < today` | "Geçmiş bir güne taşıyamazsın." | Tarih seçici tekrar |
| `MissedWorkoutPendingError` | Kaçırılan plan kararsızken ad-hoc antrenman başlatma | "Kaçırılan antrenman için önce karar ver." | Karta odaklan |
| `SequencePlanMismatchError` (DbIntegrityError) | Açık plan `sequence_index ≠ programs.training_sequence_index` | "Program verisinde tutarsızlık bulundu. Verilerin güvende." | Ayrıntılar · Yedeği dışa aktar (02 §15) |
| `DbIntegrityError` | `paused` program açık pause'suz; döngüsel programda aralık dışı indeks | aynı | aynı |
| `DbWriteError` | SQLITE_BUSY / disk dolu | "Kaydedilemedi. Boş alanı kontrol et." | Aynı `commandId` ile yeniden dene (E25) |

### 1.5 Test vektörleri

Ortak fixture **F1** (Jest + `FakeClock`, in-memory repo; 02 §16):

```
programs:            start_date_key='2026-09-07' (Pzt), calendar_mode='strictCalendar', duration_days=90, status='active',
                     training_sequence_index=0, sequence_wraps=0
program_templates:   is_cyclic=1
workout_templates:   sequence_order 0..4 → T0 'Pull', T1 'Push', T2 'Legs', T3 'Upper', T4 'Lower'   (n = 5)
training_profiles:   preferred_workout_days_json='[1,2,3,4,5]'   (Pzt–Cum)
Takvim:              09-07 Pzt · 09-08 Sal · 09-09 Çar · 09-10 Per · 09-11 Cum · 09-12 Cmt · 09-13 Paz · 09-14 Pzt · 09-16 Çar · 09-21 Pzt · 12-05 Cum
```

Tarihler `2026-` önekiyle okunur. "→" = beklenen çıktı.

#### TV-CAL · `ChallengeCalendar.challengeDay`

| # | `today` | `calendar_mode` | `program_pauses` | elapsed | `pausedDaysApplied` | `rawDay` | → `day` | → `phase` | → `projectedEndDateKey` |
|---|---------|-----------------|------------------|---------|---------------------|----------|---------|-----------|--------------------------|
| C-1 | 09-06 | strict | — | 0 | 0 | 0 | **1** | `notStarted` | 12-05 |
| C-2 | 09-07 | strict | — | 1 | 0 | 1 | 1 | `inProgress` | 12-05 |
| C-3 | 09-11 | strict | — | 5 | 0 | 5 | 5 | `inProgress` | 12-05 |
| C-4 | 12-05 | strict | — | 90 | 0 | 90 | 90 | `inProgress` | 12-05 |
| C-5 | 12-06 | strict | — | 91 | 0 | 91 | **90** | `finished` | 12-05 |
| C-6 | 09-21 | strict | [09-16, 09-21) | 15 | 0 (total 5) | 15 | 15 | `inProgress` | 12-05 |
| C-7 | 09-21 | activeDays | [09-16, 09-21) | 15 | 5 | 10 | **10** | `inProgress` | **12-10** |
| C-8 | 12-05 | activeDays | [09-16, 09-21) | 90 | 5 | 85 | 85 | `inProgress` | 12-10 |
| C-9 | 12-10 | activeDays | [09-16, 09-21) | 95 | 5 | 90 | 90 | `inProgress` | 12-10 |
| C-10 | 09-16 | activeDays | [09-16, açık) | 10 | **0** | 10 | 10 | `inProgress`, `isPausedToday` | **null** |
| C-11 | 09-17 | activeDays | [09-16, açık) | 11 | 1 | 10 | 10 | `inProgress` | null |
| C-12 | 09-20 | activeDays | [09-16, açık) | 14 | 4 | 10 | 10 | `inProgress` | null |
| C-13 | 09-22 | activeDays | [09-16, 09-21) | 16 | 5 | 11 | 11 | `inProgress` | 12-10 |
| C-14 | 09-25 | strict → `setCalendarMode('activeDays')` | [09-16, 09-21) | 19 | 0 → 5 | 19 → 14 | **19 → 14** aynı gün; saklı veri değişmedi, `settings_history` +1 | | 12-05 → 12-10 |
| C-15 | 09-21 | activeDays | [09-16, 09-21) + [09-03, 09-05) (başlangıçtan önce) | 15 | 5 (ikinci aralık 0) | 10 | 10 | | 12-10 |
| C-16 | 09-21 | activeDays | [09-16, 09-15) (ters, tz batı) | 15 | 0 | 15 | 15 | | 12-05 |
| C-17 | 09-12 01:00 Europe/Istanbul → cihaz Los Angeles'a geçer (yerel 09-11 15:00) | strict | — | `todayKey` 09-12 → 09-11 | 0 | 6 → 5 | **6 → 5** (±1 beklenen, 02 §5.5; kayıtlar kaymaz) | | |

#### TV-SEQ · `TrainingSequence.advanceSequence` (F1, n = 5)

| # | `training_sequence_index` | `cause` | `scheduled_workouts` satırı (aynı tx'te zaten yazılmış) | → `toIndex` | → `wrapped` | → `sequence_wraps` | → `sequence_events` |
|---|---------------------------|---------|---------------------------------------------------------|-------------|-------------|--------------------|---------------------|
| S-1 | 3 | `completed` | idx 3, `completed` | 4 | false | 0 | (3→4, `completed`, sw.id) |
| S-2 | 4 | `completed` | idx 4, `completed` | **0** | true | **1** | (4→0, `completed`) |
| S-3 | 4, `is_cyclic=0` | `skipped` | idx 4, `skipped` | **5** (`exhausted=true`) | false | 0 | (4→5, `skipped`); ardından `ensurePlanned → none/sequenceExhausted` |
| S-4 | 3 | `partialCountedDone` | idx 3, `partiallyCompleted`, `partial_decision='countAsDone'` | 4 | false | 0 | (3→4, `partialCountedDone`) |
| S-5 | 3 | `completed` | idx 3, hâlâ `planned` | `InvalidTransitionError` — yazma yok | | | yok |
| S-6 | 3 | `partialCountedDone` | idx 3, `partiallyCompleted`, `partial_decision=NULL` | `InvalidTransitionError` | | | yok |
| S-7 | 3, `programs.status='paused'` | `completed` | idx 3, `completed` | `ProgramNotActiveError` | | | yok |
| S-8 | 3 | `completed` | idx **2**, `completed` | `SequencePlanMismatchError` | | | yok |
| S-9 | 3 | `'manualAdjust'` | — | derleme hatası (`SequenceAdvanceCause` dışı) | | | — |
| S-10 | 7, `is_cyclic=1` | (`current()`) | — | `DbIntegrityError` (E21) | | | — |

#### TV-SCH · `Scheduler.firstPreferredDayOnOrAfter` ve `ensurePlanned`

| # | `fromKey` | `preferredDays` | → |
|---|-----------|-----------------|---|
| D-1 | 09-11 Cum | [1,2,3,4,5] | 09-11 |
| D-2 | 09-12 Cmt | [1,2,3,4,5] | 09-14 Pzt |
| D-3 | 09-11 Cum | [1,3,5] | 09-11 |
| D-4 | 09-12 Cmt | [1,3,5] | 09-14 |
| D-5 | 09-13 Paz | [6] | 09-19 Cmt |
| D-6 | 09-11 | [] | 09-11 (her gün uygun) |
| D-7 | 09-11 Cum | [0] | 09-13 Paz |

| # | Durum (F1 üzerinde) | `todayKey` / `earliestDateKey` | → `EnsurePlannedResult` | Yazma |
|---|---------------------|--------------------------------|-------------------------|-------|
| P-1 | `programs.status='paused'` | 09-18 | `none/programNotActive` | yok |
| P-2 | açık `planned` var (idx = program idx) | 09-11 | `exists(planned)` | yok |
| P-3 | açık `inProgress` var | 09-11 | `exists(inProgress)` | yok |
| P-4 | plan yok; idx 3'te `partiallyCompleted`, `partial_decision=NULL` | 09-12 | `none/pendingPartialDecision` | yok |
| P-5 | plan yok; `is_cyclic=0`, idx 5 | 09-30 | `none/sequenceExhausted` | yok |
| P-6 | plan yok; idx 1 | 09-07 / 09-08 | `created` idx 1, `planned_date_key` 09-08 | INSERT |
| P-7 | plan yok; idx 4 | 09-11 / 09-12 | `created` idx 4, **09-14** (Cmt/Paz tercih değil) | INSERT |
| P-8 | plan yok; idx 0; `start_date_key` 09-07 | 09-05 / — | `created` idx 0, **09-07** (başlangıçtan önce plan yok, E1) | INSERT |
| P-9 | açık plan idx 2, program idx 3 | 09-11 | `SequencePlanMismatchError` | yok |
| P-10 | P-6 iki kez aynı `commandId` ile | | ikinci çağrı no-op; `scheduled_workouts` satır sayısı +1 (yalnızca bir) | |

#### TV-R88.3 · Pzt Pull, Sal Push, Çar Legs, Per kaçırıldı, Cuma açılış

| Adım | Yerel gün | Eylem / komut | → `scheduled_workouts` (id: durum, `planned_date_key`, idx) | → `training_sequence_index` | → `sequence_events` (yeni) | Not |
|------|-----------|---------------|---------------------------------------------------------------|-----------------------------|----------------------------|-----|
| 1 | 09-07 Pzt | bootstrap `ensurePlanned` | **A**: planned 09-07 idx 0 (Pull) | 0 | — | `created` |
| 2 | 09-07 | `start(A)` → `finish(allDone)` | A: completed; **B**: planned 09-08 idx 1 (Push) | 1 | (0→1, `completed`, A) | earliest = 09-08 |
| 3 | 09-08 Sal | `start(B)` → `finish(allDone)` | B: completed; **C**: planned 09-09 idx 2 (Legs) | 2 | (1→2, `completed`, B) | |
| 4 | 09-09 Çar | `start(C)` → `finish(allDone)` | C: completed; **D**: planned 09-10 idx 3 (Upper) | 3 | (2→3, `completed`, C) | |
| 5 | 09-10 Per | (uygulama açılmadı) | D: planned 09-10 | 3 | — | |
| 6 | 09-11 Cum | bootstrap: `ensurePlanned` → `exists(D)`; `detect` | D: planned (**missed** görünümü) → `{ D, nameTr 'Upper', plannedWeekday 4 (Per), daysLate 1 }` | **3** | **— (satır yok)** | Kart: "Kaçırılan antrenman: Upper (Perşembe)". Sıradaki idx 4 bugüne **konmadı** (R88.3) |
| 6' | 09-11 | `forecast(count 3)` | — | 3 | — | `[ {idx 4 Lower, 09-14}, {idx 0 Pull, 09-15, wrapsAhead 1}, {idx 1 Push, 09-16, wrapsAhead 1} ]`, hepsi `isVirtual` |
| 7a | 09-11 | **Bugüne taşı** (`moveToToday`) | D: rescheduled, `rescheduled_to_id=E`, `resolved_at_utc`; **E**: planned **09-11** idx 3, `rescheduled_from_id=D`, `reschedule_reason='moveToToday'` | 3 | — | R88.7 |
| 7b | 09-11 | **Başka güne taşı** (`moveToDate(09-14)`) | D: rescheduled → E; **E**: planned 09-14 idx 3, `reschedule_reason='moveToDate'` | 3 | — | AT-05 |
| 7c | 09-11 | **Gerçekten atla** (onay → `skipForReal`) | D: skipped, `resolved_at_utc`; **F**: planned **09-11** idx 4 (Lower) | **4** | (3→4, `skipped`, D) | earliest = today |
| 8 (7a devamı) | 09-11 | `start(E)` (tarih == today → ek taşıma yok) → `finish(allDone)` | E: completed; **G**: planned 09-14 idx 4 (Lower) | 4 | (3→4, `completed`, E) | earliest 09-12 → Pzt |
| 8' (6 devamı) | 09-11 | karttan doğrudan **Başla** (`markInProgress(D)`) | D: rescheduled → E (`moveToToday`); E: inProgress 09-11 idx 3 | 3 | — | E16 |
| 9 | 09-11 | `start('v90-…-lower')` ad-hoc (kart kararsız) | `MissedWorkoutPendingError` | 3 | — | "karar verilmeden yeni antrenman başlatılamaz" |
| 10 | 09-12 Cmt | karar verilmedi; bootstrap | D: planned (missed, `daysLate` 2) — kart yeniden | 3 | — | sessiz atlama yok |

#### TV-AT04 · Bir workout kaçır → sonraki workout sessizce atlanmıyor

Ön koşul: TV-R88.3 adım 6 durumu (09-11 Cum). Assert'ler:

| # | Kontrol | Beklenen |
|---|---------|----------|
| A4-1 | `detect(programId, '2026-09-11')` | non-null, `sequenceIndex === 3`, `workoutTemplateId === T3`, `daysLate === 1` |
| A4-2 | `programs.training_sequence_index` | 3 (değişmedi) |
| A4-3 | `SELECT COUNT(*) FROM sequence_events` | 3 (adım 2–4'tekiler; yeni satır yok) |
| A4-4 | `ensurePlanned(...)` | `{ action: 'exists', scheduledWorkoutId: D, status: 'planned' }`; `scheduled_workouts` satır sayısı değişmedi |
| A4-5 | `SELECT * FROM scheduled_workouts WHERE sequence_index = 4` | 0 satır (idx 4 saklı bir plana dönüşmedi) |
| A4-6 | `forecast()[0]` | `{ sequenceIndex: 4, dateKey: '2026-09-14', isVirtual: true }` — 09-11 değil |
| A4-7 | `DAY_CHANGED` → 09-12, karar yok | `detect` yine D, `daysLate === 2`; kart tekrar görünür (bellek-içi kapatma sıfırlandı) |
| A4-8 | 09-11'de `ActiveSessionService.start(templateId)` (ad-hoc) | `MissedWorkoutPendingError`, yazma yok |
| A4-9 | Yalnızca "Gerçekten atla" sonrası | idx 4, `sequence_events` 4 satır, `cause='skipped'`, `scheduled_workout_id = D` |

#### TV-AT05 · Workout'u reschedule et → calendar doğru

Ön koşul: TV-R88.3 adım 6. Takvim görünümü = `scheduled_workouts` (`planned_date_key`) ∪ `workout_sessions` (`calendar_date_key`) ∪ `forecast`.

| # | Eylem | Beklenen `scheduled_workouts` | Beklenen takvim görünümü (09-07 … 09-17) | Sıra |
|---|-------|-------------------------------|-------------------------------------------|------|
| A5-1 | `moveToDate(D, '2026-09-14')` | D: `rescheduled`, `rescheduled_to_id = E`, `resolved_at_utc` set; E: `planned`, `planned_date_key = 09-14`, `sequence_index = 3`, `workout_template_id = T3`, `rescheduled_from_id = D`, `reschedule_reason = 'moveToDate'` | 09-07/08/09 ✔ completed (A, B, C); 09-10 "Upper → 14 Eyl'e taşındı" (D); 09-11/12/13 boş; **09-14 Upper (planlandı)**; 09-15 Lower (öngörü); 09-16 Pull (öngörü, 2. tur); 09-17 Push (öngörü) | 3 |
| A5-2 | `moveToDate(E, '2026-09-16')` (zincir) | E: `rescheduled` → G; G: `planned` 09-16, `rescheduled_from_id = E`; zincir D → E → G tamamen sorgulanabilir | 09-14 "→ 16 Eyl'e taşındı"; 09-16 Upper (planlandı); öngörü 09-17'den itibaren | 3 (R88.7) |
| A5-3 | `moveToDate(D, '2026-09-09')` | `InvalidRescheduleDateError`; D değişmedi, satır sayısı aynı | değişmedi | 3 |
| A5-4 | `moveToDate(E, '2026-09-14')` (aynı tarih) | no-op (`newId === oldId`) | değişmedi | 3 |
| A5-5 | `moveToToday(D)` 09-11 | E: 09-11 `moveToToday` | **09-11 Upper (planlandı, bugün)**; 09-14 Lower (öngörü) | 3 |
| A5-6 | A5-1 sonrası `detect` 09-11/12/13 | `null` (plan gelecekte) | | |
| A5-7 | A5-1 sonrası 09-15'te açılış (E yapılmadı) | `detect → { E, daysLate 1 }`; öngörü 09-16'dan başlar | | 3 |
| A5-8 | A5-1 sonrası `moveToDate(E, '2026-12-08')` (bitişten sonra) | izin verilir; takvimde `isBeyondProgramEnd` uyarısı | | 3 |
| A5-9 | `reschedule` sırasında `inProgress` plan | `InvalidTransitionError` | | |

#### TV-PAUSE · Dondurma 5 gün, strict vs activeDays

Ön koşul: F1; 09-16 Çar'da idx 2 tamamlanmış, **P**: planned 09-17 idx 3 açık.

| Adım | Gün | Eylem | → `programs` / `program_pauses` | → `scheduled_workouts` | → `challengeDay` strict / activeDays | Not |
|------|-----|-------|----------------------------------|------------------------|--------------------------------------|-----|
| 1 | 09-16 | `pause({ reason: 'travel' })` | `status='paused'`; pause `{ start_date_key 09-16, started_at_utc, time_zone, end_* NULL, reason 'travel' }` | P dokunulmadı (planned 09-17) | 10 / 10 | R89.2, R89.8 |
| 2 | 09-18 | bootstrap | — | P planned 09-17 | 12 / 10 | `detect → null` (R89.3); `ensurePlanned → none/programNotActive` |
| 3 | 09-20 | bootstrap | — | — | 14 / 10 | uyarı yok |
| 4 | 09-21 Pzt | `resume()` | pause `end_date_key=09-21`, `ended_at_utc`; `status='active'` | P: rescheduled → **P'**: planned **09-21** idx 3, `reschedule_reason='resume'`; `ensurePlanned → exists(P')` | 15 / 10 | idx **3** aynı (R89.4); `sequence_events` yok |
| 5 | 09-22 | bootstrap | — | P' planned 09-21 → `detect → { P', daysLate 1 }` (yapılmadıysa) | 16 / 11 | dondurma sonrası normal akış |
| 6 | — | `projectedEndDateKey` | — | — | 12-05 / 12-10 | |
| 7 | 09-16 (paused) | `pause()` tekrar | `ProgramNotActiveError('paused')` | — | — | yazma yok |
| 8 | 09-16, aktif oturum var | `pause()` | `ActiveSessionExistsError` | — | — | A-6 |
| 9 | 09-16, idx 3 kısmi karar bekliyor | `pause()` | `PendingPartialDecisionError` | — | — | A-6 |
| 10 | 09-21 (active) | `resume()` | `ProgramNotPausedError('active')` | — | — | |
| 11 | 09-16 | `pause()` + aynı gün `resume()` | pause [09-16, 09-16) → 0 gün | P dokunulmadı (09-17 ≥ 09-16) | 10 / 10 | E6 |
| 12 | 09-25 | `setCalendarMode('activeDays')` | `calendar_mode='activeDays'`; `settings_history` `{ key 'program.calendarMode', old '"strictCalendar"', new '"activeDays"' }` | — | 19 → **14** | tarih/plan/indeks değişmedi |
| 13 | 09-25 | `setCalendarMode('activeDays')` tekrar | no-op, `settings_history` satırı eklenmez | — | 14 | |
| 14 | 09-16 dondur, 09-15 20:00 LA'da devam (tz batı) | `resume()` | `end_date_key = max('09-15','09-16') = 09-16` → 0 gün | — | — | E8 |

#### TV-FSM · Kısmi antrenman kararları ve `cancelSession`

Ön koşul: TV-R88.3 adım 8' (E: inProgress 09-11 Cum idx 3; oturum `calendar_date_key` 09-11).

| # | Eylem | → `scheduled_workouts` | → `workout_sessions` | → idx / `sequence_events` | → `ensurePlanned` |
|---|-------|------------------------|----------------------|---------------------------|-------------------|
| F-1 | `finish("Bugün burada bitir", remainingExerciseIds=['ex-a','ex-b'])` | E: `partiallyCompleted`, `partial_decision NULL`, `resolved_at_utc NULL`, `remaining_exercise_ids_json=["ex-a","ex-b"]` | `status='partial'`, `ended_reason='finishHereToday'` | 3 / — | `none/pendingPartialDecision`; kart "Kısmi antrenman kararı bekliyor" |
| F-2 | F-1 → `decidePartial(countAsDone)` | E: `partial_decision='countAsDone'`, `resolved_at_utc` | — | **4** / (3→4, `partialCountedDone`, E) | `created` **H**: planned 09-14 idx 4 (earliest 09-12) |
| F-3 | F-1 → `decidePartial(continueLater)` (kalanlar F-1'deki `finish` ile yazılmıştı: `['ex-a','ex-b']`) | E: `partial_decision='continueLater'`, `resolved_at_utc`, `rescheduled_to_id=K`; **K**: planned 09-14 idx **3**, `remaining_exercise_ids_json=["ex-a","ex-b"]`, `reschedule_reason='partialContinuation'`, `rescheduled_from_id=E` | — | 3 / — | `exists(K)` |
| F-4 | F-1 → `decidePartial(continueLater, [])` | `InvalidTransitionError`, yazma yok | — | 3 / — | |
| F-5 | F-2 → `decidePartial(countAsDone)` tekrar (farklı `commandId`) | `InvalidTransitionError` (karar verilmiş) | — | 4 / satır sayısı aynı | |
| F-6 | F-3 → 09-15'te açılış (K yapılmadı) | `detect → { K, daysLate 1, remainingExerciseIds 2 }` — kart "kalan 2 hareket" | — | 3 / — | `exists(K)` |
| F-7 | F-3 → `moveToDate(K, 09-16)` | K: rescheduled → K': planned 09-16 idx 3, `remaining_exercise_ids_json` **taşındı** | — | 3 / — | |
| F-8 | F-3 → K başlat → `finish(allDone)` | K: `completed` | `completed` | **4** / (3→4, `completed`, K) | `created` idx 4 |
| F-9 | E inProgress → `cancel(userCancel)` | E: **planned**, `planned_date_key` 09-11 korunur, yeni kayıt yok | `status='cancelled'`, `ended_reason='userCancel'`; `set_logs.discarded=1` | 3 / — | `exists(E)` |
| F-10 | F-9 → 09-12 açılış | `detect → { E, daysLate 1 }` | — | 3 / — | kart |
| F-11 | E inProgress (23:30 başladı) → 09-12 resume kartı "Antrenmanı İptal Et" | E: planned 09-11 → anında missed | `ended_reason='resumeCardCancel'` | 3 / — | kart (E26) |
| F-12 | F-1 → `pause()` | `PendingPartialDecisionError` | — | 3 / — | |
| F-13 | F-2 iki kez aynı `commandId` | ikinci çağrı no-op | — | 4 / tam 1 yeni satır | tek H |

### 1.6 İlgili gereksinimler

| Gereksinim | Karşılandığı yer |
|------------|------------------|
| R88.1, R88.2 | I-1; `ChallengeCalendar` (türetilmiş) ile `programs.training_sequence_index` (saklı) ayrımı; C8 |
| R88.3 | T10 türetimi, `MissedWorkoutResolver.detect`, TV-R88.3 adım 6, TV-AT04 |
| R88.4 | `ScheduledWorkoutStatus` (5 durum + `inProgress`), `missed` türetilmiş görünüm (T10) |
| R88.5 | `moveToToday` / `moveToDate` / `skipForReal` (1.2.5), T2, T8 |
| R88.6 | I-2, `advanceSequence` tek giriş noktası, `SequenceAdvanceCause`, T4/T6/T8, TV-SEQ S-5..S-9 |
| R88.7 | T2 (sıra değişmez; `rescheduled_from_id`/`rescheduled_to_id` zinciri), TV-AT05 A5-2 |
| R88.8 | C1, C7; `challengeDay` sıradan bağımsız |
| R89.1, R89.2 | `PauseService.pause(reason?)`, `PauseReason` |
| R89.3 | `advanceSequence` guard, `detect` guard, `ensurePlanned` adım 1, TV-PAUSE 2–3 |
| R89.4 | P2 (`reason='resume'`, sıra aynı), TV-PAUSE 4 |
| R89.5, R89.6 | C1–C3, C6, `setCalendarMode`, TV-CAL C-6..C-14 |
| R89.7 | I-2 (dondurmada ve mod değişiminde `sequence_events` yok) |
| R89.8 | `program_pauses` (`started_at_utc`, `start_date_key`, `time_zone`, `end_*`), C3 |
| R90.4, R90.5 | `inProgress` plan missed sayılmaz (resume kartı); T9 |
| R103.2, R103.3 | T5, T6, T7 |
| R112.1, R112.2, R112.5 | `daysBetween` / `dayOfWeek` yalnızca gün anahtarı; `clock.todayKey()`; `refreshProgramDay` (`DAY_CHANGED`, `TZ_CHANGED`) |
| R113.3 | `earliest = max(today, session.calendar_date_key + 1)` (E11) |
| R117.3 | `command_log` idempotency (E25), hata tablosu 1.4.2 |
| R123.1, R123.4 | `phase`, `projectedEndDateKey: null`, `ForecastEntry.isVirtual` |
| AT-04 | TV-AT04 |
| AT-05 | TV-AT05 |
| AT-06 (kısmen) | T5–T7 durumları `AdherenceCalculator`'a girdi sağlar |
| AT-13 (kısmen) | TV-CAL C-17, E9 |

### Tutarsızlık / açık nokta

- **A-1 (ÇÖZÜLDÜ; 02 §3'e `Scheduler` eklendi)** `Scheduler` 02 §3 modül haritasında (`domain/program/`: ChallengeCalendar, TrainingSequence, PauseService, MissedWorkoutResolver) listelenmiyor; §6.2 ve §17'de kullanılıyor. Bu belge `domain/program/Scheduler` varsayar; §3 güncellenmeli.
- **A-2 (ÇÖZÜLDÜ; 02 §6.3 `is_cyclic` bayrağı + `sequence_wraps` sayacı olarak yeniden yazıldı)** 02 §6.3 "Bölüm I'e göre lineer ise `programs.sequence_wraps = 0`" ifadesi 03 ile çelişir: 03'te lineer/döngüsel bayrağı `program_templates.is_cyclic`, `sequence_wraps` ise "kaç kez başa döndü" sayacıdır. Bu belge `is_cyclic`'i bayrak, `sequence_wraps`'ı sayaç olarak kullanır; 02 düzeltilmeli.
- **A-3 (ÇÖZÜLDÜ; 02 §6.5'e açık, onaylı "Antrenman sırasını düzelt" eylemi eklendi — `advanceSequence()` dışından, yalnızca kullanıcı isteğiyle)** `sequence_events.cause='manualAdjust'` 03'te tanımlı ama 02'de hiçbir akış üretmiyordu; R88.6 "başka hiçbir yol sırayı ilerletemez" der. Karar gerekli: değer 03'ten kaldırılmalı ya da Program Settings'te açık, onaylı bir "Sırayı düzelt" eylemi (aktif plan yokken, ayrı fonksiyon) tanımlanmalı. Bu belge `advanceSequence()`'ten kabul etmez (`SequenceAdvanceCause`).
- **A-4 (ÇÖZÜLDÜ)** `reschedule_reason='cancelSession'` 03'ten kaldırıldı; iptal yerinde geri açmadır (`inProgress → planned`, yeni kayıt yok, T9). Ayrıca 02 §6.3 bu davranışı açıkça yazar ve iptal edilen oturumun PR'ları `voided=1` olur.
- **A-5** Lineer programda sıra bitince ve/veya Day 90 geçilince davranış tanımsız: `programs.status='completed'` geçişi ve `programs.completed_at_utc` kolonunun yazarı 02'de yok (otomatik mi, kullanıcı onayıyla mı?). Bu belge nöbetçi değer `training_sequence_index = templates.length` + `isExhausted` + `phase='finished'` sinyallerini üretir, geçişi tanımlamaz.
- **A-6 (ÇÖZÜLDÜ; guard'lar 02 §6.5'e eklendi)** `pause()` guard'ları 02'de yoktu: aktif oturum varken veya karar bekleyen kısmi antrenman varken dondurma. Bu belge her ikisini reddeder (`ActiveSessionExistsError`, `PendingPartialDecisionError`); aksi halde R89.3 (dondurmada sıra ilerlemez) ile bitirme/karar akışı çatışır.
- **A-7 (ÇÖZÜLDÜ; 02 §6.3'e "Kısmi karar bekliyor" durumu eklendi)** Karar verilmemiş kısmi antrenman (`partiallyCompleted` + `partial_decision IS NULL`; uygulama karar ekranında kapandı) 02'de ele alınmamış. Bu belge `ensurePlanned` için `pendingPartialDecision` engelini ve "Kısmi antrenman kararı bekliyor" kartını tanımlar; aksi halde aynı `sequence_index` için ikinci bir tam plan oluşurdu.
- **A-8 (ÇÖZÜLDÜ; 02 §6.1'e `end_date_key ?? today` kuralı yazıldı)** Açık dondurma (`end_date_key IS NULL`) için `pausedDays` sayımı belirtilmemişti. Bu belge geçici bitiş = bugün (`end_date_key ?? today`) kuralını seçer; böylece `challengeDay` dondurma günü geri gitmez, monoton kalır ve kapalı aralık `[start, end)` tanımıyla tutarlıdır.
- **A-9 (ÇÖZÜLDÜ; 02 §6.3'e "Başlatma ve tarih" kuralı eklendi)** `planned_date_key ≠ today` olan planın başlatılması (kaçırılmış veya erken) 02'de tanımsız. Bu belge `markInProgress` içinde önce `reschedule(today, 'moveToToday')` uygular → değişmez: açık/tamamlanmış planın `planned_date_key` = oturumun `calendar_date_key` (override hariç). Alternatif (planı yerinde bırakmak) adherence haftasını kaydırır.
- **A-10** `reschedule_reason`'ın eski mi yeni kayda mı yazıldığı 03'te belirsiz. Bu belge: YENİ kayda (`rescheduled_from_id` ile birlikte); eski kayıt yalnızca `rescheduled_to_id` taşır.
- **A-11** Takvim modu değişimi için `settings_history.key` 03'te örneklenmemiş; bu belge `'program.calendarMode'` kullanır. `settings_history` ayar tablosuyken değişen kolon `programs.calendar_mode`'dur — 02 §6.5 böyle istediği için izlendi.
- **A-12** Kaçırılan antrenman kartının "kapatılabilir ama ertesi gün yeniden görünür" davranışı için saklama yeri 02'de yok. Bu belge bellek-içi (`todayKey` anahtarlı, `DAY_CHANGED`'de sıfırlanan) seçer; uygulama aynı gün yeniden açılınca kart tekrar görünür (kabul edilebilir: sessiz atlama yok).
- **A-13** Şu adlar 02/03'te yok, mevcut kalıplardan türetildi: repository portları (`ProgramRepository`, `ScheduledWorkoutRepository`, `ProgramPauseRepository`, `SequenceEventRepository`, `WorkoutTemplateRepository`, `TrainingProfileRepository`, `WorkoutSessionRepository`, `SettingsHistoryRepository` — `core/db/repositories/`), satır tipleri (`ProgramRow`, `ProgramPauseRow`, `ScheduledWorkoutRow`, `SequenceEventRow`, `WorkoutTemplateRow` — 03 §4 `<Tablo>Row`), zaman yardımcıları (`daysBetween`, `addDays`, `dayOfWeek` — `core/time`), `alreadyExecuted` (`command_log`), sonuç tipleri (`ChallengeDayInfo`, `SequencePosition`, `SequenceAdvanceResult`, `EnsurePlannedResult`, `ForecastEntry`, `MissedWorkout`) ve hata sınıfları (`InvalidTransitionError`, `ProgramNotActiveError`, `ProgramNotPausedError`, `ActiveSessionExistsError`, `PendingPartialDecisionError`, `InvalidRescheduleDateError`, `MissedWorkoutPendingError`, `SequencePlanMismatchError`). Hata sınıfları 02 §15 tablosuna eklenmeli.
- **A-14 (ÇÖZÜLDÜ; 02 §6.4 reddediyor)** Geçmiş bir güne taşıma (`newDateKey < today`) 02'de yasaklanmamış; bu belge reddeder (`InvalidRescheduleDateError`), aksi halde plan anında tekrar `missed` olur.
- **A-15 (ÇÖZÜLDÜ; 02 §6.2'ye `earliest` kuralı eklendi)** 02 §6.2 sonraki planı "bugünden itibaren ilk uygun gün" diyordu; bu, tamamlanan antrenmanın gününe ikinci plan koyar ve ertesi gün sahte "kaçırıldı" üretir. Bu belge tamamlama/`countAsDone` için `earliest = max(today, session.calendar_date_key + 1)`, skip/resume/bootstrap için `today` kuralını getirir.
- **A-16 (ÇÖZÜLDÜ; 02 §6.1'e `phase` alanı eklendi)** `start_date_key` gelecekte olan program (henüz başlamadı) 02'de yok: `ensurePlanned` başlangıçtan önce plan yapmamalı (`earliest ≥ start_date_key`) ve `clamp(…, 1, 90)` "başlamadı"yı Day 1 gibi gösterir. Bu belge `phase` alanı ekler (R123).
- **A-17 (ÇÖZÜLDÜ; 02 §5.5'e kart metni kuralı eklendi)** Timezone doğuya seyahatte bugünün planı yerel gün atladığı için anında `missed` görünebilir (02 §5.5 ±1 gün "beklenen"). Kart metninin takvim günü değişimini açıklaması gerekir; UX kararı açık.


---

## 2. ActiveSessionService, komut modeli ve RestTimerService (§90, §91, §113)

> Kapsam: aktif antrenman oturumunun yaşam döngüsü (`start` → komutlar → `finish` / `cancel`), her komutun transaction içeriği ve `command_id` ile idempotent tekrarı, taslak (draft) alanları, `hydrate()` ile `useActiveWorkoutStore`'un doldurulması, `AppBootstrap` resume kartı, `calendar_date_key` varsayılanı/override'ı ve arka plan güvenli `RestTimerService`. Mimari sözleşme: `02-architecture.md` §5.2–§5.4, §6.3, §7.1, §7.2, §15; şema: `03-data-model.md` §1.1 (`command_log`), §1.5 (`scheduled_workouts`), §1.6 (`workout_sessions`, `session_exercises`, `set_logs`, `set_log_revisions`, `rest_timers`, `personal_records`).

### 2.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Sorumluluk | Girdi | Çıktı / yan etki |
|---------|------------|-------|------------------|
| `ActiveSessionService` (`domain/workout`) | Tek aktif oturumun yaşam döngüsü; her kullanıcı eylemini **tek transaction** olarak DB'ye yazmak (R90.1, R90.6); `scheduled_workouts` FSM'ine ve `advanceSequence()`'e yalnızca izin verilen geçişlerden dokunmak (R88.6). | Komut nesneleri (`commandId` + payload), `Clock`, `Db`, `PrDetector`, `RestTimerService`, `LocalNotificationScheduler` | `CommandResult<T>`; DB satırları; `personal_records`; commit **sonrası** bildirim planla/iptal. |
| `RestTimerService` (`domain/workout`) | `rest_timers` satırının yaşam döngüsü; kalan sürenin **yalnızca** zaman damgasından türetilmesi (R91.2, R91.3); bildirim planlama/iptal (R91.5, R91.6). | `Clock`, `Db`, `LocalNotificationScheduler`, `settings['notifications.restTimer']` | `RestTimer`; `remaining()` saf fonksiyon; `notification_id`. |
| `useActiveWorkoutStore` (`features/active-workout`) | DB'nin türevi olan in-memory görünüm (R90.7). Optimistic update **yok**; her komut commit edildikten sonra `hydrate()`. | `ActiveSessionService.hydrate()` | `ActiveWorkoutSnapshot \| null` |
| `AppBootstrap` (`app/`) | Açılışta `findActive()`; varsa **"Devam eden antrenmanın var."** kartı (R90.4, R90.5); karar verilmemiş kısmi antrenman varsa karar kartı; `Scheduler.ensurePlanned` ve `MissedWorkoutResolver.detect()` (02 §6.4). | DB | Ekran yönlendirmesi; kart aksiyonları → servis komutları. |

**Değişmezler (invariant):**

| # | Değişmez | Zorlayıcı |
|---|----------|-----------|
| I1 | En fazla bir `workout_sessions.status='active'` satırı. | `ux_sessions_single_active` + `start()` ön kontrolü (R90.3) |
| I2 | En fazla bir `rest_timers.state='running'` satırı. | `ux_rest_single_running` + `closeRunningInTx()` |
| I3 | Bellekte bekleyen yazma yoktur; `AppState` geçişinde yalnızca `flushDraftInputs()` çağrılır. | 02 §7.1, R90.2 |
| I4 | `command_log` satırı komutun geri kalanıyla **aynı** transaction'da yazılır; tekrar gelen aynı `command_id` no-op'tur, yarım yazma imkânsızdır. | `claimCommand()` (R117.3) |
| I5 | `programs.training_sequence_index` bu bölümde yalnızca `finish → completed` ve `decidePartial(countAsDone)` yollarından, yalnızca `advanceSequence()` ile değişir. `cancel`, `finish → partial`, ad-hoc oturum **asla** ilerletmez. | R88.6, R88.3 ("sessiz ilerleme yok") |
| I6 | `calendar_date_key` yalnızca `start()`'ta `localDateKey(started_at_utc, time_zone)` ile hesaplanır; yalnızca `overrideCalendarDate` ile değişir ve bu `calendar_date_overridden=1` bırakır. | R113.2–R113.4 |
| I7 | Kalan dinlenme süresi hiçbir yerde sayaç olarak tutulmaz; her okuma `remaining(timer, clock.nowUtc())`. | R91.1, R91.3 |

### 2.2 TypeScript arayüzleri ve sözde kod

#### 2.2.1 Ortak tipler ve portlar

```ts
// core/clock (02 §5.2) — aynen
export interface Clock { nowUtc(): Date; timeZone(): string; todayKey(): string; }

// core/time (02 §5) — türetilmiş yardımcılar
export function localDateKey(utc: Date, timeZone: string): string;        // 'YYYY-MM-DD'
export function utcOffsetMinutes(utc: Date, timeZone: string): number;    // date-fns-tz getTimezoneOffset(tz, utc)/60000

// core/db — 03 §2'deki Tx portunun bu bölümde kullanılan alt kümesi
export interface Tx {
  exec(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db { withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>; }   // BEGIN IMMEDIATE … COMMIT / ROLLBACK

// core/notifications (02 §7.2, §15)
export interface LocalNotificationScheduler {
  /** Bildirim izni yoksa NotificationPermissionDenied fırlatır; atUtc geçmişteyse null döner. */
  schedule(input: { atUtc: Date; title: string; body: string; data?: Record<string, string> }): Promise<string | null>;
  cancelNotification(notificationId: string): Promise<void>;                 // yok/teslim edilmiş id → no-op
}

// 03 §3 tipleri aynen: SessionStatus, Side, SetType, RawLoad, SetLog, PrType
// workout_sessions satırının camelCase izdüşümü (03'te TS tipi yok; kolonlardan türetildi)
export interface WorkoutSession {
  id: string; programId: string | null; scheduledWorkoutId: string | null; workoutTemplateId: string | null;
  status: SessionStatus; startedAtUtc: string; completedAtUtc: string | null;
  calendarDateKey: string; calendarDateOverridden: boolean; timeZone: string; utcOffsetMinutes: number;
  bodyweightKgSnapshot: number | null;
  endedReason: 'allDone' | 'finishHereToday' | 'resumeCardFinish' | 'resumeCardCancel' | 'userCancel' | null;
  note: string | null; createdAtUtc: string; updatedAtUtc: string;
}
// session_exercises satırı (türetilmiş ad: SessionExercise)
export interface SessionExercise {
  id: string; sessionId: string; orderIndex: number; exerciseId: string; originalExerciseId: string | null;
  substitutionReason: string | null; trackingMode: 'bothSame' | 'separate';
  status: 'pending' | 'inProgress' | 'done' | 'skipped';
  plannedWorkingSets: number; plannedWarmupSets: number; repMin: number; repMax: number; targetRir: number; restSeconds: number;
  draftLoad: RawLoad | null; draftReps: number | null; draftRir: number | null;    // draft_load_json / draft_reps / draft_rir
  note: string | null; updatedAtUtc: string;
}
// rest_timers satırı — 02 §7.2 RestTimer arayüzü aynen (+ updatedAtUtc)
export interface RestTimer {
  id: string; sessionId: string; sessionExerciseId?: string | null; setLogId?: string | null;
  restStartedAtUtc: string; restDurationSeconds: number;
  state: 'running' | 'completed' | 'skipped';
  notificationId: string | null; updatedAtUtc: string;
}
```

#### 2.2.2 Komut modeli ve idempotent `command_id`

Her kullanıcıya görünen eylem bir **komut**tur (02 §7.1). Kurallar:

1. `commandId` (UUID v4, `expo-crypto`) **UI'da basma anında** üretilir ve aynı eylemin her retry'ında **aynı** kalır (02 §15: "retry aynı seti iki kez yazmaz").
2. Komut tek `db.withTransaction` içinde çalışır; ilk ifade `command_log` INSERT'idir. Çakışma → komut daha önce commit edilmiş demektir → hiçbir şey yazılmadan `{ applied:false, reason:'duplicate' }` döner. Transaction geri alınırsa `command_log` satırı da geri alınır → retry temiz başlar (I4).
3. Doğal olarak idempotent (last-write-wins UPDATE) komutlar `command_log`'a yazılmaz: `draftInput`, `setNote`. Bunların tekrarı da aynı sonucu üretir; 02 §15'teki "her komut idempotent" ifadesi korunur.
4. `set_logs.command_id UNIQUE` ikinci bir korkuluktur: duplicate replay'de orijinal set `SELECT … FROM set_logs WHERE command_id=?` ile bulunur; diğer komutlar için `hydrate()` yeterlidir (`command_log`'da sonuç kolonu yoktur → bkz. açık nokta).

```ts
export type CommandType =
  | 'startSession' | 'completeSet' | 'editSet' | 'substituteExercise' | 'skipExercise' | 'reorderExercises'
  | 'startRest' | 'skipRest' | 'finishSession' | 'cancelSession' | 'decidePartial' | 'overrideCalendarDate';
  // draftInput, setNote: command_log'suz (kural 3)

export interface CommandEnvelope { commandId: string; }
export type CommandResult<T> = { applied: true; value: T } | { applied: false; reason: 'duplicate' };
const duplicate = <T>(): CommandResult<T> => ({ applied: false, reason: 'duplicate' });
const applied   = <T>(value: T): CommandResult<T> => ({ applied: true, value });

async function claimCommand(tx: Tx, cmd: CommandEnvelope, type: CommandType, now: Date): Promise<boolean> {
  const r = await tx.exec(
    `INSERT INTO command_log(command_id, command_type, executed_at_utc) VALUES (?,?,?)
     ON CONFLICT(command_id) DO NOTHING`, [cmd.commandId, type, now.toISOString()]);
  return r.changes === 1;   // false → zaten uygulanmış
}
```

| Komut | `command_log` | Yazılan tablolar (aynı tx) | Commit sonrası yan etki | Gereksinim |
|-------|:---:|----------------------------|-------------------------|-----------|
| `startSession` | ✔ | `workout_sessions` INSERT, `session_exercises` INSERT×n, `scheduled_workouts.status='inProgress'` | — | R90.3, R113.3 |
| `completeSet` | ✔ | `set_logs` INSERT, `session_exercises` (status, draft→NULL), `personal_records` (PrDetector), `rest_timers` (eskiyi kapat + yeni `running`) | eski bildirimi iptal, yenisini planla → `rest_timers.notification_id` | R90.1, R90.6, R107, R91.5 |
| `editSet` | ✔ | `set_logs` UPDATE, `set_log_revisions` INSERT, PR yeniden değerlendirme | — | R90.1 |
| `substituteExercise` | ✔ | `session_exercises.exercise_id`, `original_exercise_id` (korunur), `substitution_reason`, `tracking_mode`, draft→NULL | — | R99.7 |
| `skipExercise` | ✔ | `session_exercises.status` (`skipped` ↔ geri al) | — | R90.1, R103 |
| `reorderExercises` | ✔ | `session_exercises.order_index` (iki geçişli, `UNIQUE(session_id, order_index)`) | — | R90.1 |
| `startRest` / `skipRest` | ✔ | `rest_timers` INSERT / UPDATE | planla / iptal | R91.5, R91.6 |
| `setNote` | – | `session_exercises.note` / `workout_sessions.note` | — | R90.1 |
| `draftInput` | – | `session_exercises.draft_load_json/draft_reps/draft_rir` | — | R90.1 |
| `finishSession` | ✔ | `workout_sessions` (status/completed_at/ended_reason), `session_exercises`, `rest_timers` kapat, `scheduled_workouts` + `sequence_events` + `programs` + sıradaki plan (`Scheduler.finish`, §1 T4/T5; yalnızca `completed`'da ilerler), `personal_records` (sessionVolumePr) | bildirim iptal | R88.6, R103, R113 |
| `cancelSession` | ✔ | `workout_sessions` (`cancelled`), `set_logs.discarded=1`, `personal_records` geri al, `rest_timers` kapat, `scheduled_workouts.status='planned'` | bildirim iptal | R90.5, R88.6 |
| `decidePartial` | ✔ | `Scheduler.decidePartial` (§1 T6/T7): `scheduled_workouts` (`partial_decision`, `resolved_at_utc`; `continueLater` → yeni `planned` satır), `countAsDone` → `sequence_events` + `programs` + sıradaki plan | — | R88.6, R103.3 |
| `overrideCalendarDate` | ✔ | `workout_sessions.calendar_date_key`, `calendar_date_overridden=1`, oturumun `set_logs.local_date_key` ve `personal_records.local_date_key` | — | R113.4 |

#### 2.2.3 `ActiveSessionService`

```ts
export interface ActiveSessionService {
  findActive(): Promise<WorkoutSession | null>;                       // SELECT … WHERE status='active' (0/1 satır)
  start(cmd: StartSessionCommand): Promise<CommandResult<{ sessionId: string }>>;
  completeSet(cmd: CompleteSetCommand): Promise<CommandResult<CompleteSetOutcome>>;
  editSet(cmd: EditSetCommand): Promise<CommandResult<void>>;
  substituteExercise(cmd: SubstituteExerciseCommand): Promise<CommandResult<void>>;
  skipExercise(cmd: SkipExerciseCommand): Promise<CommandResult<void>>;
  reorderExercises(cmd: ReorderExercisesCommand): Promise<CommandResult<void>>;
  setNote(cmd: SetNoteCommand): Promise<void>;
  draftInput(cmd: DraftInputCommand): Promise<void>;
  flushDraftInputs(): Promise<void>;                                   // AppState inactive|background ve ekran blur
  finish(cmd: FinishSessionCommand): Promise<CommandResult<FinishOutcome>>;
  decidePartial(cmd: DecidePartialCommand): Promise<CommandResult<void>>;
  cancel(cmd: CancelSessionCommand): Promise<CommandResult<void>>;
  overrideCalendarDate(cmd: OverrideCalendarDateCommand): Promise<CommandResult<void>>;
  hydrate(reason?: 'coldStart' | 'foreground' | 'afterCommand'): Promise<ActiveWorkoutSnapshot | null>;   // varsayılan 'afterCommand'
}
```

**`start` — R90.3, R113.3, 02 §7.1**

```ts
export interface StartSessionCommand extends CommandEnvelope {
  source: { scheduledWorkoutId: string } | { workoutTemplateId: string };   // 02: start(scheduledWorkoutId | templateId)
}

async start(cmd) {
  const now = clock.nowUtc(), tz = clock.timeZone(), iso = now.toISOString();
  return db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'startSession', now))) return duplicate();
    const active = await tx.get<{ id: string }>(`SELECT id FROM workout_sessions WHERE status='active'`);
    if (active) throw new ActiveSessionExistsError(active.id);                    // UI → resume kartı (I1)

    let sched: ScheduledWorkoutRow | undefined, programId: string | null, templateId: string, remaining: string[] | null = null;
    if ('scheduledWorkoutId' in cmd.source) {
      sched = await tx.get(`SELECT * FROM scheduled_workouts WHERE id=?`, [cmd.source.scheduledWorkoutId]);
      if (!sched || sched.status !== 'planned') throw new InvalidStateError('scheduledWorkoutNotPlanned');
      programId = sched.program_id; templateId = sched.workout_template_id;
      remaining = sched.remaining_exercise_ids_json ? JSON.parse(sched.remaining_exercise_ids_json) : null; // kısmi devam (03 §1.5)
    } else {                                                                       // ad-hoc: plan yok, sıra etkilenmez (I5)
      templateId = cmd.source.workoutTemplateId;
      programId = (await tx.get<{ id: string }>(`SELECT id FROM programs WHERE status IN ('active','paused')`))?.id ?? null;
    }
    const sessionId = uuid();
    // 02 §7.1: son 14 gün içindeki son tartı; yoksa NULL (bodyweight türlerinde effective load 'bilinmiyor')
    const bw = await tx.get<{ weight_kg: number }>(`SELECT weight_kg FROM weight_logs WHERE measured_at_utc >= ? ORDER BY measured_at_utc DESC LIMIT 1`, [isoMinusDays(now, 14)]);
    await tx.exec(`INSERT INTO workout_sessions
        (id, program_id, scheduled_workout_id, workout_template_id, status, started_at_utc, completed_at_utc,
         calendar_date_key, calendar_date_overridden, time_zone, utc_offset_minutes, bodyweight_kg_snapshot,
         ended_reason, note, created_at_utc, updated_at_utc)
       VALUES (?,?,?,?,'active',?,NULL,?,0,?,?,?,NULL,NULL,?,?)`,
      [sessionId, programId, sched?.id ?? null, templateId, iso,
       localDateKey(now, tz),                       // R113.3: başlangıç yerel tarihi (I6)
       tz, utcOffsetMinutes(now, tz), bw?.weight_kg ?? null, iso, iso]);

    const rows = await tx.all<TemplateExerciseRow & { default_tracking_mode: string | null }>(
      `SELECT te.*, ues.default_tracking_mode FROM template_exercises te
         LEFT JOIN user_exercise_settings ues ON ues.exercise_id = te.exercise_id
        WHERE te.workout_template_id=? ORDER BY te.order_index`, [templateId]);
    let order = 0;
    for (const te of rows) {
      if (remaining && !remaining.includes(te.exercise_id)) continue;             // yalnızca kalan hareketler
      await tx.exec(`INSERT INTO session_exercises
          (id, session_id, order_index, exercise_id, original_exercise_id, substitution_reason, tracking_mode, status,
           planned_working_sets, planned_warmup_sets, rep_min, rep_max, target_rir, rest_seconds,
           draft_load_json, draft_reps, draft_rir, note, updated_at_utc)
         VALUES (?,?,?,?,NULL,NULL,?,'pending',?,?,?,?,?,?,NULL,NULL,NULL,NULL,?)`,
        [uuid(), sessionId, order++, te.exercise_id, te.default_tracking_mode ?? 'bothSame',   // 02 §7.4
         te.working_sets, te.warmup_sets, te.rep_min, te.rep_max, te.target_rir, te.rest_seconds, iso]);
    }
    if (sched) await Scheduler.markInProgress(tx, { scheduledWorkoutId: sched.id, todayKey: clock.todayKey() });
    // §1 T3: status='inProgress'; guard: programs.status='active' ve planned_date_key = todayKey (geçmiş tarihli plan → önce "Bugüne taşı", 02 §6.4)
    return applied({ sessionId });
  });
}
```

Prefill değerleri (02 §7.3 sırası) DB'ye yazılmaz; `hydrate()` sırasında geçmiş `set_logs` ve `recommendations`'tan hesaplanır (bkz. açık nokta). `ux_sessions_single_active` ihlali (`SQLITE_CONSTRAINT`) `ActiveSessionExistsError`'a eşlenir.

**`completeSet` — R90.1, R90.6, R107, R91.5**

```ts
export interface CompleteSetCommand extends CommandEnvelope {
  sessionId: string; sessionExerciseId: string;
  setIndex: number;                         // oturum-hareket içinde tek artan indeks (warmup 1..w, working w+1..w+n) — bkz. açık nokta
  setType: SetType; side: Side;             // tracking_mode 'bothSame' → 'both'; 'separate' → 'left' | 'right'
  raw: RawLoad; reps: number; rir: number | null; rpe?: number | null;
  excludeFromPr?: boolean; painFlag?: boolean; formBreakdownFlag?: boolean; note?: string | null;
  rest?: { start: boolean; durationSeconds?: number };   // varsayılan { start: true }, süre = session_exercises.rest_seconds
}
export interface CompleteSetOutcome { setLogId: string; restTimerId: string | null; prs: PrType[]; exerciseStatus: SessionExercise['status']; }

// Zod: reps int ≥ 0; rir int 0..6 | null; raw alanı load_progression_type'a göre zorunlu (R101):
//   externalLoadHigherIsHarder → loadKg ≥ 0 · assistanceLowerIsHarder → assistanceKg ≥ 0 · machineLevel → machineLevel int ≥ 0
//   bodyweight → (yok; bodyweightKgSnapshot oturumdan) · bodyweightPlusExternalLoad → loadKg ≥ 0 · distanceOrBand → bandRank | distanceCm

async completeSet(cmd) {
  const now = clock.nowUtc(), iso = now.toISOString();
  const out = await db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'completeSet', now))) return null;
    const s  = await tx.get<WorkoutSessionRow>(`SELECT * FROM workout_sessions WHERE id=? AND status='active'`, [cmd.sessionId]);
    if (!s) throw new SessionNotActiveError(cmd.sessionId);
    const se = await tx.get<SessionExerciseRow>(`SELECT * FROM session_exercises WHERE id=? AND session_id=?`, [cmd.sessionExerciseId, s.id]);
    if (!se) throw new InvalidStateError('sessionExerciseNotFound');
    if (se.status === 'skipped') throw new InvalidStateError('exerciseSkipped');          // önce skipExercise(skipped:false)
    const ex = await tx.get<{ load_progression_type: string }>(`SELECT load_progression_type FROM exercises WHERE id=?`, [se.exercise_id]);
    validateRawForType(cmd.raw, ex.load_progression_type);                                  // Zod refine → ValidationError
    if ((se.tracking_mode === 'bothSame') !== (cmd.side === 'both')) throw new ValidationError('sideVsTrackingMode');

    const setLogId = uuid();
    try {
      await tx.exec(`INSERT INTO set_logs
          (id, command_id, session_id, session_exercise_id, exercise_id, set_index, set_type, side,
           load_kg, assistance_kg, machine_level, band_rank, distance_cm, bodyweight_kg_snapshot,
           reps, rir, rpe, exclude_from_pr, pain_flag, form_breakdown_flag, discarded,
           completed_at_utc, local_date_key, time_zone, note)
         VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,0, ?,?,?,?)`,
        [setLogId, cmd.commandId, s.id, se.id, se.exercise_id, cmd.setIndex, cmd.setType, cmd.side,
         cmd.raw.loadKg ?? null, cmd.raw.assistanceKg ?? null, cmd.raw.machineLevel ?? null, cmd.raw.bandRank ?? null,
         cmd.raw.distanceCm ?? null, cmd.raw.bodyweightKgSnapshot ?? s.bodyweight_kg_snapshot,
         cmd.reps, cmd.rir, cmd.rpe ?? null, +!!cmd.excludeFromPr, +!!cmd.painFlag, +!!cmd.formBreakdownFlag,
         iso,
         s.calendar_date_key,          // aidiyet: oturumun takvim günü (R113.1) — bkz. açık nokta
         clock.timeZone(),             // denetim: kayıt anındaki tz (02 §5.1)
         cmd.note ?? null]);
    } catch (e) { if (isUniqueViolation(e, 'set_logs')) throw new SetAlreadyLoggedError(se.id, cmd.setIndex, cmd.side); throw e; }

    const { n } = await tx.get<{ n: number }>(`SELECT COUNT(DISTINCT set_index) AS n FROM set_logs
        WHERE session_exercise_id=? AND set_type='working' AND discarded=0`, [se.id]);
    const exerciseStatus = n >= se.planned_working_sets ? 'done' : 'inProgress';
    await tx.exec(`UPDATE session_exercises SET status=?, draft_load_json=NULL, draft_reps=NULL, draft_rir=NULL, updated_at_utc=?
                   WHERE id=?`, [exerciseStatus, iso, se.id]);

    const prs = (cmd.setType === 'working' && !cmd.excludeFromPr)
      ? await prDetector.detectForSet(tx, setLogId)                                        // R107.2, R107.3; aynı tx (bkz. PR bölümü)
      : [];

    let restTimerId: string | null = null, toCancel: string[] = [];
    if (cmd.rest?.start !== false) {
      toCancel = await restTimers.closeRunningInTx(tx, now);                               // I2: eski running → completed|skipped
      restTimerId = await restTimers.startInTx(tx, { sessionId: s.id, sessionExerciseId: se.id, setLogId,
        durationSeconds: cmd.rest?.durationSeconds ?? se.rest_seconds, now });
    }
    return { setLogId, restTimerId, prs, exerciseStatus, toCancel };
  });
  if (!out) return duplicate();
  // ---- commit SONRASI yan etkiler (native çağrılar transaction içinde yapılmaz) ----
  for (const id of out.toCancel) await scheduler.cancelNotification(id);                  // R91.6
  if (out.restTimerId) await restTimers.scheduleNotification(out.restTimerId);            // R91.5 → notification_id UPDATE
  return applied(out);
}
```

**`editSet`, `substituteExercise`, `skipExercise`, `reorderExercises`, `setNote`**

```ts
export interface EditSetCommand extends CommandEnvelope {
  setLogId: string;
  patch: Partial<Pick<SetLog, 'raw' | 'reps' | 'rir' | 'rpe' | 'setType' | 'excludeFromPr' | 'painFlag' | 'formBreakdownFlag' | 'note'>>;
}
// tx: claim → before = SELECT set_logs (oturum active olmalı) → UPDATE set_logs (patch) →
//     INSERT set_log_revisions(id, set_log_id, before_json, after_json, revised_at_utc) →
//     session_exercises.status yeniden hesapla (set_type değiştiyse) → prDetector.reevaluate(tx, setLogId) (aynı tx)

export interface SubstituteExerciseCommand extends CommandEnvelope { sessionExerciseId: string; newExerciseId: string; reason?: string; }
// tx: claim → se = SELECT (oturum active) →
//     set_logs (discarded=0) varsa InvalidStateError('setsAlreadyLogged') (bkz. açık nokta) →
//     UPDATE session_exercises SET exercise_id=new, original_exercise_id=COALESCE(original_exercise_id, exercise_id)   -- R99.7
//         , substitution_reason=?, tracking_mode=COALESCE(ues.default_tracking_mode,'bothSame'),
//           draft_load_json=NULL, draft_reps=NULL, draft_rir=NULL, updated_at_utc=?

export interface SkipExerciseCommand extends CommandEnvelope { sessionExerciseId: string; skipped: boolean; }
// tx: claim → skipped=true  → status='skipped', draft→NULL
//             skipped=false → status = (logged working sets > 0 ? 'inProgress' : 'pending')

export interface ReorderExercisesCommand extends CommandEnvelope { sessionId: string; orderedSessionExerciseIds: string[]; }
// tx: claim → küme eşitliği kontrolü (tüm ve yalnızca oturumun hareketleri) →
//     1. geçiş: UPDATE order_index = -(i+1)   2. geçiş: UPDATE order_index = i     -- UNIQUE(session_id, order_index) çakışmasını önler

export interface SetNoteCommand { target: { sessionExerciseId: string } | { sessionId: string }; note: string | null; }
// command_log yok; tek UPDATE (session_exercises.note | workout_sessions.note), updated_at_utc
```

**Taslak alanları — `draftInput`, `flushDraftInputs` (R90.1, 02 §7.1)**

```ts
export interface DraftInputCommand { sessionExerciseId: string; draft: { raw?: RawLoad | null; reps?: number | null; rir?: number | null }; }
// UPDATE session_exercises SET draft_load_json=?, draft_reps=?, draft_rir=?, updated_at_utc=? WHERE id=? AND status<>'skipped'
```

- Stepper (`+/-`) dokunuşu → **anında** `draftInput`. Klavye girişi → UI'da ≤ 300 ms debounce; `flushDraftInputs()` bekleyen değeri hemen yazar (AppState `inactive|background`, ekran blur, `completeSet` öncesi).
- Hareket başına tek taslak (bir sonraki set). `completeSet`, `substituteExercise`, `skipExercise` taslağı **aynı tx**'te NULL'lar.
- `hydrate()` prefill önceliği: **draft** (kullanıcının kendi girdisi) > 02 §7.3 sırası (aynı oturumda önceki set → son oturumda aynı set indeksi → `Recommendation` → şablon hedefi). Draft'ın bu sıraya eklenmesi türetilmiş karardır (açık nokta).

**`finish` — R103.1–R103.3, R88.6, R113.3, 02 §7.5**

```ts
export interface FinishSessionCommand extends CommandEnvelope {
  sessionId: string;
  origin: 'workoutScreen' | 'resumeCard';
  skipRemainingExerciseIds?: string[];   // özet ekranında kullanıcı "kalan hareketleri atla" dediyse → aynı tx'te skipped
}
export type FinishOutcome =
  | { status: 'completed'; sequenceAdvanced: boolean }
  | { status: 'partial'; scheduledWorkoutId: string | null; remainingExerciseIds: string[]; decisionRequired: boolean };

async finish(cmd) {
  const now = clock.nowUtc(), iso = now.toISOString();
  const out = await db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'finishSession', now))) return null;
    const s = await tx.get<WorkoutSessionRow>(`SELECT * FROM workout_sessions WHERE id=? AND status='active'`, [cmd.sessionId]);
    if (!s) throw new SessionNotActiveError(cmd.sessionId);

    for (const id of cmd.skipRemainingExerciseIds ?? [])
      await tx.exec(`UPDATE session_exercises SET status='skipped', draft_load_json=NULL, draft_reps=NULL, draft_rir=NULL, updated_at_utc=?
                     WHERE id=? AND session_id=?`, [iso, id, s.id]);

    // Tamamlanma kuralı (02 §7.5): skipped olmayan her hareketin working set sayısı ≥ planned_working_sets
    const exs = await tx.all<{ id: string; exercise_id: string; original_exercise_id: string | null; status: string; planned_working_sets: number; logged: number }>(
      `SELECT se.id, se.exercise_id, se.original_exercise_id, se.status, se.planned_working_sets,
              (SELECT COUNT(DISTINCT sl.set_index) FROM set_logs sl
                WHERE sl.session_exercise_id=se.id AND sl.set_type='working' AND sl.discarded=0) AS logged
         FROM session_exercises se WHERE se.session_id=? ORDER BY se.order_index`, [s.id]);
    const unresolved = exs.filter(e => e.status !== 'skipped' && e.logged < e.planned_working_sets);
    const status: SessionStatus = unresolved.length === 0 ? 'completed' : 'partial';
    const endedReason = cmd.origin === 'resumeCard' ? 'resumeCardFinish' : (status === 'completed' ? 'allDone' : 'finishHereToday');

    await tx.exec(`UPDATE workout_sessions SET status=?, completed_at_utc=?, ended_reason=?, updated_at_utc=? WHERE id=?`,
      [status, iso, endedReason, iso, s.id]);                     // calendar_date_key DEĞİŞMEZ (R113.3, I6)
    for (const e of exs.filter(e => e.status === 'inProgress' && e.logged >= e.planned_working_sets))
      await tx.exec(`UPDATE session_exercises SET status='done', updated_at_utc=? WHERE id=?`, [iso, e.id]);
    await tx.exec(`UPDATE session_exercises SET draft_load_json=NULL, draft_reps=NULL, draft_rir=NULL WHERE session_id=?`, [s.id]);
    const toCancel = await restTimers.closeRunningInTx(tx, now);  // R91.6: oturum bitişinde running → skipped|completed
    if (status === 'completed') await prDetector.detectSessionVolumePr(tx, s.id);   // R107.1 sessionVolumePr; aynı tx

    let sequenceAdvanced = false;
    const remainingIds = unresolved.map(e => e.original_exercise_id ?? e.exercise_id);   // şablon hareket id'leri
    if (s.scheduled_workout_id) {                                   // FSM geçişi §1 Scheduler.finish (T4/T5), AYNI tx
      const adv = await Scheduler.finish(tx, { scheduledWorkoutId: s.scheduled_workout_id,
        outcome: status === 'completed' ? 'completed' : 'partiallyCompleted',
        sessionCalendarDateKey: s.calendar_date_key, todayKey: clock.todayKey() });
      // completed → status='completed', advanceSequence(cause 'completed'), ensurePlanned(earliest = max(today, calendar_date_key+1))
      // partial   → status='partiallyCompleted', partial_decision=NULL (karar ayrı komut; sessiz ilerleme yok)
      sequenceAdvanced = adv !== null;
      if (status === 'partial')                                     // kalan hareketler DB'de: uygulama kapansa da karar verilebilir
        await tx.exec(`UPDATE scheduled_workouts SET remaining_exercise_ids_json=? WHERE id=?`, [JSON.stringify(remainingIds), s.scheduled_workout_id]);
    }
    return { status, sequenceAdvanced, remainingIds, scheduledWorkoutId: s.scheduled_workout_id, toCancel };
  });
  if (!out) return duplicate();
  for (const id of out.toCancel) await scheduler.cancelNotification(id);
  return applied(out.status === 'completed'
    ? { status: 'completed', sequenceAdvanced: out.sequenceAdvanced }
    : { status: 'partial', scheduledWorkoutId: out.scheduledWorkoutId, remainingExerciseIds: out.remainingIds,
        decisionRequired: out.scheduledWorkoutId !== null });
}
```

`Scheduler.finish` ve `TrainingSequence.advanceSequence(tx, { programId, cause, scheduledWorkoutId })` bu belgenin §1'inde tanımlıdır (02 §6.3: `programs.training_sequence_index` +1, `is_cyclic` sarması, `sequence_events(cause)` INSERT). `advanceSequence` program `active` değilse `ProgramNotActiveError` fırlatır (R89.3) ve **tüm** `finish` transaction'ı geri alınır. `finish → partial` **hiçbir zaman** sırayı ilerletmez (I5).

**`decidePartial` — R88.6, R103.3, 02 §6.3**

```ts
export interface DecidePartialCommand extends CommandEnvelope { scheduledWorkoutId: string; decision: 'countAsDone' | 'continueLater'; }
// tx: claim → sw = SELECT scheduled_workouts WHERE id=? AND status='partiallyCompleted' AND partial_decision IS NULL (yoksa InvalidStateError)
//     s  = SELECT workout_sessions WHERE scheduled_workout_id=sw.id AND status='partial' ORDER BY completed_at_utc DESC LIMIT 1
//     Scheduler.decidePartial(tx, { scheduledWorkoutId: sw.id, decision,
//                                   remainingExerciseIds: JSON.parse(sw.remaining_exercise_ids_json ?? '[]'),   // finish'te yazıldı
//                                   sessionCalendarDateKey: s.calendar_date_key, todayKey: clock.todayKey() })   // §1 T6/T7
//  countAsDone   : partial_decision='countAsDone', resolved_at_utc; advanceSequence(cause 'partialCountedDone');
//                  ensurePlanned(earliest = max(today, calendar_date_key+1))
//  continueLater : partial_decision='continueLater', resolved_at_utc, rescheduled_to_id=<new>; yeni satır 'planned', AYNI sequence_index,
//                  reschedule_reason='partialContinuation', remaining_exercise_ids_json taşınır,
//                  planned_date_key = firstPreferredDayOnOrAfter(today+1)  (başka gün istenirse ardından §1 T2 moveToDate)
```

**`cancel` — R90.5, 02 §7.1 ("set kayıtları silinmez, `discarded=1`"), 02 §6.3 (`inProgress → planned`)**

```ts
export interface CancelSessionCommand extends CommandEnvelope { sessionId: string; origin: 'workoutScreen' | 'resumeCard'; }

async cancel(cmd) {
  const now = clock.nowUtc(), iso = now.toISOString();
  const out = await db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'cancelSession', now))) return null;
    const s = await tx.get<WorkoutSessionRow>(`SELECT * FROM workout_sessions WHERE id=? AND status='active'`, [cmd.sessionId]);
    if (!s) throw new SessionNotActiveError(cmd.sessionId);
    await tx.exec(`UPDATE workout_sessions SET status='cancelled', cancelled_at_utc=?, ended_reason=?, updated_at_utc=? WHERE id=?`,
      [iso, cmd.origin === 'resumeCard' ? 'resumeCardCancel' : 'userCancel', iso, s.id]);   // 03: cancelled_at_utc (completed_at_utc NULL kalır)
    await tx.exec(`UPDATE set_logs SET discarded=1 WHERE session_id=?`, [s.id]);              // silinmez; v_set_effective_load dışlar
    // Bu oturumda üretilen PR'ları geçersiz kıl (03: personal_records.voided); zincir onarılır, satır silinmez (geçmiş korunur)
    await tx.exec(`UPDATE personal_records SET superseded_by_id=NULL
                   WHERE superseded_by_id IN (SELECT id FROM personal_records WHERE session_id=?)`, [s.id]);
    await tx.exec(`UPDATE personal_records SET voided=1 WHERE session_id=?`, [s.id]);
    await prDetector.reevaluate(tx, { exerciseIds: await sessionExerciseIds(tx, s.id) });      // §7: önceki en iyi yeniden 'güncel' olur
    await tx.exec(`UPDATE session_exercises SET draft_load_json=NULL, draft_reps=NULL, draft_rir=NULL, updated_at_utc=? WHERE session_id=?`, [iso, s.id]);
    const toCancel = await restTimers.closeRunningInTx(tx, now);
    if (s.scheduled_workout_id)                                                                 // §1 T9: inProgress → planned; tarih korunur; sıra ilerlemez (I5)
      await Scheduler.reopenAfterCancel(tx, { scheduledWorkoutId: s.scheduled_workout_id });    // = UPDATE scheduled_workouts SET status='planned', updated_at_utc
    return { toCancel };
  });
  if (!out) return duplicate();
  for (const id of out.toCancel) await scheduler.cancelNotification(id);
  return applied(undefined);
}
```

Plan geri açılırken `planned_date_key` korunur; tarih bugünden eskiyse plan bir sonraki açılışta **kaçırılan antrenman** kartı olarak görünür (02 §6.4) — sessizce atlanmaz, sessizce bugüne de taşınmaz.

**`overrideCalendarDate` — R113.4, 02 §5.3**

```ts
export interface OverrideCalendarDateCommand extends CommandEnvelope { sessionId: string; calendarDateKey: string; }
// Ön koşul: DateKey regex; calendarDateKey ≤ clock.todayKey() (gelecek tarih → ValidationError); status ∈ {active, completed, partial}
// tx: claim →
//   UPDATE workout_sessions SET calendar_date_key=?, calendar_date_overridden=1, updated_at_utc=? WHERE id=?
//   UPDATE set_logs        SET local_date_key=? WHERE session_id=?          -- aidiyet oturumla birlikte taşınır (açık nokta)
//   UPDATE personal_records SET local_date_key=? WHERE session_id=?
// scheduled_workouts.planned_date_key DEĞİŞMEZ (planlama geçmişi); adherence "yapılan" günü workout_sessions.calendar_date_key'den okur.
```

**`hydrate` — R90.7, 02 §7.1**

```ts
export interface ActiveWorkoutSnapshot {
  session: WorkoutSession;
  exercises: SessionExerciseView[];                 // order_index sırası
  restTimer: RestTimer | null;                      // rest_timers WHERE state='running' (0/1)
  prsThisSession: PersonalRecordRow[];              // rozetler için
  hydratedAtUtc: string;
}
export interface SessionExerciseView extends SessionExercise {
  sets: SetLog[];                                   // discarded=0; set_index, side sırası
  loggedWorkingSets: number;                        // COUNT(DISTINCT set_index) WHERE set_type='working'
  nextSetIndex: number;                             // max(set_index)+1 (yoksa 1)
  prefill: { raw: RawLoad; reps: number | null; rir: number | null;
             source: 'draft' | 'sameSession' | 'lastSession' | 'recommendation' | 'template' };
}

async hydrate(reason = 'afterCommand') {
  const snap = await db.withTransaction(async tx => {                       // tek okuma tx (WAL snapshot); yalnızca SELECT
    const s = await tx.get<WorkoutSessionRow>(`SELECT * FROM workout_sessions WHERE status='active'`);
    if (!s) return null;
    const exs   = await tx.all(`SELECT * FROM session_exercises WHERE session_id=? ORDER BY order_index`, [s.id]);
    const sets  = await tx.all(`SELECT * FROM set_logs WHERE session_id=? AND discarded=0 ORDER BY session_exercise_id, set_index, side`, [s.id]);
    const timer = await tx.get(`SELECT * FROM rest_timers WHERE state='running'`);
    const prs   = await tx.all(`SELECT * FROM personal_records WHERE session_id=?`, [s.id]);
    const prefills = await prefillResolver.resolve(tx, s, exs);              // 02 §7.3 sırası + draft
    return assemble(s, exs, sets, timer, prs, prefills, clock.nowUtc());
  });
  if (snap?.restTimer) {                                                     // yazan adımlar tx dışında, idempotent
    const t = await restTimers.complete();                                   // süre dolduysa tembel 'completed' (02 §7.2)
    snap.restTimer = t?.state === 'running' ? t : null;
    if (snap.restTimer) await restTimers.ensureNotification(snap.restTimer, { reschedule: reason === 'coldStart' });
  }
  return snap;
}
```

Store sözleşmesi (`useActiveWorkoutStore`, Zustand):

```ts
interface ActiveWorkoutStore {
  snapshot: ActiveWorkoutSnapshot | null;
  status: 'idle' | 'hydrating' | 'ready' | 'error'; error: AppError | null;
  hydrate(): Promise<void>;                                                  // service.hydrate() → set({ snapshot })
  dispatch<T>(run: () => Promise<CommandResult<T>>): Promise<CommandResult<T>>;   // await run(); await hydrate(); — optimistic update YOK
}
```

`dispatch` hata durumunda (`DbWriteError`) store'u **değiştirmez**; UI 02 §15'teki Türkçe mesajla aynı `commandId` ile "Yeniden dene" sunar.

#### 2.2.4 `RestTimerService`

```ts
export interface StartRestCommand extends CommandEnvelope {
  sessionId: string; sessionExerciseId?: string; setLogId?: string;
  durationSeconds: number;                 // Zod: int ≥ 1 (DB CHECK > 0); UI ön ayarları 30–300 s, +15/−15 adım
}
export interface SkipRestCommand extends CommandEnvelope { restTimerId: string; }

export interface RestTimerService {
  start(cmd: StartRestCommand): Promise<CommandResult<RestTimer>>;
  skip(cmd: SkipRestCommand): Promise<CommandResult<void>>;
  complete(now?: Date): Promise<RestTimer | null>;                         // tembel: running ∧ remaining=0 → 'completed'
  running(): Promise<RestTimer | null>;
  remaining(timer: Pick<RestTimer, 'restStartedAtUtc' | 'restDurationSeconds'>, nowUtc: Date): number;   // saf
  ensureNotification(timer: RestTimer, opts: { reschedule: boolean }): Promise<void>;
  // ActiveSessionService'in aynı transaction'da kullandığı iç metotlar
  closeRunningInTx(tx: Tx, now: Date): Promise<string[]>;                  // iptal edilecek notification_id listesi
  startInTx(tx: Tx, input: { sessionId: string; sessionExerciseId?: string; setLogId?: string; durationSeconds: number; now: Date }): Promise<string>;
  scheduleNotification(restTimerId: string): Promise<void>;                // commit sonrası
}
```

**`remaining()` — R91.3 (02 §7.2 formülü + alt/üst sınır)**

```ts
remaining(timer, nowUtc) {
  const elapsedSec = Math.floor((nowUtc.getTime() - Date.parse(timer.restStartedAtUtc)) / 1000);
  return Math.min(timer.restDurationSeconds, Math.max(0, timer.restDurationSeconds - elapsedSec));
}
// max(0, …)  : 02 §7.2 aynen.  min(duration, …): cihaz saati geriye alınmışsa (elapsed < 0) süreden büyük değer göstermemek için eklendi (açık nokta).
// UTC milisaniye üzerinden hesaplandığı için DST/timezone değişimi etkisizdir (02 §5.5, R91.4).
```

**`closeRunningInTx` / `startInTx` (I2)**

```ts
async closeRunningInTx(tx, now) {
  const r = await tx.get<RestTimerRow>(`SELECT * FROM rest_timers WHERE state='running'`);
  if (!r) return [];
  const next = this.remaining(toRestTimer(r), now) === 0 ? 'completed' : 'skipped';   // süre dolduysa 'completed' (02 §7.2 tembel kural)
  await tx.exec(`UPDATE rest_timers SET state=?, updated_at_utc=? WHERE id=? AND state='running'`, [next, now.toISOString(), r.id]);
  return next === 'skipped' && r.notification_id ? [r.notification_id] : [];         // teslim edilmiş bildirim iptal edilmez
}
async startInTx(tx, i) {
  const id = uuid();
  await tx.exec(`INSERT INTO rest_timers
      (id, session_id, session_exercise_id, set_log_id, rest_started_at_utc, rest_duration_seconds, state, notification_id, updated_at_utc)
     VALUES (?,?,?,?,?,?,'running',NULL,?)`,
    [id, i.sessionId, i.sessionExerciseId ?? null, i.setLogId ?? null, i.now.toISOString(), i.durationSeconds, i.now.toISOString()]);
  return id;   // rest_started_at_utc = set'in completed_at_utc ile AYNI 'now' (completeSet içinde)
}
```

**`start` / `skip` / `complete` / `scheduleNotification` / `ensureNotification`**

```ts
async start(cmd) {                                                    // bağımsız "dinlenme başlat" butonu (completeSet dışı)
  const now = clock.nowUtc();
  const out = await db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'startRest', now))) return null;
    if (!(await tx.get(`SELECT 1 FROM workout_sessions WHERE id=? AND status='active'`, [cmd.sessionId]))) throw new SessionNotActiveError(cmd.sessionId);
    const toCancel = await this.closeRunningInTx(tx, now);
    const id = await this.startInTx(tx, { ...cmd, now });
    return { id, toCancel };
  });
  if (!out) return duplicate();
  for (const n of out.toCancel) await scheduler.cancelNotification(n);
  await this.scheduleNotification(out.id);
  return applied((await this.running())!);
}

async skip(cmd) {                                                     // R91.6
  const now = clock.nowUtc();
  const out = await db.withTransaction(async tx => {
    if (!(await claimCommand(tx, cmd, 'skipRest', now))) return null;
    const r = await tx.get<RestTimerRow>(`SELECT * FROM rest_timers WHERE id=?`, [cmd.restTimerId]);
    if (!r) throw new InvalidStateError('restTimerNotFound');
    if (r.state !== 'running') return { toCancel: [] };               // zaten kapalı → no-op (idempotent)
    await tx.exec(`UPDATE rest_timers SET state='skipped', updated_at_utc=? WHERE id=? AND state='running'`, [now.toISOString(), r.id]);
    return { toCancel: r.notification_id ? [r.notification_id] : [] };
  });
  if (!out) return duplicate();
  for (const n of out.toCancel) await scheduler.cancelNotification(n);
  return applied(undefined);
}

async complete(now = clock.nowUtc()) {                                // command_log yok: WHERE state='running' koşulu idempotentlik sağlar
  const r = await this.running(); if (!r) return null;
  if (this.remaining(r, now) > 0) return r;
  await db.withTransaction(tx => tx.exec(`UPDATE rest_timers SET state='completed', updated_at_utc=? WHERE id=? AND state='running'`, [now.toISOString(), r.id]));
  return { ...r, state: 'completed' };                                // UI: "Dinlenme bitti" (R91.7)
}

async scheduleNotification(restTimerId) {                             // R91.5; commit SONRASI
  const r = await this.running(); if (!r || r.id !== restTimerId) return;
  if (!(await settings.get<boolean>('notifications.restTimer', true))) return;       // kullanıcı kapattı
  const atUtc = new Date(Date.parse(r.restStartedAtUtc) + r.restDurationSeconds * 1000);
  if (atUtc <= clock.nowUtc()) return;                                // zaten doldu; bildirim anlamsız
  let id: string | null;
  try { id = await scheduler.schedule({ atUtc, title: 'V90', body: 'Dinlenme bitti – sıradaki set', data: { route: '/active-workout' } }); }
  catch (e) { if (e instanceof NotificationPermissionDenied) return; throw e; }       // sessiz; Ayarlar'da açıklama (02 §15)
  if (id) await db.withTransaction(tx => tx.exec(`UPDATE rest_timers SET notification_id=?, updated_at_utc=? WHERE id=? AND state='running'`, [id, clock.nowUtc().toISOString(), r.id]));
}

async ensureNotification(timer, { reschedule }) {                     // hydrate (cold start) ve ön plana dönüş
  if (timer.state !== 'running' || this.remaining(timer, clock.nowUtc()) === 0) return;
  if (timer.notificationId && !reschedule) return;                    // ön planda: OS'teki planlı bildirim geçerli sayılır
  if (timer.notificationId) await scheduler.cancelNotification(timer.notificationId);   // cold start: cihaz yeniden başlamış olabilir → iptal + yeniden planla
  await this.scheduleNotification(timer.id);
}
```

`setInterval(1000)` yalnızca `RestTimerView` bileşenindedir; her tick `remaining(timer, clock.nowUtc())` çağırır ve `0` gördüğünde `RestTimerService.complete()` tetikler (R91.1, R91.3). Bileşen unmount/mount olsa da hiçbir şey kaybolmaz.

#### 2.2.5 `AppBootstrap` resume kartı (R90.4, R90.5)

```ts
async function bootstrapWorkoutState(): Promise<BootstrapCard | null> {
  const active = await activeSession.findActive();
  if (active) {
    const snap = await activeSession.hydrate('coldStart');            // complete() + ensureNotification({reschedule:true})
    return { kind: 'resume', session: active,
             templateNameTr, loggedSets: snap.exercises.reduce((n, e) => n + e.sets.length, 0),
             startedLabel: formatRelative(active.startedAtUtc, clock),           // "Dün 23:50" / "3 saat önce"
             rest: snap.restTimer ? { remaining: restTimers.remaining(snap.restTimer, clock.nowUtc()) } : null };
  }
  const undecided = await db.withTransaction(tx => tx.get<ScheduledWorkoutRow>(
    `SELECT * FROM scheduled_workouts WHERE status='partiallyCompleted' AND partial_decision IS NULL ORDER BY updated_at_utc DESC LIMIT 1`));
  if (undecided) return { kind: 'partialDecision', scheduledWorkout: undecided };   // finish ile karar arasında uygulama kapandıysa (sessiz ilerleme yok)
  await db.withTransaction(tx => Scheduler.ensurePlanned(tx, programId, clock.todayKey()));   // §1 T1, idempotent
  return (await MissedWorkoutResolver.detect(programId, clock.todayKey())) /* 02 §6.4 */ ?? null;
}
```

| Kart butonu | UI akışı | DB etkisi |
|-------------|----------|-----------|
| **Devam Et** | `router.push('/active-workout')`; store zaten hydrate edilmiş. | Yazma yok (yalnızca süresi dolmuş rest timer tembel `completed`). |
| **Antrenmanı Bitir** | `router.push('/active-workout/finish?origin=resumeCard')` → özet: `calendar_date_key` (bugünden farklıysa "Tarih: 7 Eyl · Düzenle"), kaydedilen set sayısı, `completed`/`partial` ön izlemesi, "Kalan hareketleri atla" seçeneği → onay. | `finish({ origin:'resumeCard' })` → `ended_reason='resumeCardFinish'`; sonuç `partial` ve plan varsa → karar diyaloğu → `decidePartial`. Karar verilmezse bootstrap'te `partialDecision` kartı yeniden gelir. |
| **Antrenmanı İptal Et** | Onay diyaloğu: "Bu antrenmanın set kayıtları geçmişte ve analizlerde sayılmayacak; antrenman sırası ilerlemeyecek." | `cancel({ origin:'resumeCard' })` → `status='cancelled'`, `ended_reason='resumeCardCancel'`, `set_logs.discarded=1`, PR geri al, plan `planned`. |

Kart metni yalnızca olguları söyler (şablon adı, başlangıç zamanı, set sayısı, kalan dinlenme); "hazırsın", "antrenmanı tamamlamalısın" gibi yorum yoktur (§123). Kart günler önce başlamış bir oturum için de gösterilir; hiçbir koşulda otomatik bitirme/iptal yapılmaz (§88 ilkesi).

#### 2.2.6 Ön plana dönüş, yeniden başlatma, gün geçişi, timezone

| Olay | ActiveSessionService / store | RestTimerService | Gereksinim |
|------|------------------------------|------------------|-----------|
| `AppState → inactive\|background` | `flushDraftInputs()`; başka yazma yok (bellekte bekleyen veri yok). | Hiçbir şey (durum zamana bağlı). | R90.2, R91.4 |
| `AppState → active` (ön plan) | Aktif antrenman ekranı odaktaysa `hydrate()` (ucuz; DB=UI garantisi). | `complete()` (doldu mu?), `ensureNotification({reschedule:false})`; bileşen `remaining()`'i yeniden hesaplar. | R91.7 |
| Uygulama yeniden başlatma / crash / telefon reboot | `AppBootstrap` → `findActive()` → resume kartı; `hydrate(coldStart)`. | `rest_timers WHERE state='running'` tek satır; `complete()`; `ensureNotification({reschedule:true})` (reboot sonrası OS bildirimi kaybolmuş olabilir; garanti verilmez, yeniden planlanır). | R90.3, R91.8, AT-01, AT-03 |
| Ekran kilidi | Hiçbir olay yok; sayaç ekran açılınca formülden doğru. | — | R91.4, AT-03 |
| Bildirime dokunma | Deep link `/active-workout` → `hydrate()`. | — | 02 §2 |
| `DAY_CHANGED` (gece yarısı) | Aktif antrenman ekranı başlığı (challengeDay) güncellenir; **`calendar_date_key` değişmez**. | Abone değil (02 §5.4). | R112.5, R113.3 |
| `TZ_CHANGED` (seyahat) | Oturumun `time_zone`/`utc_offset_minutes` başlangıç değerleri kalır; yeni setlerin `time_zone`'u yeni tz. | Etkisiz (UTC ms). | R112.2, 02 §5.5 |

**`Clock` portu ile test düzeni**

```ts
export class FakeClock implements Clock {                             // 02 §5.2 FakeClock
  constructor(private iso: string, private tz = 'Europe/Istanbul') {}
  nowUtc() { return new Date(this.iso); }
  timeZone() { return this.tz; }
  todayKey() { return localDateKey(this.nowUtc(), this.tz); }
  advance(seconds: number) { this.iso = new Date(Date.parse(this.iso) + seconds * 1000).toISOString(); }
  set(iso: string) { this.iso = iso; }
  setTimeZone(tz: string) { this.tz = tz; }
}
// Test çiftleri: FakeNotificationScheduler (schedule/cancel çağrılarını kaydeder, izin reddi simüle eder),
// Node SQLite (SQLCipher) üzerinde 001_initial DDL (02 §16). "Uygulama kapatma/crash" = store'u at, aynı DB dosyasını yeniden aç, hydrate().
```

### 2.3 Kural/geçiş tablosu

**A. `workout_sessions.status` (03 `SessionStatus`)**

| Kaynak | Komut | Koşul | Hedef | `ended_reason` | `scheduled_workouts` | Sıra (`training_sequence_index`) |
|--------|-------|-------|-------|----------------|----------------------|----------------------------------|
| (yok) | `startSession` | aktif oturum yok; plan `planned` | `active` | NULL | `planned → inProgress` | değişmez |
| `active` | `completeSet`, `editSet`, `substituteExercise`, `skipExercise`, `reorderExercises`, `setNote`, `draftInput`, `startRest`, `skipRest` | — | `active` | — | — | değişmez |
| `active` | `finishSession` | skipped olmayan her hareket `logged ≥ planned_working_sets` | `completed` | `allDone` / `resumeCardFinish` | `inProgress → completed` + sıradaki plan (`earliest = max(today, calendar_date_key+1)`) | **+1** (`cause='completed'`) |
| `active` | `finishSession` | en az bir hareket eksik | `partial` | `finishHereToday` / `resumeCardFinish` | `inProgress → partiallyCompleted` (`partial_decision=NULL`) | değişmez |
| — | `decidePartial(countAsDone)` | plan `partiallyCompleted ∧ partial_decision IS NULL` | — | — | `partial_decision='countAsDone'` | **+1** (`cause='partialCountedDone'`) |
| — | `decidePartial(continueLater)` | aynı | — | — | `partial_decision='continueLater'` + yeni `planned` (`reschedule_reason='partialContinuation'`, `planned_date_key = firstPreferredDayOnOrAfter(today+1)`) | değişmez |
| `active` | `cancelSession` | — | `cancelled` | `userCancel` / `resumeCardCancel` | `inProgress → planned` (yerinde, tarih korunur) | değişmez |
| `active`/`completed`/`partial` | `overrideCalendarDate` | `key ≤ todayKey` | aynı | — | — | değişmez |
| `completed`/`partial`/`cancelled` | herhangi bir oturum komutu | — | **hata** `SessionNotActiveError` | — | — | — |

**B. `rest_timers.state`**

| Kaynak | Tetikleyici | Hedef | Bildirim |
|--------|-------------|-------|----------|
| (yok) | `completeSet` (rest.start≠false) / `startRest` | `running` | commit sonrası `schedule(at = rest_started_at_utc + rest_duration_seconds)` → `notification_id` |
| `running` | `skipRest` | `skipped` | `cancelNotification` |
| `running` | yeni `completeSet`/`startRest` (I2) | `remaining=0 ? completed : skipped` | `skipped` ise iptal |
| `running` | `finishSession` / `cancelSession` | `remaining=0 ? completed : skipped` | `skipped` ise iptal |
| `running` | `complete()` (tick / ön plan / hydrate), `remaining=0` | `completed` | yok (bildirim zaten teslim edildi) |
| `running` | hydrate(coldStart), `remaining>0` | `running` | iptal + yeniden planla |
| `completed`/`skipped` | herhangi | değişmez (terminal) | — |

**C. `session_exercises.status`**

| Kaynak | Tetikleyici | Hedef |
|--------|-------------|-------|
| `pending` | ilk `completeSet` (herhangi `set_type`) | `logged working ≥ planned ? done : inProgress` |
| `inProgress` | `completeSet` | aynı kural |
| `pending`/`inProgress`/`done` | `skipExercise(true)` | `skipped` |
| `skipped` | `skipExercise(false)` | `logged>0 ? inProgress : pending` |
| `inProgress` | `finishSession` (yeterli set) | `done` |
| `skipped` | `completeSet` | **hata** `InvalidStateError('exerciseSkipped')` |

**D. `calendar_date_key` kuralı (R113)**

| Durum | Değer |
|-------|-------|
| `start()` | `localDateKey(started_at_utc, time_zone)`; `calendar_date_overridden=0` |
| `finish()` 00:10'da | değişmez; `completed_at_utc` gerçek an |
| `overrideCalendarDate` | kullanıcı değeri; `calendar_date_overridden=1`; oturumun `set_logs`/`personal_records.local_date_key` aynı tx'te güncellenir |
| `DAY_CHANGED` / `TZ_CHANGED` | değişmez |

### 2.4 Sınır durumları ve hata durumları

**Sınır durumları**

| # | Durum | Davranış |
|---|-------|----------|
| E1 | Aktif oturum varken `start` | `ActiveSessionExistsError` → UI resume kartını gösterir; DB'ye hiçbir satır yazılmaz (`command_log` dahil geri alınır). |
| E2 | Aynı `commandId` ikinci kez (çift dokunma, retry) | `{applied:false, reason:'duplicate'}`; UI `hydrate()`; `set_logs` satır sayısı değişmez. |
| E3 | Aynı `(session_exercise_id, set_index, side)` farklı `commandId` ile | `SetAlreadyLoggedError` → UI "Bu set zaten kayıtlı; düzenlemek için sete dokun" (`editSet`). |
| E4 | `SQLITE_FULL` / `SQLITE_BUSY` transaction ortasında | `ROLLBACK`; `DbWriteError`; "Kaydedilemedi. Boş alanı kontrol et." + aynı `commandId` ile "Yeniden dene" (02 §15). |
| E5 | Cihaz saati geriye alındı (`now < rest_started_at_utc`) | `remaining` = `rest_duration_seconds` (üst sınır); sayaç geçen süreyi bilemez, tahmin üretmez. |
| E6 | Cihaz saati ileri alındı | Sayaç hemen `0` → `completed`; oturum süresi `completed_at_utc − started_at_utc` negatifse özet "Süre: —" gösterir (sahte kesinlik yok). |
| E7 | Bildirim izni yok / `notifications.restTimer=false` | `notification_id=NULL`; sayaç ve `remaining()` etkilenmez; Ayarlar'da açıklama. |
| E8 | Bildirim planlandıktan sonra uygulama öldü (commit ile `notification_id` UPDATE arası) | Bildirim OS'te kalır, `notification_id NULL`; cold start `ensureNotification({reschedule:true})` yalnızca yeni planlar → en fazla iki bildirim (kabul edilen, nadir). |
| E9 | Telefon reboot | OS'te planlı bildirim kaybolmuş olabilir (platform garantisi yok); cold start iptal + yeniden planlar; kalan süre formülden doğru. |
| E10 | Bildirim, uygulama ön plandayken ve aktif antrenman ekranı açıkken tetiklendi | Notification handler `shouldShowAlert=false` (ekran zaten "Dinlenme bitti" gösterir). |
| E11 | Gece yarısı geçişi (23:50 → 00:10) | `calendar_date_key` başlangıç günü; `DAY_CHANGED` yalnızca başlık; adherence başlangıç gününe yazar. |
| E12 | Aktif oturum günler önce başlamış (unutulmuş) | Resume kartı yine gösterilir ("3 gün önce başladı"); otomatik iptal/bitirme yok. Bitir'de tarih varsayılanı yine başlangıç günü; kullanıcı düzenleyebilir (R113.4). |
| E13 | Set kaydı olmayan oturumda "Bitir" | `partial`, tüm hareketler `remaining`; özet ekranı "Hiç set kaydedilmedi — İptal Et daha uygun olabilir" bilgisi verir, yine de karar kullanıcının. |
| E14 | Ad-hoc oturum (`scheduled_workout_id NULL`) | FSM ve `advanceSequence()` dokunulmaz; `decisionRequired=false`. Sıra yalnızca planlı antrenmanla ilerler (I5). |
| E15 | Kısmi devam planından `start` | `remaining_exercise_ids_json` ile filtrelenmiş `session_exercises`; tam `planned_working_sets` ile (bkz. açık nokta). |
| E16 | `substituteExercise` set kaydı varken | `InvalidStateError('setsAlreadyLogged')`; UI önce set silme/iptal olmadığı için "yeni hareket olarak ekle" akışına yönlendirir (açık nokta). |
| E17 | Unilateral hareket `tracking_mode` ile uyumsuz `side` | `ValidationError('sideVsTrackingMode')`. |
| E18 | Program `paused` iken aktif oturum bitirildi | Normalde oluşmaz: §1 P1 guard'ı aktif oturum varken dondurmayı reddeder. Yine de oluşursa `advanceSequence` `ProgramNotActiveError` fırlatır, **tüm** `finish` tx'i geri alınır, oturum `active` kalır; UI "Önce programı devam ettir." der (sessiz ilerleme yok). |
| E19 | `finish` ile `decidePartial` arasında uygulama kapandı | `partiallyCompleted ∧ partial_decision IS NULL` → bootstrap `partialDecision` kartı; sıra ilerlemedi. |
| E20 | `cancel` sonrası plan tarihi geçmişte | Plan `planned` + eski tarih → kaçırılan antrenman kartı (Bugüne taşı / Başka güne taşı / Gerçekten atla); sessiz karar yok. |

**Hata sınıfları (02 §15 `AppError` taksonomisinden türetilmiş)**

| Sınıf | Ne zaman | Kullanıcıya (TR) | Aksiyon |
|-------|----------|------------------|---------|
| `ActiveSessionExistsError` | E1 | "Devam eden antrenmanın var." | Resume kartı |
| `SessionNotActiveError` | Bitmiş/iptal oturuma komut | "Bu antrenman kapanmış." | Ana ekrana dön, `hydrate()` |
| `SetAlreadyLoggedError` | E3 | "Bu set zaten kayıtlı." | Sete git (düzenle) |
| `InvalidStateError(code)` | plan `planned` değil, hareket `skipped`, timer bulunamadı, karar zaten verilmiş | "Bu işlem şu an yapılamıyor." + Ayrıntılar | `hydrate()` |
| `ProgramNotActiveError`, `InvalidTransitionError`, `SequencePlanMismatchError` (§1) | `Scheduler`/`TrainingSequence` guard'ları (E18, plan-sıra uyuşmazlığı) | "Program dondurulmuş; önce devam ettir." / "Plan durumu beklenenden farklı." + Ayrıntılar | Program Settings; `hydrate()` |
| `ValidationError` (Zod) | raw/tür uyumsuzluğu, `reps<0`, gelecek tarih, `durationSeconds<1` | Alan bazlı Türkçe mesaj | Formu düzelt |
| `DbWriteError` | E4 | "Kaydedilemedi. Boş alanı kontrol et." | Aynı `commandId` ile yeniden dene |
| `NotificationPermissionDenied` | E7 | Sessiz | Ayarlar'da bilgi |

Beklenmeyen hata → ekran düzeyi `ErrorBoundary`; DB'de yarım yazma yoktur çünkü her komut tek transaction'dır (R117.1, R90.6).

### 2.5 Test vektörleri

Ortak fixture: `FakeClock('2026-09-07T05:12:44.000Z', 'Europe/Istanbul')` (yerel 08:12, UTC+3, DST yok); program `training_sequence_index=4`; plan `S1 {sequence_index:4, workout_template_id:'v90-d5-vtaper-upper', planned_date_key:'2026-09-07', status:'planned'}`; şablonda 6 hareket, ilk hareket `lat-pulldown` (`externalLoadHigherIsHarder`, 3 working set, `rest_seconds=90`). `T0` = başlangıç anı.

| ID | Senaryo | Adımlar (girdi) | Beklenen çıktı |
|----|---------|-----------------|----------------|
| TV-2.01 (AT-01) | Başlat → kapat → aç | `start({scheduledWorkoutId:S1})` → store at, DB yeniden aç, `+15 min` → `findActive()`, `hydrate()` | `workout_sessions`: 1 satır `active`, `started_at_utc=T0`, `calendar_date_key='2026-09-07'`, `time_zone='Europe/Istanbul'`, `utc_offset_minutes=180`; `session_exercises` 6 satır `pending`; `S1.status='inProgress'`; resume kartı görünür; **Devam Et** → aynı `sessionId`, yazma yok. |
| TV-2.02 (AT-02) | Set logla → crash → aç | `completeSet(c1: lat-pulldown, setIndex 1, working, both, loadKg 80, reps 11, rir 2)` → store at, DB yeniden aç → `hydrate()` | `set_logs` 1 satır (`command_id='c1'`, `load_kg=80`, `reps=11`, `local_date_key='2026-09-07'`); `session_exercises[0].status='inProgress'`, draft NULL; `rest_timers` 1 `running` (`rest_duration_seconds=90`, `rest_started_at_utc=T0`). |
| TV-2.03 (idempotency) | Aynı komut tekrar | TV-2.02 sonrası `completeSet(c1)` yeniden | `{applied:false, reason:'duplicate'}`; `set_logs` hâlâ 1; `rest_timers` hâlâ 1; `command_log` 1 satır `c1`. |
| TV-2.04 (R117.3) | Yazma hatası → retry | `set_logs` INSERT'te `SQLITE_FULL` enjekte → `completeSet(c2)` → hata; disk boşalt → `completeSet(c2)` | İlk çağrı `DbWriteError`, `command_log`'da `c2` **yok**, `set_logs` 0; ikinci çağrı `applied:true`, `set_logs` 1. |
| TV-2.05 (E3) | Aynı set indeksi farklı komut | `completeSet(c3, setIndex 1, both)` (c1'den sonra) | `SetAlreadyLoggedError`; `set_logs` 1; `command_log`'da `c3` yok. |
| TV-2.06 (AT-03) | 90 s dinlenme, kilit | timer `T0`, 90 s. `+40 s` ekran kilidi (olay yok). `+70 s` kilit açıldı → `remaining()` | `20`; `state='running'`; `FakeNotificationScheduler` tek `schedule(at=T0+90 s)`, iptal yok. |
| TV-2.07 (AT-03 devam) | Süre doldu | `+90 s` tick → `complete()`; `+95 s` ön plan | `+90`: `remaining=0`, DB `state='completed'`; `+95`: `running()` → null, UI "Dinlenme bitti"; `cancelNotification` çağrılmadı. |
| TV-2.08 (R91.8) | Timer sırasında yeniden başlatma | timer `T0` 90 s, `notification_id='n1'`; `+40 s` uygulama öldü; `+70 s` cold start `hydrate()` | `remaining=20`, `running`; `cancelNotification('n1')` + `schedule(at=T0+90 s)` → `notification_id='n2'`. `+100 s` cold start → `completed` yazılır, `schedule` çağrılmaz. |
| TV-2.09 (R91.6) | Dinlenmeyi atla | `skipRest(c4, timerId)` `+30 s` | `state='skipped'`; `cancelNotification(notification_id)` 1 kez; tekrar `skipRest(c4)` → duplicate, iptal çağrısı tekrarlanmaz. |
| TV-2.10 (I2) | Dinlenme bitmeden sonraki set | `+50 s` `completeSet(c5, setIndex 2)` | Eski timer `skipped` + iptal; yeni timer `running`, `rest_started_at_utc=T0+50 s`; `ux_rest_single_running` ihlali yok. |
| TV-2.11 (E7) | Bildirim izni yok | Scheduler `NotificationPermissionDenied` fırlatsın; `completeSet(c6)` | Komut `applied:true`; `rest_timers.notification_id=NULL`; `remaining()` doğru; hata kullanıcıya gösterilmez. |
| TV-2.12 (E5) | Saat geri alındı | timer `T0` 90 s; `clock.set(T0 − 30 s)` | `remaining=90` (120 değil). |
| TV-2.13 (R113.1, İstanbul) | 23:50 başla, 00:10 bitir | `clock.set('2026-09-07T20:50:00Z')` (yerel 23:50) `start(S1)`; `+15 min` `completeSet`; `+20 min` (yerel 00:10, 8 Eyl) `finish({origin:'workoutScreen', skipRemainingExerciseIds:[…5 hareket]})` | `calendar_date_key='2026-09-07'`, `completed_at_utc='2026-09-07T21:10:00Z'`, `todayKey()='2026-09-08'`; `set_logs.local_date_key='2026-09-07'`; `status='completed'`, `ended_reason='allDone'`; `S1.status='completed'`; `training_sequence_index=5`; `sequence_events` 1 satır `cause='completed'`; yeni plan `planned`, `sequence_index=5`, `planned_date_key ≥ '2026-09-08'` (antrenman gününe ikinci plan yok). |
| TV-2.14 (R113.1, UTC-negatif) | Aynı senaryo New York | `FakeClock('2026-09-08T03:50:00Z','America/New_York')` (yerel 7 Eyl 23:50) `start` | `calendar_date_key='2026-09-07'` (UTC günü 09-08 **değil**); `utc_offset_minutes=-240`. |
| TV-2.15 (R113.4) | Tarih override | TV-2.13 sonrası `overrideCalendarDate(c7, '2026-09-08')` | `calendar_date_key='2026-09-08'`, `calendar_date_overridden=1`; oturumun `set_logs.local_date_key='2026-09-08'`; `S1.planned_date_key='2026-09-07'` değişmez. `'2026-09-09'` (gelecek) → `ValidationError`. |
| TV-2.16 (R103, resume kartı) | Kısmi bitir | 6 hareketten 2'si tam, timer running; cold start → **Antrenmanı Bitir** → `finish({origin:'resumeCard'})` | `status='partial'`, `ended_reason='resumeCardFinish'`, `completed_at_utc=now`; timer `skipped` + iptal; `S1.status='partiallyCompleted'`, `remaining_exercise_ids_json` 4 id, `partial_decision=NULL`; `training_sequence_index=4` (değişmedi); `decisionRequired=true`. |
| TV-2.17 (R88.6) | Kısmi karar | TV-2.16 → `decidePartial('countAsDone')` / alternatif `decidePartial('continueLater')` | countAsDone: `partial_decision='countAsDone'`, index `5`, `sequence_events.cause='partialCountedDone'`, yeni plan `sequence_index=5`. continueLater: index `4`; yeni `scheduled_workouts` `planned`, `sequence_index=4`, `planned_date_key = firstPreferredDayOnOrAfter('2026-09-08')` (tercih günü yoksa `'2026-09-08'`), `reschedule_reason='partialContinuation'`, `rescheduled_from_id=S1`, `remaining_exercise_ids_json` 4 id; `S1.rescheduled_to_id=new`. |
| TV-2.18 (E19) | Karar öncesi kapanış | TV-2.16 sonrası (karar yok) cold start | `bootstrapWorkoutState()` → `{kind:'partialDecision'}`; index hâlâ `4`. |
| TV-2.19 (R90.5, iptal) | Resume kartından iptal | 3 set (biri `loadPr` üretmiş, önceki PR `p0.superseded_by_id=p1`), timer running → **Antrenmanı İptal Et** → onay → `cancel({origin:'resumeCard'})` | `status='cancelled'`, `ended_reason='resumeCardCancel'`; `set_logs` 3 satır kalır, hepsi `discarded=1`; `v_set_effective_load` bu setleri döndürmez; `p1` silindi, `p0.superseded_by_id=NULL`; timer `skipped` + iptal; `S1.status='planned'`, `planned_date_key` aynı; index `4`. |
| TV-2.20 (E1) | İkinci başlatma | Aktif oturum varken `start(c8, S1)` | `ActiveSessionExistsError`; `workout_sessions` 1; `command_log`'da `c8` yok. |
| TV-2.21 (draft) | Taslak kaybolmaz | `draftInput(loadKg 82.5, reps 10)` → store at → cold start `hydrate()` → `completeSet(c9, 82.5×10)` | Hydrate: `prefill={raw:{loadKg:82.5}, reps:10, source:'draft'}`; completeSet sonrası `draft_*` NULL. |
| TV-2.22 (E11) | Açık ekranda gece yarısı | Aktif oturum, `clock.set('2026-09-07T21:00:00Z')` → `DayRolloverObserver` `DAY_CHANGED` | `calendar_date_key='2026-09-07'`; timer `remaining()` etkilenmez; yazma yok. |
| TV-2.23 (E14) | Ad-hoc oturum | `start({workoutTemplateId})` → tam bitir | `scheduled_workout_id=NULL`; `S1` dokunulmadı; index `4`; `sequence_events` yok; `decisionRequired=false`. |

### 2.6 İlgili gereksinimler

- **§90:** R90.1 (her komut anında DB), R90.2 (arka plan/crash kaybı yok), R90.3 (tek aktif oturum, DB'den geri yükleme), R90.4–R90.5 (resume kartı ve üç buton), R90.6 (set başına transaction), R90.7 (store = DB türevi, `hydrate()`).
- **§91:** R91.1 (setInterval yalnızca render), R91.2 (`rest_started_at_utc`, `rest_duration_seconds`), R91.3 (`remaining()` formülü), R91.4 (kilit/arka plan/restart bozmaz), R91.5 (bildirim planla), R91.6 (iptal), R91.7 (ön plan yeniden hesap), R91.8 (DB'de saklanır).
- **§113:** R113.1–R113.4 (`started_at_utc` / `completed_at_utc` / `calendar_date_key` ayrımı, başlangıç günü varsayılanı, override).
- **§88 / §103:** R88.3, R88.4, R88.6 (sıra yalnızca `completed` / `partialCountedDone`), R103.1–R103.3 (partial, "Bugün burada bitir"), R103.5 (yalnızca `set_logs` olan hareketler; `discarded=0`).
- **§99 / §101 / §102 / §107:** R99.7 (`original_exercise_id`), R101 (raw alan doğrulama), R102.1–R102.2 (`side`, `tracking_mode`), R107.2–R107.3 (PR yalnızca working ve `exclude_from_pr=0`, aynı tx).
- **§112 / §117 / §123:** R112.2–R112.3 (UTC + date key + tz), R117.1, R117.3, R117.5 (`commandId` retry, Türkçe mesaj), R123.1 (kart/özet yalnızca olgular).
- **Kabul testleri:** AT-01, AT-02, AT-03 (doğrudan); AT-06, AT-13 (kısmen: TV-2.13–TV-2.17).

### Tutarsızlık / açık nokta

1. **`set_logs` UNIQUE vs. `set_index` yorumu (ÇÖZÜLDÜ; 03 §1.6 kolon yorumu "tek artan sayaç" olarak düzeltildi):** `UNIQUE (session_exercise_id, set_index, side)` `set_type` içermezken kolon yorumu "warmup ve working ayrı sayılır" der. Ayrı indeks uzayları (warmup 1..w ve working 1..n) bu UNIQUE'i ihlal eder. Bu bölüm tek artan indeks (warmup 1..w, working w+1..) varsayar; 03'teki yorum netleştirilmeli ya da UNIQUE'e `set_type` eklenmeli.
2. **`set_logs.local_date_key` aidiyeti (ÇÖZÜLDÜ; 02 §5.1'e oturuma bağlı kayıtlar istisnası eklendi):** 02 §5.1 genel kuralı "yazıldığı andaki yerel tarih" der; bu bölüm R113.1 için `local_date_key := workout_sessions.calendar_date_key` (oturum günü) ve `time_zone := kayıt anındaki tz` kullanır, `overrideCalendarDate` bunları oturumla birlikte taşır. 02 §5.1/§5.3'e bu istisna eklenmeli (`personal_records.local_date_key` için de aynı).
3. **İptalde PR geri alma (ÇÖZÜLDÜ; 03'e `personal_records.voided` eklendi, satır silinmiyor):** 02 §7.1 iptalde setlerin `discarded=1` olduğunu söyler ama commit anında yazılmış `personal_records` için kural yok; 03'te void bayrağı yok. Bu bölüm zinciri onarıp satırı siler (`DELETE … WHERE session_id`). Tercihen `002` migration'ında `personal_records.voided` kolonu.
4. **`cancelSession` FSM'i (ÇÖZÜLDÜ):** yerinde `status='planned'`; `reschedule_reason` enum'undan `'cancelSession'` kaldırıldı (03 §1.5).
5. **Karar verilmemiş kısmi antrenman (ÇÖZÜLDÜ; 02 §6.3):** `partiallyCompleted ∧ partial_decision IS NULL` durumu (finish ile karar arasında kapanış) 02'de ele alınmamış; bu bölüm `AppBootstrap`'e `partialDecision` kartı ekler ve `decidePartial` komutunu türetir.
6. **Türetilmiş komut/tip/hata adları (02/03'te yok):** komut türleri `startSession`, `finishSession`, `cancelSession`, `decidePartial`, `overrideCalendarDate`; tipler `WorkoutSession` (tam alan listesi), `SessionExercise`, `ActiveWorkoutSnapshot`, `SessionExerciseView`, `CommandResult`; hata sınıfları `ActiveSessionExistsError`, `SessionNotActiveError`, `SetAlreadyLoggedError`, `InvalidStateError`, `ValidationError`; `RestTimerService.complete/ensureNotification/closeRunningInTx/startInTx/scheduleNotification`; `PrDetector.detectForSet/reevaluate/detectSessionVolumePr`; `Tx.get/all` ve `exec → {changes}`; `core/time.utcOffsetMinutes` (Clock offset vermez). `Scheduler.markInProgress/finish/decidePartial/reopenAfterCancel` ve `TrainingSequence.advanceSequence(tx, {programId, cause, scheduledWorkoutId})` imzaları bu belgenin §1 taslağıyla hizalıdır; 02 §6/§7'de yalnızca `advanceSequence()` ve `ensurePlanned(today)` adları geçer. 02 §3/§6/§15 ile senkronlanmalı.
7. **`command_log` sonuç kolonu (ÇÖZÜLDÜ; 03'e `result_json` ve 30 günlük temizleme kuralı eklendi):** duplicate replay orijinal sonucu döndüremez; `completeSet` için `set_logs.command_id` ile bulunur, diğerleri `hydrate()`'e dayanır. İsteğe bağlı `result_json` kolonu (gelecek migration). Ayrıca `command_log` temizleme kuralı (örn. 30 günden eski satırlar) hiçbir belgede yok.
8. **Kolon adı farkı (ÇÖZÜLDÜ):** 02 §7.1 `draft_load_json/draft_reps/draft_rir` olarak düzeltildi; 03 ile aynı.
9. **Prefill:** 02 §7.1 `start`'ın `session_exercises`'ı "prefill değerleriyle" yazdığını söyler; 03'te prefill kolonu yok. Bu bölüm prefill'i `hydrate()`'te hesaplar ve draft'ı 02 §7.3 sırasının önüne koyar.
10. **`remaining()` üst sınırı:** 02 §7.2 formülünde yalnızca `max(0, …)` var; cihaz saati geri alınınca süreden büyük değer çıkar. Bu bölüm `min(rest_duration_seconds, …)` ekler.
11. **Set kaydı olan harekette `substituteExercise`:** 02 §8.3/§7.1 durumu tanımlamaz. Bu bölüm reddeder (`setsAlreadyLogged`); "yeni hareket olarak ekle" (`addExercise`) komutu 02'nin komut listesinde yok. Aynı şekilde `tracking_mode` değiştirme komutu da listede yok.
12. **Kısmi devam planı granülerliği:** `remaining_exercise_ids_json` yalnızca hareket id'si tutar; yarım kalan hareket (2/3 set) devamda tam `planned_working_sets` ile yeniden planlanır. Set bazında devam isteniyorsa 03'e alan gerekir. Ayrıca devamda şablon (orijinal) hareket id'si saklanır; oturum içi substitution taşınmaz.
13. **`completed_at_utc` iptalde:** 03'te `ended_at_utc` yok; bu bölüm iptal anını `completed_at_utc`'ye yazar. Adlandırma yanıltıcı olabilir.
14. **Dondurulmuş programda aktif oturum (ÇÖZÜLDÜ; guard'lar 02 §6.5'te):** §1 taslağı `PauseService.pause`'un aktif oturum varken dondurmayı reddettiğini ve `advanceSequence`'in `paused` programda `ProgramNotActiveError` fırlattığını tanımlar (bu bölüm buna uyar, E18). 02 §6.5'te bu guard yazılı değil; eklenmeli.
15. **`bodyweight_kg_snapshot` kaynağı (ÇÖZÜLDÜ; 02 §7.1: son 14 gün içindeki son `weight_logs`, yoksa NULL):** 02 §8.4 alanı tanımlar ama `start`'ta hangi `weight_logs` kaydının (yaş sınırı?) kullanılacağını söylemez; bu bölüm son kaydı (yaş sınırsız) alır.
16. **Bildirim satırı tutarlılığı:** 02 §7.2 "oturum bitişi → `skipped`" der; süresi dolmuş timer için bu bölüm `completed` yazar (02'nin tembel kuralıyla uyumlu ama metin farklı).
17. **`remaining_exercise_ids_json` kaynağı (ÇÖZÜLDÜ; bitirme transaction'ında yazılır — 02 §6.3; tarih seçimi `moveToDate` ile):** §1 `Scheduler.finish('partiallyCompleted')` bu kolonu yazmaz ve `decidePartial` kalan hareketleri girdi olarak bekler. Bu bölüm kolonu `finish` içinde (aynı tx) yazar ve `decidePartial`'da oradan okur; böylece finish–karar arası kapanışta bilgi kaybolmaz. §1 ile bu kaynak netleştirilmeli. Ayrıca §1 `decidePartial(continueLater)` tarihi kendisi seçer (`firstPreferredDayOnOrAfter(today+1)`); kullanıcı seçimi ayrı `moveToDate` gerektirir — 02 §6.3'te tarih seçimi tanımsız.


---

## 3. IncrementResolver, roundToAvailable ve LoadBehavior.effectiveLoad (§100, §101)

> Modül: `src/domain/exercise/` — `IncrementResolver`, `LoadBehavior` (02 §3, §8.4, §8.5). Tablolar: `exercises`, `user_exercise_settings`, `set_logs`, görünüm `v_set_effective_load` (03 §1.3, §1.6, §1.10). Saf TypeScript; DB'ye yalnızca repository portlarından erişir.

### 3.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Girdi | Çıktı | Neden ayrı |
|---------|-------|-------|------------|
| `LoadBehavior.effectiveLoad(set, exercise)` | ham yük alanları (`RawLoad`) + `load_progression_type` | `number \| null` — **daha büyük = daha zor** normalize değer | Motorların (progression, plateau, PR) tek bir ölçekte çalışması için (R101.4) |
| `LoadBehavior.toRaw(effectiveLoad, exercise, ctx)` | normalize değer | `RawLoad` — kullanıcıya gösterilecek gerçek alan | "Artır" önerisi assisted harekette `assistance` **azaltmak** demektir (R101.3) |
| `IncrementResolver.forExercise(id)` | `user_exercise_settings` → `exercises` → ekipman varsayılanı | `{ incrementKg, availableLoads?, source }` | Kullanıcı düzenlemesi her zaman kazanır (R100.2) |
| `roundToAvailable(target, current, spec)` | hedef yük, mevcut yük, artış tanımı | `{ value, fallback? }` | Salonda olmayan değer önerilmez (R100.3, R100.4) |

Bu bölüm **karar üretmez**; yalnızca ölçek ve yuvarlama sağlar. Kararlar §4 (progression), §5 (plateau), §7 (PR) bölümlerindedir.

### 3.2 TypeScript arayüzleri ve sözde kod

```ts
// ---------- 3.2.1 Effective load ----------
const EQUIPMENT_DEFAULT_INCREMENT_KG: Record<EquipmentTag, number> = {
  dumbbells: 2, barbells: 2.5, cableStation: 2.5, latPulldown: 2.5, chestSupportedRow: 2.5,
  plateLoadedMachine: 2.5, selectorizedMachine: 5, smithMachine: 2.5, hackSquat: 5, legPress: 5,
  legExtension: 5, legCurl: 5, pecDeck: 5, preacherBench: 2.5, adjustableBench: 2.5,
  pullupBar: 2.5, dipStation: 2.5, assistedPullupMachine: 5, resistanceBands: 1, bodyweightOnly: 2.5,
};   // R100.1: Dumbbell +2, Machine +5, Cable +2.5, Barbell +2.5

interface LoadContext { bodyweightKg: number | null }   // workout_sessions.bodyweight_kg_snapshot

function effectiveLoad(raw: RawLoad, ex: Pick<Exercise,'loadProgressionType'>): number | null {
  switch (ex.loadProgressionType) {
    case 'externalLoadHigherIsHarder': return raw.loadKg ?? null;
    case 'assistanceLowerIsHarder':
      if (raw.assistanceKg == null) return null;
      return raw.bodyweightKgSnapshot != null
        ? raw.bodyweightKgSnapshot - raw.assistanceKg      // gerçek kaldırılan yük
        : -raw.assistanceKg;                               // bilinmiyorsa sıralama için negatif (monoton, mutlak anlamı yok)
    case 'bodyweight':                 return raw.bodyweightKgSnapshot ?? null;   // null → kıyas reps üzerinden
    case 'bodyweightPlusExternalLoad': return (raw.bodyweightKgSnapshot ?? 0) + (raw.loadKg ?? 0);
    case 'machineLevel':               return raw.machineLevel ?? null;           // ordinal
    case 'distanceOrBand':             return raw.bandRank ?? raw.distanceCm ?? null;
  }
}
```

**Karşılaştırılabilirlik kuralı (kritik):** `assistanceLowerIsHarder` ve `bodyweight` türlerinde `effectiveLoad` bodyweight anlık değerine bağlıdır. İki set yalnızca **aynı ölçekte** karşılaştırılır: `bodyweightKgSnapshot` her ikisinde de varsa mutlak değerler, yoksa yalnızca `assistance` (negatifi) kıyaslanır. Karışık durumda (`biri var, biri yok`) motorlar `comparable = false` alır ve o çiftten sonuç üretmez; kullanıcıya "kilo kaydı olmadığı için karşılaştırılamadı" bilgisi gösterilir (R123.1: uydurma kesinlik yok).

```ts
function comparable(a: SetRef, b: SetRef, ex: Exercise): boolean {
  if (!BODYWEIGHT_DEPENDENT.has(ex.loadProgressionType)) return true;
  return (a.raw.bodyweightKgSnapshot == null) === (b.raw.bodyweightKgSnapshot == null);
}
const BODYWEIGHT_DEPENDENT = new Set(['assistanceLowerIsHarder','bodyweight','bodyweightPlusExternalLoad']);

// ---------- 3.2.2 Increment çözümleme ----------
interface IncrementSpec { incrementKg: number; availableLoads?: number[]; source: 'user'|'exercise'|'equipment' }

async function forExercise(tx: Tx, exerciseId: string): Promise<IncrementSpec> {
  const u  = await userExerciseSettings.get(tx, exerciseId);
  const ex = await exercises.get(tx, exerciseId);
  const loads = u?.availableLoadsKg ?? ex.availableLoadsKg;                   // ayrık set (dumbbell rack, makine stack)
  if (u?.minIncrementKg != null) return { incrementKg: u.minIncrementKg, availableLoads: loads, source: 'user' };
  if (ex.defaultIncrementKg != null) return { incrementKg: ex.defaultIncrementKg, availableLoads: loads, source: 'exercise' };
  const inc = Math.min(...ex.equipment.map(t => EQUIPMENT_DEFAULT_INCREMENT_KG[t] ?? 2.5));   // en ince adım kazanır
  return { incrementKg: inc, availableLoads: loads, source: 'equipment' };
}

// ---------- 3.2.3 Yuvarlama ----------
type RoundResult = { value: number; fallback?: 'repProgression'; clamped?: 'min'|'max' };

function roundToAvailable(target: number, current: number, spec: IncrementSpec): RoundResult {
  if (spec.availableLoads?.length) {
    const sorted = [...spec.availableLoads].sort((a,b) => a-b);
    let best = sorted[0];
    for (const v of sorted) {                                   // en yakın; eşitlikte YUKARI (R100.4)
      const d = Math.abs(v - target), db = Math.abs(best - target);
      if (d < db || (d === db && v > best)) best = v;
    }
    if (best === current && target > current) {
      const next = sorted.find(v => v > current);
      if (next == null) return { value: current, fallback: 'repProgression', clamped: 'max' };
      return { value: next, fallback: undefined };              // rack'te bir sonraki gerçek kademe
    }
    return { value: best };
  }
  const inc = spec.incrementKg;
  const steps = Math.round((target - current) / inc + 1e-9);    // yönlü adım sayısı; .5 durumunda yukarı
  const value = round2(current + steps * inc);
  if (value === current && target > current) return { value: current, fallback: 'repProgression' };   // R100.5
  return { value };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------- 3.2.4 Yüzde hedefini increment'a çevirme ----------
function targetFromPercent(current: number, pct: number, spec: IncrementSpec, ex: Exercise): RoundResult {
  const raw = current * (1 + pct);                              // örn. %3 → 82.4
  return roundToAvailable(raw, current, spec);                  // asla 83.2 gibi değer önerilmez (R100.3)
}

// ---------- 3.2.5 Öneriyi ham alana geri çevirme ----------
function toRaw(nextEffective: number, ex: Exercise, ctx: LoadContext, cur: RawLoad): RawLoad {
  switch (ex.loadProgressionType) {
    case 'externalLoadHigherIsHarder':  return { ...cur, loadKg: nextEffective };
    case 'assistanceLowerIsHarder':
      return ctx.bodyweightKg != null
        ? { ...cur, assistanceKg: Math.max(0, round2(ctx.bodyweightKg - nextEffective)) }
        : { ...cur, assistanceKg: Math.max(0, round2(-nextEffective)) };          // 40 → 35 = ilerleme (R101.3)
    case 'bodyweight':                  return cur;                               // yük değişmez; §4 reps önerir
    case 'bodyweightPlusExternalLoad':  return { ...cur, loadKg: Math.max(0, round2(nextEffective - (ctx.bodyweightKg ?? 0))) };
    case 'machineLevel':                return { ...cur, machineLevel: Math.round(nextEffective) };
    case 'distanceOrBand':              return cur.bandRank != null ? { ...cur, bandRank: Math.round(nextEffective) }
                                                                   : { ...cur, distanceCm: nextEffective };
  }
}
```

### 3.3 Kural tablosu

| `loadProgressionType` | `effectiveLoad` | Artış = | Increment birimi | e1RM üretilir mi (§7) |
|------------------------|-----------------|---------|------------------|------------------------|
| `externalLoadHigherIsHarder` | `loadKg` | `loadKg + inc` | kg | evet |
| `assistanceLowerIsHarder` | `bw − assistance` (bw yoksa `−assistance`) | `assistanceKg − inc` (≥ 0) | kg | yalnızca `bw` biliniyorsa |
| `bodyweight` | `bw` (yoksa `null`) | yük değişmez → **rep hedefi** artar | — | hayır |
| `bodyweightPlusExternalLoad` | `bw + loadKg` | `loadKg + inc` | kg | yalnızca `bw` biliniyorsa |
| `machineLevel` | `level` | `level + 1` | kademe (tam sayı) | hayır (ordinal) |
| `distanceOrBand` | `bandRank` \| `distanceCm` | bir sonraki band / `+inc` cm | ordinal \| cm | hayır |

**Assistance 0'a ulaşınca:** `assistanceKg === 0` ise hareket fiilen `bodyweight`'e döner; motor "Artık yardımsız yapabiliyorsun — hareketi `pull-up` olarak değiştirmek ister misin?" önerisi (kind `substitution`) üretir, otomatik değiştirmez (R99.1, R121.1).

### 3.4 Sınır durumları ve hata durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | `availableLoadsKg` boş dizi | Yok sayılır, `incrementKg` kullanılır |
| E2 | Hedef mevcut yükün altında (deload) | Aynı yuvarlama, aşağı yön; `fallback` üretilmez |
| E3 | `incrementKg` kullanıcı tarafından çok büyük girilmiş (örn. 25 kg) | Kaydedilir (kullanıcı hakkı, R100.2) ama öneri kartında "Bu artış adımı büyük görünüyor" bilgi satırı |
| E4 | `machineLevel` için kesirli hedef | `Math.round`; `roundToAvailable` tam sayı kademede çalışır |
| E5 | `bodyweight` türünde `bw` null | `effectiveLoad = null`; progression/PR yalnızca reps kıyaslar, e1RM yok |
| E6 | `assistance > bodyweight` (veri hatası) | `effectiveLoad` negatif çıkar; kabul edilir (sıralama korunur), UI uyarır |
| E7 | Aynı hareket iki farklı ölçek (bw var/yok) | `comparable=false`; motor sonuç üretmez, "karşılaştırılamadı" gösterilir |
| E8 | `user_exercise_settings.min_increment_kg = 0` | DB `CHECK (> 0)` reddeder → `ValidationError`, Türkçe mesaj |

### 3.5 Test vektörleri

| # | Hareket / tür | Mevcut | Hedef | Spec | Beklenen |
|---|---------------|--------|-------|------|----------|
| TV-3.01 (AT-08) | Leg Press, `selectorizedMachine` | 80 | +%3 = 82.4 | inc 5 | `{ value: 80, fallback: 'repProgression' }` — imkânsız 82.4 önerilmez (R100.3, R100.5) |
| TV-3.02 (AT-08) | Cable Row, `cableStation` | 80 | +%3 = 82.4 | inc 2.5 | `{ value: 82.5 }` |
| TV-3.03 | Dumbbell Curl | 12 | +%5 = 12.6 | inc 2 | `{ value: 14 }` (eşitlik yok, en yakın adım) |
| TV-3.04 | Dumbbell Curl, ayrık rack | 12 | 13 | loads [10,12,14,16] | `{ value: 14 }` — eşit uzaklıkta yukarı (R100.4) |
| TV-3.05 | Barbell Row | 60 | +%4 = 62.4 | inc 2.5 | `{ value: 62.5 }` |
| TV-3.06 (AT-09) | Assisted Pull-up, bw 107 | assist 40 → eff 67 | eff 72 | inc 5 | `toRaw` → `assistanceKg 35` — **ilerleme** (R101.3) |
| TV-3.07 (AT-09) | Assisted Pull-up, bw yok | assist 40 → eff −40 | eff −35 | inc 5 | `assistanceKg 35`; sıralama −40 < −35 → ilerleme |
| TV-3.08 | Assisted Pull-up gerileme | assist 35 → eff −35 | eff −40 | inc 5 | `assistanceKg 40`; motor bunu **ilerleme saymaz** |
| TV-3.09 | Weighted Pull-up, bw 100 | +10 → eff 110 | eff 112.5 | inc 2.5 | `loadKg 12.5` |
| TV-3.10 | Push-up, `bodyweight`, bw 107 | eff 107 | — | — | Yük önerisi yok; §4 `repIncrease` üretir |
| TV-3.11 | Machine Lateral Raise, `machineLevel` | seviye 6 | 7 | — | `machineLevel 7`; e1RM yok |
| TV-3.12 | Band Pull-apart | band 2 | 3 | — | `bandRank 3`; PR yalnızca rep/ordinal |
| TV-3.13 | Kullanıcı override | 80, user inc 1.25 | +%3 | user | `{ value: 81.25 }`, `source: 'user'` |
| TV-3.14 | Rack tavanı | 32 (max) | 34 | loads […,30,32] | `{ value: 32, fallback: 'repProgression', clamped: 'max' }` |
| TV-3.15 | Deload | 100 | −%10 = 90 | inc 2.5 | `{ value: 90 }`, `fallback` yok |

### 3.6 İlgili gereksinimler

R100.1–R100.5, R101.1–R101.4, R107.4 (PR türe duyarlı), R121.2 (kullanıcı manuel değer girebilir), R123.4 (e1RM tahmindir).

### Tutarsızlık / açık nokta

- **`EQUIPMENT_DEFAULT_INCREMENT_KG` tam listesi 02/03'te yok.** R100.1 yalnızca dört örnek verir (dumbbell 2, machine 5, cable 2.5, barbell 2.5); tablodaki diğer etiketler bu belgede türetildi. `selectorizedMachine = 5`, `plateLoadedMachine = 2.5` ayrımı (plaka takılan makinede 1.25 kg plaka mümkün) bir tasarım kararıdır, onay bekler.
- **Çoklu ekipman etiketinde en ince adım kuralı** (`Math.min`) 02 §8.5'te yok; alternatif "ilk etiket" kuralıydı. En ince adım daha güvenli (asla imkânsız büyük artış önermez).
- **`comparable()` ve `bodyweightKgSnapshot` ölçek karışımı** 02'de ele alınmıyor; bu kural burada tanımlandı. Alternatif (bw yokken son bilinen kiloyu geriye doğru uydurmak) R123.1'e aykırı olduğu için reddedildi.
- **Assistance 0 → hareket dönüşümü önerisi** 02 §8.3'te yok; `recommendations.kind='substitution'` ile ifade edilebiliyor, ek şema gerekmiyor.
- **`v_set_effective_load` görünümü ile TS `effectiveLoad()` ikilemesi:** aynı mantık iki yerde (SQL + TS). Test zorunluluğu: `LoadBehavior.effectiveLoad` ile görünümün her tür için aynı sonucu verdiğini doğrulayan integration testi (`db/views/effectiveLoadParity.test.ts`).
- **Türetilen adlar (02/03'te yok):** `IncrementSpec`, `RoundResult`, `LoadContext`, `EQUIPMENT_DEFAULT_INCREMENT_KG`, `BODYWEIGHT_DEPENDENT`, `comparable`, `targetFromPercent`, `toRaw`, `round2`.


---

## 4. ProgressionEngine – double progression ve Recommendation üretimi (§9.1, §103.5, §102, §121, §122)

> Modül: `src/domain/progression/ProgressionEngine`, `RecommendationService` (02 §3, §9.1, §9.6). Tablolar: `set_logs`, `session_exercises`, `template_exercises`, `recommendations`, görünüm `v_set_effective_load`. Girdi tipi `Exposure` (03 §3). Motor **hiçbir şeyi otomatik uygulamaz**; çıktısı kullanıcı kararı bekleyen bir `Recommendation`'dır (R104.7, R121.1).

### 4.1 Sorumluluk ve girdiler/çıktılar

| Girdi | Kaynak | Not |
|-------|--------|-----|
| `exposures: Exposure[]` | son N (varsayılan 3) exposure, en yeni sonda | Yalnızca `set_type='working'`, `discarded=0` setler (R103.5, R107.2) |
| `target` | `template_exercises` (`rep_min`, `rep_max`, `target_rir`, `working_sets`) veya oturumdaki override | Şablon hedefi |
| `incrementSpec` | §3 `IncrementResolver` | Yuvarlama için |
| `decisionHistory` | `recommendations` (aynı hareket, son 5) | Kullanıcının önceki `accepted/modified/ignored` kararları (R121.3) |
| `exercise` | `exercises` | `loadProgressionType`, `isUnilateral` |

Çıktı: `Recommendation | null`. `null` yalnızca "yeterli veri yok" durumunda döner ve UI'da nötr bilgi satırı gösterilir ("İlk antrenmandan sonra öneri gelecek") — sessiz boşluk bırakılmaz.

### 4.2 TypeScript arayüzleri ve sözde kod

```ts
interface ProgressionInput {
  exercise: Exercise; exposures: Exposure[]; incrementSpec: IncrementSpec;
  decisionHistory: RecommendationDecision[]; ctx: LoadContext;
}
type ProgressionKind = 'loadIncrease' | 'repIncrease' | 'holdLoad' | 'loadDecrease';

const CONSERVATIVE_AFTER_IGNORED = 3;     // R121.3

function recommend(input: ProgressionInput): Recommendation | null {
  const last = input.exposures.at(-1);
  if (!last || last.workingSets.length === 0) return null;                 // R103.5: yapılmayan harekete öneri yok

  const sets = last.workingSets.filter(s => !s.excludeFromPr || true);     // hepsi değerlendirilir; excludeFromPr yalnız PR'ı etkiler
  const { repMin, repMax, targetRir, plannedWorkingSets } = last.target;

  // (0) Eksik/işaretli veri kapıları
  if (sets.some(s => s.painFlag))                 return hold(input, 'pain');            // ağrı → yük artırma önerilmez
  if (sets.filter(s => s.formBreakdownFlag).length >= Math.ceil(sets.length / 2))
                                                  return hold(input, 'formBreakdown');
  const partial = sets.length < plannedWorkingSets;                        // kısmi antrenman (§7.5, R103.5)

  // (1) RIR normalizasyonu: '4+' UI'da 4 olarak saklanır; null = bilinmiyor
  const rirs = sets.map(s => s.rir);
  const rirKnown = rirs.every(r => r != null);
  const minRir = rirKnown ? Math.min(...rirs as number[]) : null;

  // (2) Double progression kuralı — TÜM working set'ler üzerinden
  const allAtTop   = sets.every(s => s.reps >= repMax);
  const anyBelowMin= sets.some(s  => s.reps <  repMin);
  const rirOk      = minRir == null ? true : minRir >= targetRir;          // hedef RIR içinde kaldı
  const rirTooLow  = minRir != null && minRir <  targetRir - 1;            // hedefin belirgin altında (çok zorlandı)

  if (partial && !allAtTop) return hold(input, 'partialSession');          // kısmi veriden yük artırılmaz

  if (allAtTop && rirOk)    return loadIncrease(input);
  if (anyBelowMin || rirTooLow) {
    const twoBadInARow = isSecondConsecutiveMiss(input.exposures, repMin);
    return twoBadInARow ? loadDecrease(input) : hold(input, 'belowTarget'); // tek kötü antrenman yük düşürtmez (R104.1)
  }
  return repIncrease(input);
}
```

**`loadIncrease` gövdesi** (yüzde → increment → yuvarlama, §3):

```ts
function loadIncrease(i: ProgressionInput): Recommendation {
  const cur = bestEffectiveLoad(i.exposures.at(-1)!);                       // working set'lerin ortak/en yüksek yükü
  if (cur == null) return repIncreaseBodyweight(i);                         // bodyweight, bw bilinmiyor → reps
  const pct  = conservative(i) ? 0.025 : 0.05;                              // R100.3 aralığı: %2.5–5
  const r    = targetFromPercent(cur, pct, i.incrementSpec, i.exercise);
  if (r.fallback === 'repProgression')
    return build(i, 'repIncrease', { reps: nextRepTarget(i) },
      `Bu makinenin en küçük artışı ${i.incrementSpec.incrementKg} kg. Ağırlığı sabit tutup tekrar hedefini ${nextRepTarget(i)}'e çıkar.`);
  const raw = toRaw(r.value, i.exercise, i.ctx, currentRaw(i));
  return build(i, 'loadIncrease', { effectiveLoad: r.value, ...raw }, rationaleLoadIncrease(i, r.value));
}

function conservative(i: ProgressionInput): boolean {                       // R121.3
  const recent = i.decisionHistory.slice(-CONSERVATIVE_AFTER_IGNORED);
  const allIgnored  = recent.length === CONSERVATIVE_AFTER_IGNORED && recent.every(d => d.action === 'ignored');
  const modifiedDown= recent.some(d => d.action === 'modified' && d.userValue != null && d.userValue < d.proposedValue);
  return allIgnored || modifiedDown;
}
```

**Unilateral (R102.3):** `tracking_mode='separate'` ise motor her taraf için ayrı çalışır; öneri **en zayıf tarafın** değerine göre verilir, güçlü tarafın kendi değeri "sağ: 22 kg (senin normalin)" olarak ayrıca gösterilir. `bothSame` ise tek değerlendirme yapılır.

**Gerekçe şablonları (R122.2) — tümü Türkçe ve kanıta bağlı:**

| kind | `rationaleTr` şablonu |
|------|------------------------|
| `loadIncrease` | "Son antrenmanda {n}/{n} sette {reps} tekrar yaptın ve RIR hedefinin içinde kaldın." |
| `repIncrease` | "Setlerin {min}–{max} aralığının içinde. Aynı ağırlıkta {hedef} tekrara çıkmayı dene." |
| `holdLoad` (pain) | "Bu harekette ağrı işaretledin. Ağırlığı sabit tut, tekniğe odaklan." |
| `holdLoad` (partialSession) | "Bu antrenmanda planlanan {planned} setin {done} tanesini yaptın. Öneri için tam bir antrenman bekliyoruz." |
| `holdLoad` (belowTarget) | "Son sette hedef tekrarın altında kaldın. Aynı ağırlıkla bir kez daha dene." |
| `loadDecrease` | "İki antrenman üst üste hedef tekrarın altında kaldın. Ağırlığı {yeni} kg'a çekip tekrar kur." |

`evidence`: `{ setLogIds: son exposure'ın working set id'leri, metrics: { reps..., minRir, currentEffectiveLoad, proposedEffectiveLoad } }`.

**Yaşam döngüsü:** öneri hareketin **bir sonraki** planlanan antrenmanı için üretilir; `expires_at_utc = createdAt + 21 gün` veya hareket bir sonraki kez loglandığında (hangisi önce). Kullanıcı set'i öneriye bakmadan tamamlarsa öneri `ignored` + `decision_value_json = {loggedEffectiveLoad}` ile kapatılır ve `applied_session_id` yazılır (02 §7.3).

### 4.3 Kural tablosu

| Girdi (son exposure, hedef 3×10–12 @ RIR 2) | Sonuç | Neden |
|---|---|---|
| 12/12/12, minRir 2 | `loadIncrease` | Tüm setler tavanda, RIR hedefte (AT-07) |
| 12/12/12, minRir 0 | `repIncrease` | Tavanda ama RIR hedefin belirgin altında değil (2−1=1 > 0 → `rirTooLow`) → bkz. satır altı |
| 12/11/9, minRir 2 | `repIncrease` | Aralık içinde, tavan tamam değil |
| 8/7/6, minRir 0 | `holdLoad` (belowTarget) | Hedefin altı, ilk kez |
| 8/7/6 (art arda ikinci) | `loadDecrease` | İki ardışık ıskalama |
| 12/12/12, RIR null | `loadIncrease` | RIR bilinmiyorsa reps kuralı geçerli (`rirOk = true`) |
| 2 set loglandı (plan 3), 12/12 | `holdLoad` (partialSession) | Kısmi (R103.5) |
| 3 set, biri `painFlag` | `holdLoad` (pain) | Ağrı kapısı |
| bodyweight, bw null, 15/14/13 | `repIncrease` | Yük ölçeği yok |

> Not: `12/12/12 @ minRir 0` satırı `rirTooLow` (0 < 2−1) kapısına düşer ve `anyBelowMin=false` olduğu için `holdLoad(belowTarget)` üretir. Bu bilinçli: tavana ulaşmak ama RIR 0'a düşmek "yük zaten sınırda" demektir.

### 4.4 Sınır durumları ve hata durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | Hareket ilk kez yapıldı (1 exposure) | Kural yine çalışır; `loadDecrease` üretilemez (ardışık ıskalama yok) |
| E2 | Set sayısı plandan **fazla** | Fazla setler dahil edilir; `partial=false` |
| E3 | `excludeFromPr=1` set | Progression'a **dahildir** (yalnızca §7 PR'ı dışlar); ayrım belgede açık |
| E4 | Farklı setlerde farklı yük (piramit) | `bestEffectiveLoad` = en çok tekrarlanan yük; eşitlikte en yüksek; kural o yük üzerinden |
| E5 | Hareket oturumda değiştirilmiş (`original_exercise_id`) | Geçmiş `exercise_id` üzerinden okunur; aile birleştirme yalnızca kullanıcı isterse (§8) |
| E6 | Ölçek karışımı (`comparable=false`, §3) | `null` + "karşılaştırılamadı" bilgisi |
| E7 | Aynı hareket için açık (karar verilmemiş) öneri var | Yenisi üretilmez; mevcut öneri güncellenir (`UPDATE`, aynı `id`) |
| E8 | DB okuma hatası | `RecommendationUnavailable` → kart yerine "Öneri hesaplanamadı, tekrar dene" (R117) |

### 4.5 Test vektörleri

| # | Senaryo | Girdi | Beklenen |
|---|---------|-------|----------|
| TV-4.01 (AT-07) | 12/12/12 @ RIR 2, hedef 10–12 @ 2, cable 80 kg, inc 2.5 | — | `loadIncrease`, `proposed.effectiveLoad = 82.5`, `rationaleTr` "Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın." |
| TV-4.02 (AT-08) | Aynı ama makine inc 5, 80 kg | — | `repIncrease`, `proposed.reps = 13`, gerekçe artış adımını açıklar |
| TV-4.03 | 12/11/9 @ RIR 2 | — | `repIncrease` |
| TV-4.04 | 8/7/6 @ RIR 0, ilk kez | — | `holdLoad`, reason `belowTarget` |
| TV-4.05 | 8/7/6 @ RIR 0, ikinci kez | — | `loadDecrease`, `proposed.effectiveLoad = 72.5` (80 − %10 → yuvarlama) |
| TV-4.06 (AT-09) | Assisted pull-up, assist 40, 12/12/12 @ RIR 2, bw 107 | inc 5 | `loadIncrease`, `proposed.assistanceKg = 35` (yük artmadı, **yardım azaldı**) |
| TV-4.07 (R121.3) | TV-4.01 koşulu ama son 3 öneri `ignored` | — | `loadIncrease` ama `pct = 0.025` → 82.5 yerine 82.5 (aynı, inc tavanı); metrics `conservative: 1` |
| TV-4.08 (R121.3) | Kullanıcı önceki öneriyi 82.5 → 80 olarak `modified` | — | Sonraki öneri muhafazakâr moddan üretilir |
| TV-4.09 (R103.5) | Plan 3 set, 2 set loglandı | — | `holdLoad(partialSession)`; yük önerisi yok |
| TV-4.10 (R102.3) | `separate`: sol 12/12/12, sağ 10/10/9 | — | Tek öneri, sol taraf değerine göre değil **sağ (zayıf)** taraf değerine göre; kartta iki taraf ayrı gösterilir |
| TV-4.11 | RIR tümü null, 12/12/12 | — | `loadIncrease` (RIR bilinmiyorsa engel değil) |
| TV-4.12 | `painFlag` var | — | `holdLoad(pain)`; asla `loadIncrease` |
| TV-4.13 | Açık öneri varken yeni exposure | — | Mevcut satır güncellenir, ikinci satır oluşmaz |

### 4.6 İlgili gereksinimler

R100.3–R100.5, R101.3, R102.3, R103.5, R104.1, R104.7, R107.3 (excludeFromPr ayrımı), R108.1 (prefill), R121.1–R121.3, R122.1–R122.3, R123.4.

### Tutarsızlık / açık nokta

- **`%2.5–5` seçimi** 02 §9.1'de "double progression" olarak anlatılıp yüzde verilmiyor; R100.3 "+2.5–5%" ifadesini kullanıyor. Buradaki "muhafazakâr → %2.5, normal → %5" eşlemesi tasarım kararıdır.
- **`12/12/12 @ RIR 0 → holdLoad`** kuralı R104/R121 ile uyumlu ama 01'de açıkça yazmıyor; ürün sahibinin onayı gerekir (alternatif: `loadIncrease` ama küçük adım).
- **`loadDecrease` yüzdesi (%10)** hiçbir belgede yok; burada tanımlandı.
- **`excludeFromPr` setlerinin progression'a dahil olması** 01'de belirtilmemiş. Gerekçe: kullanıcı "PR sayma" derken "bu set olmamış sayılsın" demiyor. Alternatif istenirse tek satırlık değişiklik.
- **`bestEffectiveLoad` (piramit setler)** kuralı 02'de yok; "en çok tekrarlanan yük, eşitlikte en yüksek" burada tanımlandı.
- **Öneri ömrü (21 gün)** ve "açık öneri varsa güncelle" kuralı 02 §9.6'da yok.
- **`recommendations` tablosunda `reason` alanı yok:** `holdLoad` için `pain | formBreakdown | partialSession | belowTarget` ayrımı yalnızca `rationale_tr` içinde kalıyor. Test edilebilirlik için `proposed_json.reason` alanı kullanılır (şema değişikliği gerektirmez).
- **Türetilen adlar:** `ProgressionInput`, `ProgressionKind`, `RecommendationDecision`, `recommend`, `loadIncrease/repIncrease/holdLoad/loadDecrease`, `bestEffectiveLoad`, `nextRepTarget`, `isSecondConsecutiveMiss`, `conservative`, `CONSERVATIVE_AFTER_IGNORED`, `RecommendationUnavailable`.


---

## 5. PlateauEngine (§104)

> Modül: `src/domain/progression/PlateauEngine` (02 §3, §9.2). Tablolar: `set_logs` (+ `v_set_effective_load`), `plateau_insights`, `check_ins`, `sleep_logs`, `meal_entries`/`nutrition_targets`, `rest_timers`, `exercise_relations`. Motor **insight üretir, program değiştirmez** (R104.3, R104.7).

### 5.1 Sorumluluk ve girdiler/çıktılar

`PlateauEngine.evaluate(exerciseId, side)` bir hareketin son exposure'larına bakar ve plateau koşulu sağlanıyorsa `plateau_insights` satırı üretir. Çalışma anı: antrenman bitirme transaction'ından **sonra** (commit sonrası, arka planda), böylece bitirme akışı gecikmez.

**Exposure** = bir oturumda o hareketin en az bir `working` set'i (03 §4). Sayım `workout_sessions.calendar_date_key` sırasına göre yapılır; `discarded=1` oturumlar hiç sayılmaz.

### 5.2 TypeScript arayüzleri ve sözde kod

```ts
const PLATEAU_WINDOW = 3;              // R104.2: 3 ardışık exposure
const COOLDOWN_EXPOSURES = 3;          // aynı hareket için yeniden tespit engeli

interface PlateauChecklistItem {
  key: 'recovery'|'sleep'|'adherence'|'rirAccuracy'|'technique'|'rest'|'suitability';   // R104.4 sırası
  status: 'ok' | 'attention' | 'unknown';
  valueTr: string;                      // "Son 7 gün ortalama uyku 6.1 sa (hedef 7.5)"
  evidence: { sleepLogIds?: string[]; checkInIds?: string[]; setLogIds?: string[]; metrics: Record<string, number> };
}
type PlateauSuggestionKind = 'sameLoad' | 'repTargetAdjust' | 'substitution' | 'deload';

function evaluate(input: PlateauInput): PlateauInsight | null {
  const ex = input.exposures.slice(-PLATEAU_WINDOW);
  if (ex.length < PLATEAU_WINDOW) return null;                                  // R104.1: tek/iki antrenman yetmez
  if (input.exposuresSinceLastInsight < COOLDOWN_EXPOSURES) return null;        // spam engeli
  if (!ex.every((e, i) => i === 0 || comparable(e, ex[i-1], input.exercise))) return null;  // §3 ölçek kuralı

  // (1) Yük artmadı
  const loads = ex.map(bestEffectiveLoad);
  const loadStalled = loads.every(l => l != null) && max(loads) <= loads[0]!;

  // (2) Aynı yükte tekrar artmadı
  const repsAtTopLoad = ex.map(e => maxRepsAtLoad(e, loads[0]));
  const repsStalled = max(repsAtTopLoad) <= repsAtTopLoad[0];

  // (3) RIR hedef bandında (çok zorlanma yok → "kötü gün" değil, gerçek durağanlık)
  const rirInBand = ex.every(e => {
    const r = minRir(e); return r == null || (r >= e.target.targetRir - 1 && r <= e.target.targetRir + 1);
  });

  // (4) Teknik/ağrı bayrağı yok — varsa bu bir plateau değil, bir teknik/ağrı sorunudur
  const clean = ex.every(e => e.workingSets.every(s => !s.painFlag && !s.formBreakdownFlag));

  if (!(loadStalled && repsStalled && rirInBand && clean)) return null;         // R104.2

  const checklist = buildChecklist(input);                                      // R104.4 sırasıyla
  const suggestions = buildSuggestions(input, checklist);                       // hiçbiri otomatik uygulanmaz
  return persistOpenInsight(input, ex, checklist, suggestions);
}
```

**Checklist doldurma (R104.4 sırası korunur):**

| # | `key` | Veri kaynağı | `attention` eşiği | `unknown` |
|---|-------|--------------|-------------------|-----------|
| 1 | `recovery` | `check_ins` son 7 gün (`soreness`, `energy`) | ortalama `soreness ≥ 4` **veya** `energy ≤ 2` | < 3 check-in |
| 2 | `sleep` | `sleep_logs` son 7 gün vs `training_profiles.sleep_target_hours` | ortalama < hedef − 1 sa | < 4 kayıt veya hedef `null` |
| 3 | `adherence` | `meal_entries` günlük toplam vs `nutrition_targets` | protein < %90 veya kcal bandı dışı gün ≥ 3 | < 4 loglanmış gün |
| 4 | `rirAccuracy` | son 3 exposure `rir` dağılımı | RIR raporlanan ≥ 2 ama tekrar artmıyor (tutarsız raporlama sinyali) | RIR hep `null` |
| 5 | `technique` | `form_breakdown_flag`, `set_log_revisions` | son 3 exposure'da ≥ 1 bayrak | veri yok (bu dalda zaten `clean` şartı var) |
| 6 | `rest` | `rest_timers` ortalama gerçek dinlenme vs `session_exercises.rest_seconds` | ortalama < hedefin %70'i | timer kaydı yok |
| 7 | `suitability` | `exercise_relations`, `equipment_profiles`, `training_profiles.pain_areas` | hareket için uygun alternatif var ve hareket ileri seviye | — |

**Öneri üretimi:** checklist'te `attention` olan ilk madde önerileri sıralar.

| Koşul | Öneri | Metin (özet) |
|-------|-------|--------------|
| `recovery`/`sleep`/`adherence` attention | `sameLoad` | "Önce toparlanmayı düzelt; 2 hafta aynı ağırlıkta kal." |
| `rirAccuracy` attention | `repTargetAdjust` | "RIR hedefini 1 azaltarak (daha yakın başarısızlığa) dene." |
| `rest` attention | `sameLoad` | "Dinlenmeyi {hedef} sn'ye çıkar; aynı ağırlıkta tekrar dene." |
| `suitability` attention | `substitution` | "Aynı kası çalıştıran {alternatif} hareketi 4 hafta dene." (§8 ile üretilir) |
| Hepsi `ok` ve 3 exposure aynı yük | `deload` | "Bir hafta %10 daha hafif çalışıp sonra aynı ağırlığa dön." |

Her öneri kartında **"Neden önerildi?"** açılır (R105.5 metni) ve `Accept / Modify / Ignore` bulunur (R121.1). Kabul edilen `substitution` bile hareketi otomatik değiştirmez: kullanıcı bir sonraki antrenmanda "Hareketi Değiştir" akışına yönlendirilir.

**Yaşam döngüsü:** `open` → kullanıcı gördü (`acknowledged`) → önerilerden biri uygulandı ve sonraki exposure'da ilerleme oldu (`resolved`, otomatik) → kullanıcı kapattı (`dismissed`). `resolved`/`dismissed` sonrası aynı hareket için yeni insight en erken `COOLDOWN_EXPOSURES` exposure sonra üretilir.

### 5.3 Sınır durumları ve hata durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | Hareket 3 exposure'dan az | `null`; hiçbir kayıt yazılmaz |
| E2 | Arada program dondurulmuş | Exposure sayımı etkilenmez (takvim değil, exposure sayılır) |
| E3 | Ölçek karışımı (bw var/yok) | `null`; "karşılaştırılamadı" |
| E4 | Kullanıcı arada hareketi değiştirdi | Yeni hareketin kendi exposure sayacı başlar; eski insight `dismissed` |
| E5 | Açık insight varken yeni tespit | Yeni satır yazılmaz; mevcut satırın `checklist_json` güncellenir |
| E6 | `separate` unilateral | Taraf başına ayrı değerlendirme; iki taraf da plateau ise tek insight, `side='both'` etiketiyle |
| E7 | Checklist verisi tamamen yok | Insight yine üretilir; tüm maddeler `unknown`, öneri yalnızca `sameLoad` (R123.1: uydurma teşhis yok) |
| E8 | Yazma hatası | Sessiz yeniden deneme (sonraki oturum sonunda); kullanıcı akışı bloklanmaz |

### 5.4 Test vektörleri

Hedef: 3×10–12 @ RIR 2, hareket `cable-row` (`externalLoadHigherIsHarder`).

| # | Exposure dizisi | Beklenen |
|---|-----------------|----------|
| TV-5.01 | 60×10/10/9 → 60×10/10/9 → 60×10/10/9, RIR 2 | **Plateau** (`open` insight, 7 maddelik checklist) |
| TV-5.02 | 60×10 → 60×11 → 60×11 | Plateau **yok** (tekrar arttı) |
| TV-5.03 | 60 → 62.5 → 62.5 | Plateau **yok** (yük arttı) |
| TV-5.04 | 2 exposure durağan | `null` (R104.1) |
| TV-5.05 | 3 durağan ama son sette `pain_flag` | `null`; bunun yerine §4 `holdLoad(pain)` |
| TV-5.06 | 3 durağan, RIR 0/0/0 | `null` (RIR hedef bandı dışı → "çok zorlanma", plateau değil) |
| TV-5.07 | TV-5.01 + uyku ort. 5.9 sa (hedef 7.5) | `sleep: attention`, öneri `sameLoad` |
| TV-5.08 | TV-5.01 + tüm veri eksik | 7 madde `unknown`, tek öneri `sameLoad` |
| TV-5.09 | TV-5.01 sonrası 1 exposure daha durağan | Yeni satır **yok**; mevcut insight güncellendi |
| TV-5.10 | Insight `resolved`, 3 exposure sonra yine durağan | Yeni insight üretilir |
| TV-5.11 | Assisted pull-up, assist 40/40/40, bw kayıtlı | Plateau (effectiveLoad sabit) |
| TV-5.12 | Assisted pull-up, bw ilk exposure'da yok | `null` (`comparable=false`) |

### 5.5 İlgili gereksinimler

R104.1–R104.7, R105.5 ("Neden önerildi?"), R121.1, R122.1–R122.3, R123.1, R123.4.

### Tutarsızlık / açık nokta

- **`plateau_insights.side` CHECK'i (ÇÖZÜLDÜ):** `CHECK (side IN ('both','left','right'))` 03 §1.7'ye eklendi.
- **`exposuresSinceLastInsight` alanı yok:** cooldown, `plateau_insights.detected_at_utc` sonrası exposure sayımıyla hesaplanır; kolon gerekmiyor ama sorgu tanımlanmalı.
- **`rirAccuracy` maddesi öznel:** "RIR 2 raporlanıyor ama ilerleme yok" bir sinyal, kanıt değil. Metin bunu "olabilir" diliyle kurar (R123.1).
- **`resolved` otomatik geçişi** 02 §9.2'de yok; burada "sonraki exposure'da yük veya tekrar arttı" olarak tanımlandı.
- **`plateau_insights.suggestions_json` ile `recommendations.kind` örtüşmüyor:** `repTargetAdjust` karşılığı `recommendations` enum'unda yok. Karar: plateau önerileri `plateau_insights` içinde kalır; kullanıcı kabul ederse `recommendations` satırı **yalnızca** karşılığı olan türler için (`substitution`, `deload`, `holdLoad`) yazılır. `plateauReview` kind'ı insight'ı ana ekranda göstermek için kullanılır.
- **Checklist eşikleri** (soreness ≥ 4, uyku hedef − 1 sa, protein %90, dinlenme %70) hiçbir belgede yok; burada tanımlandı, ürün onayı bekler.
- **Türetilen adlar:** `PlateauEngine.evaluate`, `PlateauInput`, `PlateauChecklistItem`, `PlateauSuggestionKind`, `PLATEAU_WINDOW`, `COOLDOWN_EXPOSURES`, `buildChecklist`, `buildSuggestions`, `persistOpenInsight`, `maxRepsAtLoad`, `minRir`.


---

## 6. VolumeGuardrails, VolumeAnalytics ve recovery değerlendirmesi (§105, §106)

Bu bölüm `domain/progression/VolumeGuardrails`, `domain/analytics/VolumeAnalytics` (02 §3, §9.3, §9.4) ve ikisinin ortak kullandığı recovery / performans-trendi değerlendirmesini tanımlar. Motorlar saf TypeScript'tir; yalnızca repository portlarından okur, `template_exercises` başta olmak üzere hiçbir şablonu kendiliğinden değiştirmez ve her artış önerisi bir `Recommendation` (03 §3) olarak kullanıcı kararına sunulur (R104.7, R121.1). "Öneri yok" sonucu da nedenlidir: 02 §1'deki "sessiz ilerleme yok" ilkesi burada "sessiz öneri-yokluğu yok" olarak uygulanır; kullanıcı Progress ekranında neden öneri üretilmediğini görür.

Alt yapı eşlemesi: (a) 6.1 · (b) 6.2–6.8 · (c) 6.9 · (d) 6.10 · (e) 6.11 · (f) 6.12 · (g) bölüm sonu.

### 6.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Modül (02 §3) | Sorumluluk | Girdi | Çıktı |
|---------|---------------|------------|-------|-------|
| `VolumeAnalytics.weekly(weekStartKey)` | `domain/analytics` | Haftalık **Weekly Sets by Muscle** (R106.1): direkt set sayısı (kesin) ve secondary katkı (tahmin, ayrı) | `v_weekly_direct_sets`, working `set_logs` + `exercises.secondary_muscles_json`, `muscle_volume_targets` | `WeeklyMuscleVolume[]` |
| `assessRecovery(input)` | `domain/progression` (VolumeGuardrails modülü; `PlateauEngine` §104.4 checklist'inin recovery/sleep maddeleri de bunu kullanır) | `last7d` recovery durumu: `ok` / `poor` / `unknown` | `check_ins.soreness`, `check_ins.energy`, `sleep_logs.duration_minutes`, `training_profiles.sleep_target_hours`, `clock.todayKey()` | `RecoveryAssessment` |
| `performanceTrend(muscle, exposuresPrev, exposuresRef)` | `domain/progression` | Son 2 haftanın exposure'larından kas bazlı trend: `up` / `stable` / `down` / `unknown` | `Exposure[]` (03 §3) — W ve W−1 | `PerformanceTrendResult` |
| `VolumeGuardrails.evaluate(input)` | `domain/progression` | §105 korkulukları: koşul zinciri, `delta ∈ {1,2}`, haftada tek öneri, gerekçe | `muscle_volume_targets` satırı, `currentWeeklySets`, recovery, trend, önceki `recommendations` (kind `volumeIncrease`) | `VolumeGuardrailResult` (`recommend` veya nedenli `none`) |
| `RecommendationService.runWeeklyVolumeReview(clock)` | `domain/progression` | Tetikleme, girdi toplama, tek transaction'da kalıcılık | `Clock`, repository portları | `recommendations` INSERT (kind `volumeIncrease`) |

**Yapmadıkları (bilinçli):** şablon set sayısını değiştirmek (yalnızca kullanıcı kabulüyle, 6.7); `volumeHold` kaydı üretmek (v1'de üretilmez, bkz. açık noktalar); veri yokken varsayılan değerle ilerlemek (R119.3, R123.1); secondary katkıyı direkt setlere eklemek (R106.3).

**Zaman çerçevesi** (tüm anahtarlar `YYYY-MM-DD` yerel gün anahtarıdır, 02 §5.1):

| Kavram | Tanım |
|--------|-------|
| `referenceWeek` (W) | Değerlendirilen **tamamlanmış** hafta: bugünün haftasından bir önceki Pazartesi–Pazar. `currentWeeklySets` bu haftadan hesaplanır. Devam eden haftanın yarım verisi kullanılmaz; aksi halde her Salı "baseline'ın altında" görünürdü. |
| `previousWeek` (W−1) | Trend karşılaştırmasının diğer ucu. |
| `targetWeek` | Bugünün haftası (`weekStartKey(todayKey)` = W + 7 gün). Öneri bu hafta için geçerlidir; `expires_at_utc` = targetWeek Pazar 23:59:59 (yerel, `clock.timeZone()`) → UTC. |
| `last7d` | Recovery penceresi `[todayKey − 6, todayKey]` (bugün dahil 7 yerel gün). Antrenman haftasından bağımsızdır; "şu anki" toparlanmayı ölçer. |

**Tetikleme:** `runWeeklyVolumeReview` uygulama açılışında (`AppBootstrap`, migration sonrası) ve `DayRolloverObserver` `DAY_CHANGED` olayında çalışır. Gün içinde birden çok çalışması zararsızdır: 6.6'daki `alreadyRecommendedThisWeek` kapısı ikinci öneriyi engeller. Hafta içinde recovery verisi tamamlanırsa (`unknown` → `ok`) öneri o gün üretilebilir; yine haftada en fazla bir tanedir. `none` sonuçları kalıcı değildir; Progress ekranı aynı saf fonksiyonu çağırıp nedeni gösterir.

### 6.2 Hafta sınırı ve `currentWeeklySets`

Hafta **Pazartesi** başlar. Hafta anahtarı, haftanın Pazartesi gününün yerel gün anahtarıdır (`WeekStartKey`). Gün aidiyeti için **`workout_sessions.calendar_date_key`** kullanılır (R113.2, R113.3); `set_logs.local_date_key` kullanılmaz — 23:50'de başlayıp 00:10'da biten oturumun setleri başlangıç gününe, dolayısıyla başlangıç haftasına aittir. Kullanıcı `calendar_date_key`'i düzenlediyse (`calendar_date_overridden = 1`, R113.4) düzenlenmiş değer geçerlidir.

```ts
// domain/time/week.ts — saf takvim aritmetiği; cihaz timezone'una dokunmaz (R112.1)
export type DateKey = string;        // 'YYYY-MM-DD'
export type WeekStartKey = DateKey;  // her zaman bir Pazartesi

function keyToUtcDate(key: DateKey): Date {          // UTC yalnızca aritmetik taşıyıcı; tz kayması yok
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function utcDateToKey(dt: Date): DateKey { return dt.toISOString().slice(0, 10); }

export function addDaysToKey(key: DateKey, days: number): DateKey {
  const dt = keyToUtcDate(key); dt.setUTCDate(dt.getUTCDate() + days); return utcDateToKey(dt);
}
/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar */
export function isoWeekday(key: DateKey): number { return ((keyToUtcDate(key).getUTCDay() + 6) % 7) + 1; }
export function weekStartKey(key: DateKey): WeekStartKey { return addDaysToKey(key, -(isoWeekday(key) - 1)); }
export function weekEndKey(weekStart: WeekStartKey): DateKey { return addDaysToKey(weekStart, 6); }
```

`currentWeeklySets(muscle, W)` = `v_weekly_direct_sets` (03 §1.10) satırlarının W haftasındaki toplamı:

```sql
-- VolumeRepository.sumDirectSets(muscle, weekStart, weekEnd)
SELECT COALESCE(SUM(direct_sets), 0) AS current_weekly_sets
FROM v_weekly_direct_sets
WHERE muscle = :muscle
  AND calendar_date_key BETWEEN :weekStart AND :weekEnd;   -- 'YYYY-MM-DD' sözlük sırası = tarih sırası
```

```ts
export interface VolumeRepository {
  sumDirectSets(muscle: MuscleGroup, fromKey: DateKey, toKey: DateKey): Promise<number>;      // v_weekly_direct_sets
  countClosedSessions(fromKey: DateKey, toKey: DateKey): Promise<number>;                     // status IN ('completed','partial')
  secondaryWorkingSets(fromKey: DateKey, toKey: DateKey): Promise<Array<{ muscle: MuscleGroup; distinctSets: number }>>; // 6.8
}

export async function currentWeeklySets(repo: VolumeRepository, muscle: MuscleGroup, week: WeekStartKey): Promise<number> {
  return repo.sumDirectSets(muscle, week, weekEndKey(week));
}
```

Görünümün getirdiği kurallar (03 §1.10, değiştirilmez): yalnızca `set_type = 'working'` (warmup/dropset/backoff sayılmaz — R106.2 "direct/primary working sets"), `discarded = 0`, oturum `status IN ('completed','partial')` (aktif ve iptal edilmiş oturumlar sayılmaz), kas = `exercises.primary_muscle` (değiştirilen harekette **gerçek yapılan** `exercise_id`, `original_exercise_id` değil). Günlük satırlar toplandığında çift sayım olmaz: `session_exercise_id` tek bir oturuma, oturum tek bir `calendar_date_key`'e aittir.

### 6.3 Unilateral çift sayım koruması (R102.4)

`v_weekly_direct_sets` set sayısını `COUNT(DISTINCT session_exercise_id || ':' || set_index)` ile alır. `tracking_mode = 'separate'` olan harekette aynı `set_index` için `side = 'left'` ve `side = 'right'` iki `set_logs` satırı vardır; DISTINCT anahtar `side` içermediği için **sol + sağ = 1 set** sayılır. `bothSame` modunda zaten tek satır (`side = 'both'`) vardır. Secondary sayımı (6.8) aynı anahtarı kullanır. `exercises.volume_multiplier` set sayımıyla ilgili değildir; yalnızca kg·rep hacminde kullanılır (02 §7.4).

Kural: set sayımında hiçbir yerde `COUNT(*)` kullanılmaz; her sayım `DISTINCT (session_exercise_id, set_index)` üzerindendir. Trend hesabında (6.5) ise taraflar **ayrı birim** olarak karşılaştırılır (R102.3: en zayıf taraf belirler).

### 6.4 Recovery değerlendirmesi — `assessRecovery`

02 §9.3'teki `recoveryOk(last7d)` boolean gibi okunur; eksik veriyi "iyi" ya da "kötü" saymamak için (R119.3, R123.1) sonuç üç durumludur. `recoveryOk === (status === 'ok')` eşdeğerliği korunur.

Sinyaller ve eşikler (başlangıç sabitleri; klinik kesinlik iddiası yoktur, `RECOVERY_RULES` tek yerden ayarlanır):

| Sinyal | Kaynak | Ölçek varsayımı | `ok` koşulu | Yetersiz veri |
|--------|--------|-----------------|-------------|---------------|
| soreness | `check_ins.soreness` | 1 = hiç yok … 5 = çok yüksek (bkz. açık nokta) | pencere ortalaması ≤ 3.0 | < 3 gün → `unknown` |
| energy | `check_ins.energy` | 1 = çok düşük … 5 = çok yüksek | pencere ortalaması ≥ 3.0 | < 3 gün → `unknown` |
| sleep | `sleep_logs.duration_minutes` (NULL ise `bedtime_utc`/`wake_utc` farkından türetilir) vs `training_profiles.sleep_target_hours × 60` | dakika | ortalama ≥ 0.9 × hedef | < 3 gün **veya** hedef NULL → `unknown` |

Birleştirme: herhangi bir sinyal `poor` → `poor`; değilse herhangi biri `unknown` → `unknown`; hepsi `ok` → `ok`. `poor`, `unknown`'a baskındır: elimizdeki veri "hayır" demeye yetiyorsa eksik veri bunu yumuşatmaz. `unknown` durumunda **öneri üretilmez** ve gerekçe "veri yok" der; asla varsayılan değer uydurulmaz.

```ts
export type RecoveryStatus = 'ok' | 'poor' | 'unknown';

export const RECOVERY_RULES = {
  windowDays: 7, minDaysPerSignal: 3,
  sorenessOkMaxMean: 3.0, energyOkMinMean: 3.0, sleepOkRatio: 0.9,
} as const;

export interface RecoverySignal { status: RecoveryStatus; days: number; mean: number | null; }
export interface RecoveryAssessment {
  status: RecoveryStatus;
  windowStartKey: DateKey; windowEndKey: DateKey;
  soreness: RecoverySignal;
  energy: RecoverySignal;
  sleep: RecoverySignal & { targetMinutes: number | null };
  checkInIds: string[]; sleepLogIds: string[];        // gerekçe kanıtı (R122.3)
  summaryTr: string;                                  // "ağrı ort. 2.1/5, enerji ort. 3.9/5, uyku ort. 7.4 sa (hedef 8.0 sa)"
}

export interface RecoveryInput {
  todayKey: DateKey;
  checkIns: Array<{ id: string; localDateKey: DateKey; soreness: number | null; energy: number | null }>;
  sleepLogs: Array<{ id: string; localDateKey: DateKey; durationMinutes: number | null }>;
  sleepTargetHours: number | null;                    // training_profiles.sleep_target_hours (NULL olabilir)
}

function signal(values: number[], isOk: (mean: number) => boolean): RecoverySignal {
  if (values.length < RECOVERY_RULES.minDaysPerSignal) return { status: 'unknown', days: values.length, mean: null };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { status: isOk(mean) ? 'ok' : 'poor', days: values.length, mean };
}

export function assessRecovery(i: RecoveryInput): RecoveryAssessment {
  const windowEndKey = i.todayKey;
  const windowStartKey = addDaysToKey(windowEndKey, -(RECOVERY_RULES.windowDays - 1));
  const inWindow = (k: DateKey) => k >= windowStartKey && k <= windowEndKey;
  const ci = i.checkIns.filter(c => inWindow(c.localDateKey));                         // UNIQUE(local_date_key) → gün başına 1
  const sl = i.sleepLogs.filter(s => inWindow(s.localDateKey) && s.durationMinutes != null);

  const soreness = signal(ci.flatMap(c => (c.soreness == null ? [] : [c.soreness])), m => m <= RECOVERY_RULES.sorenessOkMaxMean);
  const energy   = signal(ci.flatMap(c => (c.energy == null ? [] : [c.energy])),     m => m >= RECOVERY_RULES.energyOkMinMean);
  const targetMinutes = i.sleepTargetHours == null ? null : i.sleepTargetHours * 60;
  const sleep = targetMinutes == null
    ? { status: 'unknown' as const, days: sl.length, mean: null, targetMinutes }
    : { ...signal(sl.map(s => s.durationMinutes as number), m => m >= RECOVERY_RULES.sleepOkRatio * targetMinutes), targetMinutes };

  const st = [soreness.status, energy.status, sleep.status];
  const status: RecoveryStatus = st.includes('poor') ? 'poor' : st.includes('unknown') ? 'unknown' : 'ok';
  return { status, windowStartKey, windowEndKey, soreness, energy, sleep,
           checkInIds: ci.map(c => c.id), sleepLogIds: sl.map(s => s.id),
           summaryTr: recoverySummaryTr(soreness, energy, sleep) };
}
```

Repository sorgusu (`RecoveryRepository.window(fromKey, toKey)`): `check_ins WHERE local_date_key BETWEEN ? AND ?` ve `sleep_logs` için `COALESCE(duration_minutes, CAST((julianday(wake_utc) - julianday(bedtime_utc)) * 1440 AS INTEGER))`; ikisi de NULL ise satır sinyale girmez.

### 6.5 Performans trendi — `performanceTrend`

Girdi: kasın **direkt** hareketlerine (`primaryMuscle === muscle`) ait `Exposure[]` (03 §3) — W−1 ve W haftaları; exposure'lar `status IN ('completed','partial')` oturumlardan, `discarded = 0` working setlerden, `effectiveLoad` `v_set_effective_load` üzerinden gelir (R101.4; assisted türde 40 → 35 kg yardım = effectiveLoad −40 → −35 = artış, R101.3).

Birim = `exerciseId + side` (unilateral `separate` → sol/sağ ayrı; R102.3). Her birim için haftanın **en iyi seti**: `painFlag`, `formBreakdownFlag` veya `excludeFromPr` işaretli setler dışarıda (R107.3 ruhu; teknik bozuk set performans kanıtı değildir); kalanlar arasında en yüksek `effectiveLoad`, eşitlikte en yüksek `reps`. Haftada birden çok exposure varsa en iyi olan alınır.

| Karşılaştırma (W−1 → W) | Sonuç |
|-------------------------|-------|
| `effectiveLoad` arttı (> 1e-6) | `up` |
| `effectiveLoad` azaldı | `down` |
| yük eşit (veya bir tarafta yük NULL → yalnızca reps), `Δreps ≥ +2` | `up` |
| yük eşit, `Δreps ≤ −2` | `down` |
| yük eşit, `Δreps ∈ {−1, 0, +1}` | `stable` (tek tekrarlık dalgalanma gürültü sayılır, R123.2) |
| birim yalnızca bir haftada var, ya da bir haftada kullanılabilir seti yok | `notComparable` |

Kas düzeyi birleştirme — muhafazakâr (R104.5, R105.1): herhangi bir birim `down` → `down`; hiç `down` yok ve ≥ 1 `up` → `up`; karşılaştırılabilir birimlerin hepsi `stable` → `stable`; karşılaştırılabilir birim yok → `unknown` (öneri yok; "stable" **uydurulmaz**).

```ts
export type PerformanceTrend = 'up' | 'stable' | 'down' | 'unknown';
export const TREND_RULES = { loadEps: 1e-6, repStableBand: 1 } as const;

export interface BestSet { effectiveLoad: number | null; reps: number; setIndex: number; sessionId: string; }
export interface TrendUnit {
  exerciseId: string; side: Side;
  prev: BestSet | null; cur: BestSet | null;
  verdict: 'up' | 'stable' | 'down' | 'notComparable';
}
export interface PerformanceTrendResult {
  trend: PerformanceTrend;
  previousWeekStartKey: WeekStartKey; referenceWeekStartKey: WeekStartKey;
  units: TrendUnit[]; comparableCount: number;
}

function bestSetOf(e: Exposure): BestSet | null {
  const usable = e.workingSets.filter(s => !s.painFlag && !s.formBreakdownFlag && !s.excludeFromPr);
  if (usable.length === 0) return null;
  const allLoaded = usable.every(s => s.effectiveLoad != null);
  const [top] = [...usable].sort((a, b) =>
    allLoaded ? ((b.effectiveLoad as number) - (a.effectiveLoad as number)) || (b.reps - a.reps) : b.reps - a.reps);
  return { effectiveLoad: allLoaded ? top.effectiveLoad : null, reps: top.reps, setIndex: top.setIndex, sessionId: e.sessionId };
}
function better(a: BestSet, b: BestSet): BestSet {          // haftanın en iyisi
  if (a.effectiveLoad != null && b.effectiveLoad != null && Math.abs(a.effectiveLoad - b.effectiveLoad) > TREND_RULES.loadEps)
    return a.effectiveLoad > b.effectiveLoad ? a : b;
  return a.reps >= b.reps ? a : b;
}
function compare(prev: BestSet, cur: BestSet): 'up' | 'stable' | 'down' {
  if (prev.effectiveLoad != null && cur.effectiveLoad != null) {
    const dLoad = cur.effectiveLoad - prev.effectiveLoad;
    if (dLoad > TREND_RULES.loadEps) return 'up';
    if (dLoad < -TREND_RULES.loadEps) return 'down';
  }
  const dReps = cur.reps - prev.reps;
  if (dReps > TREND_RULES.repStableBand) return 'up';
  if (dReps < -TREND_RULES.repStableBand) return 'down';
  return 'stable';
}

export function performanceTrend(
  muscle: MuscleGroup, exposuresPrev: Exposure[], exposuresRef: Exposure[],
  primaryMuscleOf: (exerciseId: string) => MuscleGroup,
  weeks: { previousWeekStartKey: WeekStartKey; referenceWeekStartKey: WeekStartKey },
): PerformanceTrendResult {
  const bestByUnit = (xs: Exposure[]) => {
    const m = new Map<string, BestSet>();
    for (const e of xs) {
      if (primaryMuscleOf(e.exerciseId) !== muscle) continue;          // yalnızca direkt hareketler
      const b = bestSetOf(e); if (!b) continue;
      const k = `${e.exerciseId}|${e.side}`;
      m.set(k, m.has(k) ? better(m.get(k)!, b) : b);
    }
    return m;
  };
  const prev = bestByUnit(exposuresPrev), cur = bestByUnit(exposuresRef);
  const units: TrendUnit[] = [...new Set([...prev.keys(), ...cur.keys()])].sort().map(k => {
    const [exerciseId, side] = k.split('|') as [string, Side];
    const p = prev.get(k) ?? null, c = cur.get(k) ?? null;
    return { exerciseId, side, prev: p, cur: c, verdict: p && c ? compare(p, c) : 'notComparable' };
  });
  const v = units.map(u => u.verdict).filter(x => x !== 'notComparable');
  const trend: PerformanceTrend =
    v.length === 0 ? 'unknown' : v.includes('down') ? 'down' : v.includes('up') ? 'up' : 'stable';
  return { trend, ...weeks, units, comparableCount: v.length };
}
```

### 6.6 Öneri kararı, delta ve haftada tek öneri — `VolumeGuardrails.evaluate`

Koşul zinciri 02 §9.3'tür: `recoveryOk(last7d)` **ve** `performanceTrend ∈ {stable, up}` **ve** `current + delta ≤ max` **ve** haftada tek öneri, `delta ∈ {1, 2}` (R105.3, R105.4). Bu belge iki ön kapı ekler ve bunları açık nokta olarak işaretler: `is_priority = 1` (R105.1 "öncelikli kaslar için") ve `current ≥ baseline` (yapılmamış hacmin üstüne set eklenmez; R103.5 ruhu).

**Delta seçimi** (02'de kural yok; burada tanımlanır, açık nokta): varsayılan `+1`. `+2` yalnızca şu üçü birlikte sağlanınca: trend `up`; referans haftayı hedefleyen (bir önceki) `volumeIncrease` önerisi `accepted`; ve `currentWeeklySets ≥` o önerinin `proposed.sets` değeri (artış gerçekten yapılmış). Sonra `delta = min(delta, max − current)`; sonuç 0 ise `atMax`. Sabit `GUARDRAIL_RULES.maxDeltaPerWeek = 2` her çıkışta assert edilir.

**Haftada tek öneri:** aynı kas için `targetWeek`'i hedefleyen bir `volumeIncrease` kaydı (kararı ne olursa olsun: açık, kabul, değiştirildi, yok sayıldı, süresi doldu) varsa yeni öneri üretilmez. `recommendations` tablosunda hafta kolonu olmadığından hedef hafta `weekStartKey(localDateKey(created_at_utc, clock.timeZone()))` ile türetilir (bkz. açık nokta).

```ts
export const GUARDRAIL_RULES = { defaultDelta: 1, maxDeltaPerWeek: 2 } as const;

export interface MuscleVolumeTarget {            // muscle_volume_targets (03 §1.7)
  muscle: MuscleGroup;
  baselineWeeklyDirectSets: number;             // baseline_weekly_direct_sets  (R105.2 baselineWeeklyDirectSets)
  maxRecommendedWeeklySets: number;             // max_recommended_weekly_sets  (R105.2 maximumAllowedRecommendation)
  isPriority: boolean;                          // is_priority                  (R105.1)
  updatedAtUtc: string;
}
export interface PriorVolumeRecommendation {     // recommendations WHERE kind='volumeIncrease' AND muscle=?
  id: string; targetWeekStartKey: WeekStartKey; proposedSets: number;
  decision: 'accepted' | 'modified' | 'ignored' | null;
}
export interface VolumeGuardrailInput {
  target: MuscleVolumeTarget | null;
  programStatus: ProgramStatus;
  referenceWeekStartKey: WeekStartKey;          // W
  targetWeekStartKey: WeekStartKey;             // W + 7
  closedSessionsInReferenceWeek: number;
  currentWeeklySets: number;                    // 6.2
  recovery: RecoveryAssessment;                 // 6.4
  trend: PerformanceTrendResult;                // 6.5
  prior: PriorVolumeRecommendation[];           // son 2 haftanın kayıtları yeterli
  nowUtc: string; timeZone: string;
}
export type VolumeGuardrailReason =
  | 'noTarget' | 'invalidTarget' | 'notPriority' | 'programNotActive' | 'noWeekData' | 'belowBaseline'
  | 'alreadyRecommendedThisWeek' | 'recoveryUnknown' | 'recoveryPoor' | 'trendUnknown' | 'trendDown' | 'atMax';
export type VolumeGuardrailResult =
  | { outcome: 'recommend'; delta: 1 | 2; proposedSets: number; recommendation: Omit<Recommendation, 'id'> }
  | { outcome: 'none'; reason: VolumeGuardrailReason; detailTr: string };

const none = (reason: VolumeGuardrailReason, detailTr: string): VolumeGuardrailResult => ({ outcome: 'none', reason, detailTr });

export function evaluate(i: VolumeGuardrailInput): VolumeGuardrailResult {
  const t = i.target;
  if (!t) return none('noTarget', 'Bu kas için hacim hedefi tanımlı değil.');
  if (t.baselineWeeklyDirectSets < 0 || t.maxRecommendedWeeklySets < t.baselineWeeklyDirectSets)
    return none('invalidTarget', 'Hacim hedefi tutarsız: üst sınır baseline\'ın altında.');
  if (!t.isPriority) return none('notPriority', 'Öncelikli kas değil; otomatik hacim önerisi üretilmez.');
  if (i.programStatus !== 'active') return none('programNotActive', 'Program aktif değil (dondurulmuş/bitmiş).');
  if (i.closedSessionsInReferenceWeek === 0) return none('noWeekData', 'Geçen hafta tamamlanan antrenman yok.');
  if (i.currentWeeklySets < t.baselineWeeklyDirectSets)
    return none('belowBaseline', `Geçen hafta ${i.currentWeeklySets} direkt set yapıldı, plan ${t.baselineWeeklyDirectSets}. Plan tamamlanmadan set eklenmez.`);
  if (i.prior.some(p => p.targetWeekStartKey === i.targetWeekStartKey))
    return none('alreadyRecommendedThisWeek', 'Bu hafta için bu kasa zaten bir hacim önerisi yapıldı.');
  if (i.recovery.status === 'unknown')
    return none('recoveryUnknown', `Son 7 günde yeterli check-in/uyku verisi yok (${i.recovery.summaryTr}). Recovery bilinmiyor; öneri üretilmedi.`);
  if (i.recovery.status === 'poor') return none('recoveryPoor', `Recovery yetersiz (${i.recovery.summaryTr}).`);
  if (i.trend.trend === 'unknown') return none('trendUnknown', 'Son 2 haftada karşılaştırılabilir hareket yok.');
  if (i.trend.trend === 'down') return none('trendDown', 'Performans düşüşte; önce recovery ve yük stratejisi gözden geçirilmeli.');

  const headroom = t.maxRecommendedWeeklySets - i.currentWeeklySets;
  if (headroom <= 0) return none('atMax', `Haftalık ${i.currentWeeklySets} set üst sınırda (${t.maxRecommendedWeeklySets}).`);

  const prevWeek = i.prior.find(p => p.targetWeekStartKey === i.referenceWeekStartKey);
  const escalate = i.trend.trend === 'up' && prevWeek?.decision === 'accepted' && i.currentWeeklySets >= prevWeek.proposedSets;
  const delta = Math.min(escalate ? 2 : GUARDRAIL_RULES.defaultDelta, headroom, GUARDRAIL_RULES.maxDeltaPerWeek) as 1 | 2;
  const proposedSets = i.currentWeeklySets + delta;
  return { outcome: 'recommend', delta, proposedSets, recommendation: buildRecommendation(i, t, delta, proposedSets) };
}
```

Kapı sırası bilinçlidir: ucuz ve kalıcı nedenler önce, veri gerektirenler sonra; kullanıcıya gösterilen neden ilk başarısız kapıdır.

**Orkestrasyon** (`RecommendationService.runWeeklyVolumeReview`):

```ts
async runWeeklyVolumeReview(clock: Clock): Promise<void> {
  const today = clock.todayKey();
  const targetWeek = weekStartKey(today);
  const refWeek = addDaysToKey(targetWeek, -7), prevWeek = addDaysToKey(targetWeek, -14);
  const program = await programs.findOpen();                       // status IN ('active','paused')
  if (!program) return;
  const targets = (await volumeTargets.all()).filter(t => t.isPriority);
  const recovery = assessRecovery({ todayKey: today, ...(await recoveryRepo.window(addDaysToKey(today, -6), today)), sleepTargetHours: await profiles.sleepTargetHours() });
  const closed = await volumeRepo.countClosedSessions(refWeek, weekEndKey(refWeek));
  const results: Array<Omit<Recommendation, 'id'>> = [];
  for (const t of targets) {
    const input: VolumeGuardrailInput = {
      target: t, programStatus: program.status,
      referenceWeekStartKey: refWeek, targetWeekStartKey: targetWeek,
      closedSessionsInReferenceWeek: closed,
      currentWeeklySets: await currentWeeklySets(volumeRepo, t.muscle, refWeek),
      recovery,
      trend: performanceTrend(t.muscle, await exposures.forWeek(prevWeek), await exposures.forWeek(refWeek), catalog.primaryMuscleOf, { previousWeekStartKey: prevWeek, referenceWeekStartKey: refWeek }),
      prior: await recommendations.volumeIncreaseFor(t.muscle, prevWeek /* … bugün */, clock.timeZone()),
      nowUtc: clock.nowUtc().toISOString(), timeZone: clock.timeZone(),
    };
    const r = evaluate(input);
    if (r.outcome === 'recommend') results.push(r.recommendation);
  }
  if (results.length) await db.withTransaction(tx => recommendations.insertMany(tx, results));   // tek tx (02 §3)
}
```

Kullanıcı kararı 02 §9.6 ile aynıdır (`Kabul` / `Değiştir` / `Yok say` → `decision_action`, `decision_value_json`, `decided_at_utc`; R121.3). **Kabul** şablonu değiştirir ama yalnızca kullanıcı eylemiyle: `RecommendationService.applyVolumeIncrease(recId, templateExerciseId)` → `template_exercises.working_sets += delta`, `is_customized = 1`, `recommendations.decision_action = 'accepted'`, aynı transaction. Hangi şablon hareketine ekleneceği UI'da seçilir; varsayılan öneri, hedef haftada o kasa en çok direkt set yaptıran şablon hareketidir (kullanıcı değiştirebilir, R121.1). Öneri kas düzeyinde (`proposed.sets` = haftalık hedef) ifade edilir; hareket düzeyine indirgeme kabul anında yapılır.

### 6.7 Gerekçe metni ve evidence (R105.5, R122)

Her `volumeIncrease` kartının altında "Neden önerildi?" metni bulunur; metin kanıt verilerine (set kayıtları, check-in/uyku özetleri, sayılar) referans verir ve yalnızca `evidence` içindeki değerleri kullanır (R122.3). Şablon:

```
{Kas}: geçen hafta {current} direkt set yaptın (plan {baseline}, üst sınır {max}).
Son 7 günde {recovery.summaryTr}.
Son 2 haftada {kas} hareketlerinde performans {yükseldi|sabit kaldı} ({upCount}/{comparableCount} hareket ilerledi; örn. {exerciseNameTr} {prevLoad} kg × {prevReps} → {curLoad} kg × {curReps}).
Bu yüzden bu hafta için +{delta} set ({proposedSets}) öneriyoruz. Otomatik öneri sınırı: haftada en fazla +2 set; bu kas için üst sınır {max} set.
```

Örnek (test vektörü G1): *"Biceps: geçen hafta 12 direkt set yaptın (plan 12, üst sınır 18). Son 7 günde ağrı ort. 2.1/5, enerji ort. 3.9/5, uyku ort. 7.4 sa (hedef 8.0 sa). Son 2 haftada biceps hareketlerinde performans yükseldi (2/2 hareket ilerledi; örn. Cable Curl 30 kg × 12 → 32.5 kg × 10). Bu yüzden bu hafta için +1 set (13) öneriyoruz. Otomatik öneri sınırı: haftada en fazla +2 set; bu kas için üst sınır 18 set."*

```ts
function buildRecommendation(i: VolumeGuardrailInput, t: MuscleVolumeTarget, delta: 1 | 2, proposedSets: number): Omit<Recommendation, 'id'> {
  const metrics: Record<string, number> = {
    currentWeeklySets: i.currentWeeklySets, baselineWeeklyDirectSets: t.baselineWeeklyDirectSets,
    maxRecommendedWeeklySets: t.maxRecommendedWeeklySets, delta, proposedSets,
    trendComparableUnits: i.trend.comparableCount,
    trendUpUnits: i.trend.units.filter(u => u.verdict === 'up').length,
  };
  if (i.recovery.soreness.mean != null) metrics.sorenessMean7d = i.recovery.soreness.mean;
  if (i.recovery.energy.mean != null)   metrics.energyMean7d = i.recovery.energy.mean;
  if (i.recovery.sleep.mean != null)    metrics.sleepMeanMinutes7d = i.recovery.sleep.mean;
  if (i.recovery.sleep.targetMinutes != null) metrics.sleepTargetMinutes = i.recovery.sleep.targetMinutes;
  return {
    kind: 'volumeIncrease', muscle: t.muscle,
    proposed: { sets: proposedSets },
    rationaleTr: buildRationaleTr(i, t, delta, proposedSets),
    evidence: { setLogIds: trendEvidenceSetLogIds(i.trend), metrics },   // check-in/uyku id'leri: bkz. açık nokta
    isEstimate: false,                                                    // set sayıları kesindir; tahmin içermez
    createdAtUtc: i.nowUtc,
    expiresAtUtc: endOfLocalDayUtc(weekEndKey(i.targetWeekStartKey), i.timeZone),
  };
}
```

`none` sonuçları için Progress ekranındaki "Weekly Sets by Muscle" listesinde öncelikli kasın satırında `detailTr` tek satır bilgi olarak gösterilir (örn. "Bu hafta öneri yok: son 7 günde yeterli check-in yok."). Bu bir `Recommendation` değildir, kalıcı değildir ve kullanıcı kararı beklemez.

### 6.8 VolumeAnalytics — direkt ve secondary görünüm (§106)

```ts
export const SECONDARY_CONTRIBUTION_FACTOR = 0.5;   // R106.3: "1 tam set" kesinliği yok

export interface WeeklyMuscleVolume {
  weekStartKey: WeekStartKey;
  muscle: MuscleGroup;
  directSets: number;                                            // kesin; ana görünüm (R106.2)
  secondary: { setsEstimate: number; sourceWorkingSets: number; isEstimate: true };   // ayrı görünüm (R106.4, R123.4)
  target: { baseline: number; max: number; isPriority: boolean } | null;              // muscle_volume_targets varsa
}

export async function weekly(repo: VolumeRepository, targets: MuscleVolumeTarget[], week: WeekStartKey): Promise<WeeklyMuscleVolume[]> {
  const end = weekEndKey(week);
  const secondaryRows = await repo.secondaryWorkingSets(week, end);
  return ALL_MUSCLE_GROUPS.map(async muscle => ({ … }))  // her MuscleGroup için satır; veri yoksa 0 (liste kararlı, R106.1)
    .then(rows => Promise.all(rows.map(async r => ({
      ...r,
      directSets: await repo.sumDirectSets(r.muscle, week, end),
      secondary: {
        sourceWorkingSets: secondaryRows.find(s => s.muscle === r.muscle)?.distinctSets ?? 0,
        setsEstimate: SECONDARY_CONTRIBUTION_FACTOR * (secondaryRows.find(s => s.muscle === r.muscle)?.distinctSets ?? 0),
        isEstimate: true as const,
      },
      target: toTarget(targets.find(t => t.muscle === r.muscle)),
    }))));
}
```

Secondary sayımı için 03'te görünüm yoktur; repository sorgusu `exercises.secondary_muscles_json` üzerinden `json_each` ile yapılır (SQLite JSON1 yerleşik; expo-sqlite/SQLCipher'ın bundle'ladığı SQLite ≥ 3.38). Aynı DISTINCT anahtarı kullanır (6.3):

```sql
-- VolumeRepository.secondaryWorkingSets(weekStart, weekEnd)
SELECT j.value AS muscle,
       COUNT(DISTINCT s.session_exercise_id || ':' || s.set_index) AS distinct_sets
FROM set_logs s
JOIN workout_sessions ws ON ws.id = s.session_id
JOIN exercises e ON e.id = s.exercise_id
JOIN json_each(e.secondary_muscles_json) j
WHERE s.set_type = 'working' AND s.discarded = 0
  AND ws.status IN ('completed','partial')
  AND ws.calendar_date_key BETWEEN :weekStart AND :weekEnd
  AND j.value <> e.primary_muscle                      -- katalog hatasına karşı koruma
GROUP BY j.value;
```

UI kuralları (R106.2–R106.4, R123.4): ana liste yalnızca `directSets` gösterir ("Biceps 13"). "Dolaylı katkı (tahmin)" ayrı bir bölüm/sekmedir; her satırda `isEstimate` nedeniyle otomatik "tahmin" rozeti (02 §9.7) ve "≈ 4.0 set" biçimi. Hiçbir yerde `directSets + secondary.setsEstimate` toplamı gösterilmez veya hesaplanmaz; bileşen testi bunu doğrular. `secondary.setsEstimate` 0.5'in katıdır; yuvarlama yapılmaz, tek ondalıkla gösterilir. `VolumeGuardrails` **yalnızca** `directSets` ile çalışır; secondary tahmin öneri koşullarına girmez.

### 6.9 Kural/geçiş tabloları

**Öneri kapıları** (sırayla; ilk başarısız kapı nedeni belirler):

| # | Kapı | Koşul | Geçemezse | Gereksinim |
|---|------|-------|-----------|------------|
| 1 | Hedef var | `muscle_volume_targets` satırı mevcut | `noTarget` | R105.2 |
| 2 | Hedef tutarlı | `0 ≤ baseline ≤ max` | `invalidTarget` (dev assert + log) | R105.2 |
| 3 | Öncelikli kas | `is_priority = 1` | `notPriority` | R105.1 |
| 4 | Program aktif | `programs.status = 'active'` | `programNotActive` | R89.3 |
| 5 | Referans hafta verisi | W'de `completed`/`partial` oturum ≥ 1 | `noWeekData` | R103.5 |
| 6 | Plan yapılmış | `currentWeeklySets ≥ baseline` | `belowBaseline` | R103.5 (türetilmiş; açık nokta) |
| 7 | Haftada tek öneri | `targetWeek` için `volumeIncrease` yok | `alreadyRecommendedThisWeek` | R105.4 |
| 8 | Recovery bilinir | `recovery.status ≠ 'unknown'` | `recoveryUnknown` | R105.3, R119.3, R123.1 |
| 9 | Recovery iyi | `recovery.status = 'ok'` | `recoveryPoor` | R105.3 |
| 10 | Trend bilinir | `trend ≠ 'unknown'` | `trendUnknown` | R105.3, R123.1 |
| 11 | Trend stabil/yukarı | `trend ∈ {stable, up}` | `trendDown` | R105.3 |
| 12 | Üst sınır | `current < max` | `atMax` | R105.1, R105.4 |
| 13 | Öneri | `delta = min(1|2, max − current)`, `proposed = current + delta` | — | R105.4, R105.5 |

**Delta seçimi:**

| Trend | Önceki hafta (`targetWeek = W`) önerisi | `current ≥ önceki proposed.sets` | Aday delta | Sonuç |
|-------|------------------------------------------|----------------------------------|------------|-------|
| `stable` | — | — | 1 | `min(1, max − current)` |
| `up` | yok / `ignored` / `modified` / açık | — | 1 | `min(1, max − current)` |
| `up` | `accepted` | hayır | 1 | `min(1, max − current)` |
| `up` | `accepted` | evet | 2 | `min(2, max − current)` |

**Recovery birleştirme:**

| soreness | energy | sleep | Sonuç |
|----------|--------|-------|-------|
| herhangi biri `poor` | | | `poor` |
| `poor` yok, herhangi biri `unknown` | | | `unknown` |
| `ok` | `ok` | `ok` | `ok` |

**Trend birleştirme (karşılaştırılabilir birimler):**

| Birim sonuçları | Kas trendi |
|-----------------|------------|
| hiç yok | `unknown` |
| ≥ 1 `down` | `down` |
| `down` yok, ≥ 1 `up` | `up` |
| hepsi `stable` | `stable` |

**`volumeIncrease` yaşam döngüsü:** `open` (decision_action NULL, `expires_at_utc` gelecekte) → `accepted` / `modified` / `ignored` (kullanıcı) veya `expired` (türetilir: decision NULL ve `expires_at_utc < now`; UI kartı gizler, kayıt kalır). Süresi dolan öneri de "haftada tek öneri" sayımına girer; aynı hafta yenisi üretilmez.

### 6.10 Sınır durumları ve hata durumları

| Durum | Davranış |
|-------|----------|
| Oturum 23:50 Pazar başlar, setler 00:10 Pazartesi loglanır | `calendar_date_key` = Pazar → önceki hafta. `set_logs.local_date_key` (Pazartesi) sayıma girmez (R113.1–R113.3). |
| `calendar_date_overridden = 1` | Düzenlenmiş tarih geçerli; kullanıcı Pazar antrenmanını Pazartesi'ye taşıdıysa hafta değişir (R113.4). |
| Referans haftada oturum `active` kaldı (bitirilmedi) | Görünüm dışlar → o setler sayılmaz. Resume kartı (R90.4) kapatılana kadar hafta eksik görünür; `belowBaseline` nedeni bunu söyler. |
| İptal edilen oturum (`cancelled`, setler `discarded = 1`) | Sayılmaz (görünüm `discarded = 0`). |
| Kısmi oturum (`partial`) | Sayılır; yalnızca gerçekleşen setler (R103.5). |
| Aynı gün iki oturum aynı kas | DISTINCT `session_exercise_id:set_index` → doğru toplam. |
| Unilateral `separate`, yalnızca sol loglanmış (sağ eksik) | `set_index` mevcut → **1 set** sayılır (görünüm semantiği). Yarım set 0.5 sayılmaz; açık nokta. |
| Hareket değiştirildi (`original_exercise_id` dolu) | Sayım gerçek `exercise_id`'nin `primary_muscle`'ına gider. Trend birimi `exercise_id` bazlı olduğundan iki hafta farklı hareketse `notComparable` → tek hareketli kaslarda `trendUnknown`. |
| Program haftanın ortasında başladı | W−1 boş → `trendUnknown`; ilk öneri en erken 3. haftanın Pazartesi'si. Beklenen davranış; UI "İlk karşılaştırma için 2 tam hafta gerekli." |
| Program dondurulmuş (`paused`) | Kapı 4 → `programNotActive`; hiçbir öneri üretilmez, dondurma haftaları `noWeekData` olarak kalır (R89.3). |
| Timezone hafta içinde değişti | Anahtarlar yazıldığı anda sabit (02 §5.1); hafta sınırı anahtarlardan türetilir, kayma yok (AT-13). `created_at_utc` → hedef hafta türetimi güncel tz ile yapılır; sınırda ±1 gün riski açık noktada. |
| `check_ins` satırında `soreness` NULL, `energy` dolu | Yalnızca energy sinyaline gün olarak sayılır. |
| `sleep_logs.duration_minutes` NULL, `bedtime_utc`/`wake_utc` dolu | Fark türetilir; ikisi de yoksa satır atlanır. |
| `training_profiles.sleep_target_hours` NULL | sleep `unknown` → recovery `unknown` → öneri yok; UI "Uyku hedefini profilde belirle." Varsayılan saat uydurulmaz (R123.1). |
| Tam 3 gün veri (`minDaysPerSignal`) | Yeterli (≥ 3). 2 gün → `unknown`. |
| Uyku ortalaması tam `0.9 × hedef` | `ok` (≥). |
| `max_recommended_weekly_sets = baseline` | Kapı 12: `current ≥ max` → `atMax`; hiç artış önerilmez (tasarım: max = "artış yok" demenin yolu). |
| `current > max` (kullanıcı şablonu elle artırdı) | `atMax`; motor azaltma önermez (`volumeHold`/`deload` bu bölümün kapsamı dışı, açık nokta). |
| Aynı kasa 2 exposure/hafta, biri `painFlag` | İşaretli set dışarıda; diğer exposure değerlendirilir. Tüm setler işaretliyse birim `notComparable`. |
| `effectiveLoad` NULL (bodyweight bilinmiyor) | Karşılaştırma yalnızca reps ile (02 §8.4). |
| Kullanıcı öneriyi `Değiştir` ile 14'e çıkardı (delta 2 sınırı) | `decision_value_json` olduğu gibi saklanır (R121.2); guardrail kullanıcı kararını kısıtlamaz, yalnızca **otomatik** öneriyi sınırlar (R105.4). Sonraki hafta `escalate` için `modified` sayılmaz. |
| Yedekten geri yükleme sonrası aynı gün tekrar çalışma | Kapı 7 `recommendations` tablosundan okur → tekrar üretmez (idempotent). |
| `muscle_volume_targets` boş (seed yok) | Tüm kaslar `noTarget`; Progress ekranı direkt setleri yine gösterir, öneri satırı yok. |

**Hata durumları** (R117):

| Hata | Yakalama | Etki |
|------|----------|------|
| Repository okuma hatası (SQLITE_BUSY, bozuk görünüm) | `runWeeklyVolumeReview` try/catch → `AppError('VolumeReviewFailed')`, log'da DB içeriği yok (R118.2) | Öneri üretilmez; uygulama akışı bozulmaz; Progress ekranında "Hacim analizi yüklenemedi. Yeniden dene." (R117.3, R117.5). Sonraki tetiklemede yeniden dener. |
| `insertMany` yazma hatası (`DbWriteError`) | Transaction rollback | Kısmi öneri seti yazılmaz; tekrar denemede kapı 7 sayesinde çift kayıt oluşmaz. |
| Hedef satırı tutarsız (`max < baseline`) | Kapı 2 | `invalidTarget`; dev build'de assert, prod'da sessiz öneri-yok + log. Şemaya CHECK eklenmesi açık noktada. |
| `evidence_json`/`proposed_json` Zod hatası | `RecommendationRepository.insert` | Yazılmaz; hata log'lanır; kullanıcıya gösterilmez (öneri olmaması güvenli taraftır). |
| Trend/recovery fonksiyonlarına geçersiz girdi (NaN, negatif set) | Saf fonksiyonlar `invariant()` ile atar | Orkestrasyon yakalar; o kas atlanır, diğerleri değerlendirilir. |

### 6.11 Test vektörleri

Ortak fixture (aksi belirtilmedikçe): `muscle_volume_targets('biceps')` = `{ baseline_weekly_direct_sets: 12, max_recommended_weekly_sets: 18, is_priority: 1 }`; `programStatus = 'active'`; `closedSessionsInReferenceWeek = 4`; `referenceWeekStartKey = '2026-08-31'`; `targetWeekStartKey = '2026-09-07'`; `prior = []`; recovery `ok` (R1); trend `up` (T1).

**Guardrail (`evaluate`)**

| # | Girdi farkı | Beklenen çıktı |
|---|-------------|----------------|
| G1 | `currentWeeklySets = 12` | `recommend`, `delta 1`, `proposedSets 13`, `kind 'volumeIncrease'`, `muscle 'biceps'`, `proposed.sets 13`, `metrics.delta 1` |
| G2 | recovery `poor` (R2) | `none`, `recoveryPoor` |
| G3 | `currentWeeklySets = 18` | `none`, `atMax` |
| G4 | G1 + `prior = [{ targetWeekStartKey '2026-09-07', proposedSets 13, decision null }]` | `none`, `alreadyRecommendedThisWeek` |
| G5 | `currentWeeklySets = 17` | `recommend`, `delta 1`, `proposedSets 18` (headroom clamp) |
| G6 | recovery `unknown` (R3) | `none`, `recoveryUnknown` |
| G7 | trend `down` (T4) | `none`, `trendDown` |
| G8 | trend `stable` (T2), current 12 | `recommend`, `delta 1`, `proposedSets 13` |
| G9 | `is_priority = 0` | `none`, `notPriority` |
| G10 | `currentWeeklySets = 10` | `none`, `belowBaseline` |
| G11 | `prior = [{ targetWeekStartKey '2026-08-31', proposedSets 13, decision 'accepted' }]`, current 13, trend `up` | `recommend`, `delta 2`, `proposedSets 15` |
| G12 | G11 ama decision `'ignored'` | `recommend`, `delta 1`, `proposedSets 14` |
| G13 | G11 ama current 12 (ek set yapılmamış) → kapı 6 geçer (12 ≥ 12) | `recommend`, `delta 1`, `proposedSets 13` |
| G14 | G11 ama trend `stable` | `recommend`, `delta 1`, `proposedSets 14` |
| G15 | `programStatus = 'paused'` | `none`, `programNotActive` |
| G16 | trend `unknown` (T9) | `none`, `trendUnknown` |
| G17 | `target = null` | `none`, `noTarget` |
| G18 | `max_recommended_weekly_sets = 10` (< baseline 12) | `none`, `invalidTarget` |
| G19 | `closedSessionsInReferenceWeek = 0`, current 0 | `none`, `noWeekData` (kapı 5, kapı 6'dan önce) |
| G20 | G1 + recovery `poor` + current 18 | `none`, `atMax` değil **`recoveryPoor`** (kapı sırası) |
| G21 | G1 | `expiresAtUtc` = `'2026-09-13T23:59:59'` `Europe/Istanbul` → `'2026-09-13T20:59:59.000Z'`; `isEstimate false` |

**Hafta sınırı ve `currentWeeklySets`**

| # | Girdi | Beklenen |
|---|-------|----------|
| W1 | `weekStartKey('2026-09-04')` (Cuma) | `'2026-08-31'` |
| W2 | `weekStartKey('2026-09-07')` (Pazartesi) | `'2026-09-07'` |
| W3 | `weekStartKey('2026-09-06')` (Pazar) | `'2026-08-31'` |
| W4 | `weekEndKey('2026-08-31')` | `'2026-09-06'` |
| W5 | `isoWeekday('2026-09-06')` | `7` |
| W6 | Oturum `calendar_date_key '2026-09-06'`, 3 working biceps seti `local_date_key '2026-09-07'` (00:10) | `sumDirectSets('biceps','2026-08-31','2026-09-06') = 3`; hafta `'2026-09-07'` için `0` |
| W7 | Oturum `status 'active'`, 4 working set | `0` |
| W8 | Oturum `status 'cancelled'`, setler `discarded 1` | `0` |
| W9 | Oturum `status 'partial'`, 2 working set | `2` |
| W10 | 3 working + 2 warmup + 1 dropset (biceps) | `3` |
| W11 | Aynı gün 2 oturum, biceps 4 + 4 | `8` |
| W12 | `tracking_mode 'separate'`: `set_index` 1..3 × `side` left/right = 6 satır | `3` (R102.4) |
| W13 | `separate`, yalnızca `side 'left'` set_index 1..3 | `3` (açık nokta) |
| W14 | Değiştirilen hareket: `original_exercise_id 'cable-curl'` (biceps), `exercise_id 'lat-pulldown'` (lats), 3 set | biceps `0`, lats `3` |

**Recovery (`assessRecovery`, `todayKey '2026-09-07'`, pencere `2026-09-01..2026-09-07`, hedef 8 sa)**

| # | Girdi | Beklenen |
|---|-------|----------|
| R1 | soreness `[2,2,3,2,1,2,3]`, energy `[4,4,3,4,4,4,4]`, uyku dk `[450,420,480,430,440,460,428]` | soreness `ok` (2.14), energy `ok` (3.86), sleep `ok` (444 ≥ 432) → **`ok`** |
| R2 | R1, soreness `[4,4,5,4,3,4,4]` | soreness `poor` (4.0) → **`poor`** |
| R3 | yalnızca 2 check-in, uyku R1 | soreness/energy `unknown` (days 2), sleep `ok` → **`unknown`** |
| R4 | R1, uyku ort. 414 dk (6.9 sa) | sleep `poor` (414 < 432) → **`poor`** |
| R5 | R1, `sleepTargetHours = null` | sleep `unknown` → **`unknown`** |
| R6 | soreness `[5,5,5]` (3 gün), energy 2 gün, uyku 0 gün | soreness `poor`, diğerleri `unknown` → **`poor`** (poor baskın) |
| R7 | 4 check-in: soreness `[null,null,2,2]`, energy `[4,4,4,4]` | soreness `unknown` (days 2), energy `ok` (days 4) → `unknown` |
| R8 | uyku `[432,432,432]` | sleep `ok` (eşitlik dahil) |
| R9 | check-in `local_date_key '2026-08-31'` (pencere dışı) | sayılmaz; `checkInIds` içermez |
| R10 | R1 | `checkInIds.length 7`, `sleepLogIds.length 7`, `windowStartKey '2026-09-01'`, `windowEndKey '2026-09-07'` |

**Trend (`performanceTrend('biceps', …)`)** — `cable-curl` primary biceps; en iyi set W−1 → W:

| # | Girdi | Beklenen |
|---|-------|----------|
| T1 | 30 kg × 12 → 32.5 kg × 10 | birim `up` → **`up`** |
| T2 | 30 × 12 → 30 × 12 | `stable` → **`stable`** |
| T3 | 30 × 12 → 30 × 11 | `stable` (band ±1) |
| T4 | 30 × 12 → 30 × 10 | `down` → **`down`** |
| T5 | 30 × 12 → 30 × 14 | `up` |
| T6 | 30 × 12 → 27.5 × 14 | `down` (yük önce) |
| T7 | cable-curl `up`, hammer-curl `down` | **`down`** (muhafazakâr) |
| T8 | cable-curl `up`, hammer-curl `stable` | **`up`** |
| T9 | yalnızca W'de exposure | `notComparable`, `comparableCount 0` → **`unknown`** |
| T10 | W'deki tek set `painFlag 1` | W best `null` → `notComparable` → `unknown` |
| T11 | W exposure'ında iki set: 32.5 × 8 ve 30 × 12; W−1 best 30 × 12 | W best 32.5 × 8 (yük önce) → `up` |
| T12 | `separate`: left 30→32.5 (`up`), right 30×12→30×10 (`down`) | **`down`** (R102.3) |
| T13 | assisted-pullup (lats, `assistanceLowerIsHarder`), effectiveLoad −40 → −35, `performanceTrend('lats', …)` | `up` (R101.3) |
| T14 | `lat-pulldown` (primary lats, secondary biceps) exposure'ları verilir, `performanceTrend('biceps', …)` | filtrelenir → `unknown` (secondary hareket trende girmez) |
| T15 | Aynı hafta 2 exposure: 30×12 ve 30×13; W−1 30×12 | W best 30×13 → `Δreps +1` → `stable` |

**VolumeAnalytics (`weekly('2026-08-31')`)**

| # | Girdi | Beklenen |
|---|-------|----------|
| S1 | `lat-pulldown` (primary lats; secondary `['biceps','upperBack']`) 8 working set + `cable-curl` 12 working set | biceps `{ directSets 12, secondary.setsEstimate 4.0, sourceWorkingSets 8, isEstimate true }`; lats `{ directSets 8, secondary.setsEstimate 0 }`; upperBack `{ directSets 0, secondary.setsEstimate 4.0 }` |
| S2 | Hiç set yok | tüm `MuscleGroup` değerleri için satır var, `directSets 0`, `secondary.setsEstimate 0`, `isEstimate true` |
| S3 | S1, `lat-pulldown` `separate` (left/right) 8 set_index | secondary `sourceWorkingSets 8` (16 değil) |
| S4 | Katalog hatası: `secondary_muscles_json` primary'yi içeriyor | o eşleşme dışlanır (`j.value <> e.primary_muscle`) |
| S5 | Bileşen: S1 satırı render | ana listede "Biceps 12"; "16" hiçbir yerde yok; secondary bölümünde "≈ 4.0 set" + "tahmin" rozeti |
| S6 | `muscle_volume_targets('biceps')` var | `target { baseline 12, max 18, isPriority true }`; yoksa `null` |

### 6.12 İlgili gereksinimler

- **§105:** R105.1 (öncelikli kas, limitsiz hacim yok — kapı 3, 12), R105.2 (`baseline_weekly_direct_sets`, `currentWeeklySets`, `max_recommended_weekly_sets`), R105.3 (recovery `ok` ∧ trend ∈ {stable, up}), R105.4 (`delta ∈ {1,2}`, haftada tek öneri), R105.5 ("Neden önerildi?").
- **§106:** R106.1 (Weekly Sets by Muscle), R106.2 (direkt working set ana görünüm), R106.3 (secondary "1 tam set" değil; 0.5 çarpanı), R106.4 (ayrı analitik, "tahmin" etiketi).
- **Dayandığı maddeler:** R102.3, R102.4 (unilateral); R103.5 (yalnızca gerçekleşen setler); R104.5, R104.7 (agresif/otomatik değişiklik yok); R101.3, R101.4 (effectiveLoad); R107.3 (işaretli set dışlama); R89.3 (dondurmada öneri yok); R112.1–R112.3, R113.1–R113.4 (hafta sınırı `calendar_date_key`); R119.3, R119.4 (NULL = bilinmiyor); R120.2 (`sleep_target_hours` → recovery); R121.1–R121.3 (Accept/Modify/Ignore, karar geçmişi); R122.1–R122.3 (gerekçe ve kanıt); R123.1–R123.4 (sahte kesinlik yok, tahmin etiketi, trend > tekil değer); R117.3, R117.5, R118.2 (hata ve log gizliliği).
- **Kabul testleri:** 02 §17'de §105/§106 için "unit"; bu bölümün G/W/R/T/S vektörleri o unit setidir. AT-06 (kısmi antrenman → W9), AT-09 (assisted → T13), AT-13 (timezone → W6) dolaylı olarak kapsanır.

### Tutarsızlık / açık nokta

- **Ad çokluğu:** R105.2 `maximumAllowedRecommendation`, 02 §9.3 `maxRecommendedWeeklySets`, 03 `max_recommended_weekly_sets` aynı kavram için üç ad. Bu belge 03'ün kolon adını (camelCase: `maxRecommendedWeeklySets`) kullanır; 01'deki ad izlenebilirlik matrisine not düşülmeli.
- **`recoveryOk(last7d)` boolean vs üç durum:** 02 §9.3 boolean gibi adlandırır; eksik veri için `unknown` zorunlu (R119.3, R123.1). Burada `assessRecovery → RecoveryStatus ('ok'|'poor'|'unknown')` tanımlandı; `recoveryOk === (status === 'ok')`. 02'nin güncellenmesi önerilir.
- **`recommendations` tablosunda `local_date_key`/`time_zone` yok:** 02 §5.1 "zaman içeren her kayıt üç bilgi taşır" kuralına aykırı. "Haftada tek öneri" için hedef hafta `created_at_utc` + güncel tz'den türetiliyor; tz değişiminde sınırda ±1 gün riski var. Öneri: `002` migration'da `period_key TEXT` (hedef hafta Pazartesi anahtarı) + `time_zone` eklenmesi ve `UNIQUE (kind, muscle, period_key)` kısmi indeksi.
- **`evidence_json` şekli:** 03 `{ setLogIds, measurementIds, metrics }`; check-in ve uyku kayıt id'leri için alan yok. Gerekçe kanıtı (R122.3) için `checkInIds?: string[]`, `sleepLogIds?: string[]` eklenmesi önerilir (JSON kolon; yalnızca Zod/TS değişikliği).
- **`Exposure.workingSets` içinde `setLogId` yok** (03 §3): `evidence.setLogIds` doldurulamıyor; `setIndex + sessionId` üzerinden dolaylı eşleme gerekir. `setLogId: string` eklenmesi önerilir.
- **`check_ins.soreness`/`energy` ölçek yönü** 03'te tanımsız. Bu belge soreness 1 = yok … 5 = çok yüksek, energy 1 = çok düşük … 5 = çok yüksek varsayar; UI etiketleriyle doğrulanmalı.
- **`sleep_target_hours` NULL sonucu:** hedef girilmemişse hacim önerisi hiç üretilmez. 02 §11.4 bu sonucu belirtmez; onboarding'de alanın "önerilir" olması ve Progress ekranında CTA gerekir.
- **`muscle_volume_targets` kısıtları:** `CHECK (max_recommended_weekly_sets >= baseline_weekly_direct_sets)` ve `muscle` için `MuscleGroup` CHECK'i yok. `is_priority` kaynağı (ÇÖZÜLDÜ: Bölüm I §28 seed tablosu; kullanıcı Ayarlar'dan düzenleyebilir) ve 02'deki "yoksa baseline+6" varsayılanının kim tarafından yazıldığı (seed / migration) tanımsız.
- **R106.1 "Lats/Back" görüntü grubu:** `MuscleGroup`'ta `lats` ve `upperBack` ayrı; birleşik görüntü grubu tanımı yok. Analitik burada kas bazlı üretir; gruplama UI katmanına bırakıldı, tanımlanmalı.
- **R105.4 kapsamı:** "bir haftada +1–2 set" kas başına mı, toplam mı? 02 kas başına okur; bu belge de öyle. Birden çok öncelikli kasta toplam otomatik artış (örn. 4 kas × +2 = +8) için global tavan kararı gerekiyor.
- **Delta seçim kuralı (+1 / +2)** 02'de yok; buradaki "önceki hafta kabul edildi ve yapıldı ve trend up → +2" kuralı bir tasarım önerisidir, onay bekler.
- **`belowBaseline` kapısı** 02 §9.3 koşul listesinde yok; R103.5 ruhuyla eklendi. Onay bekler.
- **Unilateral yarım set:** `separate` modda yalnızca bir taraf loglanmışsa görünüm 1 set sayar; 0.5 sayma alternatifi 02 §7.4'te ele alınmamış.
- **Trend ve hareket değiştirme:** birim `exercise_id` bazlı; değiştirme (`original_exercise_id`) karşılaştırmayı bozar. 02 §8.3'teki "aile (relation) bazında birleştirme" trend için de kullanılabilir; v1'de kullanılmadı.
- **Secondary sayım görünümü:** 03'te `v_weekly_direct_sets` var, secondary için görünüm yok; `json_each` ile sorgu tanımlandı. İstenirse `v_weekly_secondary_sets` görünümü `002` migration'a eklenebilir.
- **`volumeHold` kind'ı** (03 enum) bu bölümde üretilmiyor; `none` sonuçları kalıcı olmayan bilgi satırı olarak gösteriliyor. `volumeHold` (ve `current > max` için azaltma önerisi) üretilecekse kuralları tanımlanmalı.
- **Kabulde hareket seçimi:** `proposed.sets` kas düzeyinde; hangi `template_exercises` satırının artacağı (`working_sets`, `is_customized`) 02'de yok. Varsayılan "kasa en çok direkt set yaptıran şablon hareketi" burada önerildi.
- **Hata sınıfı:** 02 §15 taksonomisinde okuma hatası sınıfı yok (`DbOpenError`, `DbWriteError`…); `VolumeReviewFailed` adı burada türetildi.
- **Bu bölümde türetilen adlar** (02/03'te yok): `assessRecovery`, `RecoveryAssessment`, `RecoveryStatus`, `RecoverySignal`, `RECOVERY_RULES`, `performanceTrend`, `PerformanceTrendResult`, `TrendUnit`, `BestSet`, `TREND_RULES`, `VolumeGuardrails.evaluate`, `VolumeGuardrailInput/Result/Reason`, `GUARDRAIL_RULES`, `MuscleVolumeTarget`, `PriorVolumeRecommendation`, `WeeklyMuscleVolume`, `SECONDARY_CONTRIBUTION_FACTOR`, `VolumeRepository`, `RecoveryRepository`, `weekStartKey`/`weekEndKey`/`addDaysToKey`/`isoWeekday`, `RecommendationService.runWeeklyVolumeReview`/`applyVolumeIncrease`, `muscleNameTr`, `endOfLocalDayUtc`. Hepsi mevcut bileşen/tablo adlarından türetilmiştir.


---

## 7. PrDetector ve tahmini performans (§107)

> Modül: `src/domain/workout/PrDetector` (02 §3, §9.5). Tablolar: `set_logs`, `personal_records`, `exercises`. Set commit transaction'ının **içinde** çalışır (02 §7.1), böylece PR kutlaması ile kayıt hiçbir zaman ayrışmaz.

### 7.1 Sorumluluk ve girdiler/çıktılar

`PrDetector.detectForSet(tx, setLog)` → `PersonalRecord[]` (0..3 satır: `loadPr`, `repPrAtLoad`, `estimatedPerformancePr`).
`PrDetector.detectSessionVolumePr(tx, sessionId)` → oturum bitirme transaction'ında, `sessionVolumePr`.
`PrDetector.reevaluate(tx, { exerciseIds })` → set düzenlendiğinde/iptal edildiğinde zinciri yeniden kurar.

**Aday filtresi (R107.2, R107.3):**

```ts
const isPrCandidate = (s: SetLog) =>
  s.setType === 'working' &&        // ısınma PR üretmez (R107.2)
  s.excludeFromPr === false &&      // kullanıcı "PR'a sayma" dedi (R107.3)
  s.discarded === false;            // iptal edilmiş oturum
```

`painFlag` / `formBreakdownFlag` işaretli set otomatik dışlanmaz; ancak set kartında **"PR'a sayma"** anahtarı bu setler için varsayılan olarak açık gelir — karar kullanıcınındır (R107.3, R121.1).

### 7.2 Sözde kod

```ts
const EPLEY_MAX_REPS = 12;   // yüksek tekrarda e1RM güvenilmez → üretilmez (R123.1)
const E1RM_TYPES = new Set(['externalLoadHigherIsHarder','bodyweightPlusExternalLoad','assistanceLowerIsHarder']);

async function detectForSet(tx: Tx, s: SetLog): Promise<PersonalRecord[]> {
  const ex = await exercises.get(tx, s.exerciseId);
  if (!isPrCandidate(s)) return [];
  const eff = effectiveLoad(s.raw, ex);                                   // §3
  const out: PersonalRecord[] = [];
  const scope = { exerciseId: s.exerciseId, side: s.side };               // taraf bazlı (R102.3)

  // (1) load PR — aynı ölçekte karşılaştırılabilir en iyi
  const bestLoad = await bestPr(tx, scope, 'loadPr');
  if (eff != null && (bestLoad == null || (comparableRaw(s, bestLoad, ex) && eff > bestLoad.effectiveLoad!)))
    out.push(mk(s, 'loadPr', { effectiveLoad: eff, reps: s.reps }));

  // (2) rep PR at same load — aynı effective load'da daha çok tekrar
  if (eff != null) {
    const bestReps = await bestRepsAtLoad(tx, scope, eff);
    if (bestReps != null && s.reps > bestReps) out.push(mk(s, 'repPrAtLoad', { effectiveLoad: eff, reps: s.reps }));
  } else {
    const bestRepsNoLoad = await bestRepsNoScale(tx, scope);              // bodyweight, bw bilinmiyor
    if (bestRepsNoLoad != null && s.reps > bestRepsNoLoad) out.push(mk(s, 'repPrAtLoad', { reps: s.reps }));
  }

  // (3) estimated performance PR — Epley, yalnızca yük ölçeği anlamlı türlerde
  if (eff != null && eff > 0 && s.reps <= EPLEY_MAX_REPS && E1RM_TYPES.has(ex.loadProgressionType)
      && !(BODYWEIGHT_DEPENDENT.has(ex.loadProgressionType) && s.raw.bodyweightKgSnapshot == null)) {
    const e1rm = round2(eff * (1 + s.reps / 30));
    const best = await bestPr(tx, scope, 'estimatedPerformancePr');
    if (best == null || e1rm > best.estimated1rm!) out.push(mk(s, 'estimatedPerformancePr', { estimated1rm: e1rm }));
  }

  for (const pr of out) { await personalRecords.insert(tx, pr); await supersedePrevious(tx, scope, pr); }
  return out;
}
```

`supersedePrevious`: aynı `(exerciseId, side, prType)` için önceki `voided=0` satırın `superseded_by_id` alanına yeni id yazılır. "Güncel PR" sorgusu = `superseded_by_id IS NULL AND voided = 0`.

**Session volume PR:** oturum bitirme transaction'ında `Σ(effectiveLoad × reps)` yalnızca aday setler üzerinden; `effectiveLoad = null` olan hareketler hacme katılmaz ve özet "hacme dahil edilmeyen N hareket" der. Unilateral `separate` modda iki taraf toplanır ama **set sayısı** çift sayılmaz (§6, R102.4).

**Geri alma (`reevaluate`):** set düzenlendiğinde (`editSet`), `excludeFromPr` işaretlendiğinde veya oturum iptal edildiğinde ilgili PR satırları `voided=1` yapılır, `superseded_by_id` zinciri onarılır ve etkilenen hareket için PR'lar geçmişten yeniden hesaplanır (tam yeniden tarama; hareket başına set sayısı küçük olduğu için maliyeti önemsiz).

### 7.3 Kural tablosu

| Set | Önceki en iyi | Üretilen |
|-----|---------------|----------|
| working 82.5×8 | loadPr 80×10 | `loadPr` (+ e1RM 104.5 > 106.7? hayır → yok) |
| working 80×11 | loadPr 80×10 | `repPrAtLoad` + `estimatedPerformancePr` (109.3 > 106.7) |
| warmup 90×3 | — | **hiçbiri** (R107.2) |
| working 90×3, `excludeFromPr=1` | — | **hiçbiri** (R107.3) |
| assisted 35 kg (bw 107 → eff 72) | loadPr eff 67 (assist 40) | `loadPr` (R101.3) |
| machineLevel 7 | level 6 | `loadPr`; e1RM **yok** (ordinal) |
| bodyweight push-up 25 tekrar, bw yok | 22 tekrar | `repPrAtLoad` (yüksüz); e1RM yok |
| 80×15 (reps > 12) | — | `loadPr`/`repPrAtLoad` mümkün; e1RM **yok** |

### 7.4 Sınır durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | İlk kez yapılan hareket | `loadPr` yazılır (baseline); UI'da "İlk kayıt" rozeti, kutlama yok |
| E2 | Aynı set aynı değerlerle tekrar | `>` katı karşılaştırma → PR yok |
| E3 | Ölçek karışımı | `comparableRaw=false` → o çift atlanır, PR üretilmez |
| E4 | Aynı oturumda iki set PR kırar | İkisi de yazılır; ilki `superseded_by_id` ile ikinciye bağlanır |
| E5 | Oturum iptal | Tüm PR'lar `voided=1`, zincir onarılır (02 §7.1) |
| E6 | `effectiveLoad = 0` (yüksüz kayıt) | e1RM üretilmez (sıfıra bölme/anlamsız değer yok) |
| E7 | Negatif effective load (bw'siz assisted) | `loadPr` çalışır (monoton), e1RM üretilmez |

### 7.5 Test vektörleri

| # | Girdi | Beklenen |
|---|-------|----------|
| TV-7.01 | 80×10 (ilk), sonra 82.5×8 | 2. sette `loadPr`; 1. satır `superseded_by_id` dolu |
| TV-7.02 | 80×10, sonra 80×11 | `repPrAtLoad` + `estimatedPerformancePr` (106.7 → 109.3) |
| TV-7.03 | warmup 90×3 | PR yok |
| TV-7.04 | working 90×3 `excludeFromPr=1` | PR yok |
| TV-7.05 | Assisted: assist 40 (bw 107, eff 67) → assist 35 (eff 72) | `loadPr`, `effective_load = 72` |
| TV-7.06 | `machineLevel` 6 → 7 | `loadPr`; `estimated_1rm IS NULL` |
| TV-7.07 | 80×15 | `loadPr` var, e1RM yok (reps > 12) |
| TV-7.08 | Sol 22×12, sağ 20×12 (`separate`) | İki ayrı satır, `side='left'` / `side='right'` |
| TV-7.09 | TV-7.02 sonrası `editSet(80×11 → 80×9)` | `repPrAtLoad` ve e1RM satırları `voided=1`; önceki en iyi tekrar güncel |
| TV-7.10 | Oturum iptali | Oturumun tüm PR satırları `voided=1`; zincir kopmaz |
| TV-7.11 | Oturum hacmi 12 400 kg, önceki en iyi 11 900 | `sessionVolumePr` |
| TV-7.12 | Oturumda `effectiveLoad=null` hareket var | Hacme katılmaz; özet "1 hareket hacme dahil edilmedi" |

### 7.6 İlgili gereksinimler

R101.4, R102.3, R102.4, R107.1–R107.4, R123.4 (e1RM "tahmin" etiketi).

### Tutarsızlık / açık nokta

- **Epley formülü ve `reps ≤ 12` sınırı** 01/02'de yok; burada seçildi (Brzycki alternatifti). Her e1RM `is_estimate`/"tahmin" rozetiyle gösterilir (R123.4).
- **`personal_records.voided`** kolonu bu tasarım turunda 03'e eklendi (önce yoktu); `PrDetector.reevaluate` buna dayanır.
- **`personal_records.exercise_id`** bu tasarım turunda nullable yapıldı ve `CHECK ((pr_type='sessionVolumePr') = (exercise_id IS NULL))` eklendi (03 §1.6): oturum hacmi bir harekete ait değildir. Bu, taslak sırasında bulunan gerçek bir şema hatasının düzeltmesidir.
- **`painFlag` setlerinde varsayılan "PR'a sayma"** 01'de yok; R107.3'ün ruhuna uygun bir UX kararı.
- **Türetilen adlar:** `PrDetector.detectForSet/detectSessionVolumePr/reevaluate`, `isPrCandidate`, `bestPr`, `bestRepsAtLoad`, `bestRepsNoScale`, `supersedePrevious`, `comparableRaw`, `EPLEY_MAX_REPS`, `E1RM_TYPES`.


---

## 8. SubstitutionEngine ve EquipmentProfile (§98, §99, §120)

> Modül: `src/domain/exercise/SubstitutionEngine`, `ExerciseCatalog`; `src/domain/profile/EquipmentProfile` (02 §3, §8.2, §8.3). Tablolar: `exercises`, `exercise_relations`, `equipment_profiles`, `training_profiles`, `session_exercises`, `template_exercises`, `set_logs`.

### 8.1 Sorumluluk ve girdiler/çıktılar

```ts
interface SubstitutionContext {
  available: EquipmentTag[];          // equipment_profiles.available_json
  painAreas: Joint[];                 // training_profiles.pain_areas_json (R120.2)
  experience: 'beginner'|'intermediate'|'advanced';
  historyExerciseIds: Set<string>;    // kullanıcının daha önce yaptığı hareketler
}
interface SubstitutionCandidate {
  exercise: Exercise; score: number; sameIntent: boolean; reasonsTr: string[];
}
SubstitutionEngine.alternatives(exerciseId, ctx): { sameIntent: SubstitutionCandidate[]; otherIntent: SubstitutionCandidate[] }
```

İki liste döner: **"Aynı amaç"** (aynı `movementPattern`) ve **"Farklı amaç"** (aynı `primaryMuscle`, farklı kalıp — kullanıcı açıkça genişletmek isterse). Sıralama deterministiktir (R99.2): `score` azalan, eşitlikte `exercise.id` artan. Aynı girdi her zaman aynı listeyi verir; rastgelelik yoktur.

### 8.2 Puanlama

```ts
function score(base: Exercise, c: Exercise, ctx: SubstitutionContext, rel?: ExerciseRelation): number {
  let s = 0;
  if (c.primaryMuscle === base.primaryMuscle)   s += 100;
  if (c.movementPattern === base.movementPattern) s += 60;
  s += 20 * jaccard(base.secondaryMuscles, c.secondaryMuscles);
  s += 10 * (3 - Math.abs(base.lengthenedBias - c.lengthenedBias));
  if (c.loadProgressionType === base.loadProgressionType) s += 8;
  if (SKILL_ORDER[c.skillLevel] <= SKILL_ORDER[ctx.experience]) s += 5;
  for (const j of ctx.painAreas) s -= 25 * (c.jointStressProfile[j] ?? 0);        // ağrı bölgesi cezası
  if (rel) s += 15;                                                               // explicit variant/substitute (R99.4)
  if (ctx.historyExerciseIds.has(c.id)) s += 3;
  return s;
}
```

**Aday filtresi:** `c.id ≠ base.id`, `c.is_deleted = 0`, `c.equipment ⊆ ctx.available` (R98.4). `sameIntent` listesi ayrıca `c.movementPattern === base.movementPattern` şartını arar. `exercise_relations` satırları (`priority` artan) listenin başına sabitlenir; kalanlar puanla sıralanır. İlk 5 gösterilir, "Tümünü gör" kalanları açar (kesme sessiz değildir).

**Gerekçe metni** (kartta tek satır, R122.1): puana katkı veren ilk üç etkenden üretilir — örn. "Aynı kas, aynı hareket kalıbı, ekipmanın var." / "Aynı kas; omuz ağrın olduğu için daha az omuz yükü."

### 8.3 EquipmentProfile

```ts
const PRESETS: Record<Preset, EquipmentTag[]> = {
  fullCommercialGym: ALL_TAGS,                                            // varsayılan (R98.3)
  homeGym:    ['dumbbells','adjustableBench','resistanceBands','pullupBar','bodyweightOnly','barbells'],
  limitedGym: ['dumbbells','barbells','adjustableBench','cableStation','latPulldown','legPress','bodyweightOnly','pullupBar'],
  custom:     [],                                                          // kullanıcı seçimi
};
```

`bodyweightOnly` etiketi **her zaman mevcut** kabul edilir; kullanıcı listede kapatamaz (UI'da gösterilmez). Onboarding'deki `gymType` preset'i ön-seçer; kullanıcı tek tek düzenlerse `preset='custom'` olur (R98.2, R120.2). Preset değişimi geçmişi etkilemez; yalnızca öneri ve alternatif listelerini filtreler.

**Ekipman kaybı senaryosu:** planlanan bir antrenmandaki hareket artık mevcut ekipmanla yapılamıyorsa, antrenman ekranında hareket satırında "Bu ekipman profilinde yok" rozeti ve doğrudan **Hareketi Değiştir** kısayolu görünür; hareket otomatik değiştirilmez (R99.1, R121.1).

### 8.4 Değiştirme akışları ve geçmiş

| Akış | Yazım | Geçmiş etkisi |
|------|-------|---------------|
| **Oturumluk** (bu antrenman için) | `session_exercises.exercise_id` UPDATE, `original_exercise_id` korunur, `substitution_reason` | Yeni hareketin kendi geçmişi; eski hareketin geçmişi olduğu gibi durur (R99.5) |
| **Set loglandıktan sonra** | Reddedilir (`SetAlreadyLoggedError`); bunun yerine `addExercise` ile yeni `session_exercises` satırı | Loglanmış setler eski harekete bağlı kalır — geçmiş bozulmaz |
| **Kalıcı** (şablonda) | `template_exercises.exercise_id` UPDATE + `is_customized = 1`; `exercise_relations`'a `('substitute')` satırı yazılır | Sonraki tüm antrenmanlar yeni hareketi kullanır |

**Aile (family) sorguları (R99.5, R99.6):** `familyOf(exerciseId)` = hareketin kendisi + `exercise_relations` üzerinden `variant` ilişkisiyle bağlı hareketler (geçişli kapanış, derinlik 2 ile sınırlı). Progress ekranında kullanıcı "Aile olarak göster" anahtarını açarsa grafik aile üzerinden çizilir ve her nokta hangi varyantla yapıldığını etiketler. **Varsayılan kapalıdır**: farklı hareketlerin yükleri birebir kıyaslanabilir değildir (R123.1). Progression ve PR motorları her zaman tek `exercise_id` üzerinden çalışır.

### 8.5 Kural tablosu

| Durum | Sonuç |
|-------|-------|
| Aday ekipmanı profilde yok | Listede yok (R98.4) |
| `movementPattern` farklı | `otherIntent` listesinde, ayrı başlık altında |
| `exercise_relations` var | Listenin başında, "önerilen alternatif" rozetiyle |
| Ağrı bölgesi eşleşiyor, `jointStressProfile[j] = 3` | −75 puan; genelde listeden düşer |
| Kullanıcı seviyesi `beginner`, aday `advanced` | +5 puan alınmaz; ayrıca kartta "ileri seviye" uyarısı |
| İki aday eşit puan | `id` alfabetik (deterministik) |

### 8.6 Test vektörleri

Katalog varsayımı: `cable-lateral-raise`, `machine-lateral-raise`, `dumbbell-lateral-raise` (hepsi `lateralDelts` / `lateralRaise`); `lat-pulldown`, `assisted-pullup`, `plate-loaded-pulldown` (hepsi `lats` / `verticalPull`); `hack-squat`, `leg-press`, `smith-squat` (hepsi `quads` / `kneeDominant`).

| # | Girdi | Beklenen sıra |
|---|-------|---------------|
| TV-8.01 (R99.4) | `cable-lateral-raise`, full gym | `machine-lateral-raise`, `dumbbell-lateral-raise` |
| TV-8.02 (R99.4) | `lat-pulldown`, profilde `latPulldown` yok | `assisted-pullup`, `plate-loaded-pulldown` |
| TV-8.03 (R99.4) | `hack-squat`, profilde `hackSquat` yok | `leg-press`, `smith-squat` |
| TV-8.04 | TV-8.01 + `dumbbells` profilde yok | Yalnızca `machine-lateral-raise` |
| TV-8.05 | `overhead-press`, `painAreas=['shoulder']`, adayların omuz stresi 3/1 | Düşük stresli aday üstte; yüksek stresli aday listede ama uyarı ile |
| TV-8.06 | Aynı puanlı iki aday | `id` artan sırada (iki çalıştırma aynı sonuç) |
| TV-8.07 (R99.5) | Oturumda `cable-lateral-raise` → `dumbbell-lateral-raise`, sonra geçmiş sorgusu | `cable-lateral-raise` geçmişi değişmedi; `session_exercises.original_exercise_id` dolu |
| TV-8.08 | Set loglanmış harekette değiştirme | `SetAlreadyLoggedError`; UI "Yeni hareket olarak ekle" sunar |
| TV-8.09 | Kalıcı değiştirme | `template_exercises.is_customized=1`; `exercise_relations` satırı oluştu |
| TV-8.10 | `homeGym` preset | `machine-*` adayları hiç görünmez; `dumbbell-*` üstte |

### 8.7 İlgili gereksinimler

R98.1–R98.4, R99.1–R99.7, R120.1–R120.2, R121.1, R122.1, R123.1.

### Tutarsızlık / açık nokta

- **Puan ağırlıkları** 02 §8.3'ten alındı; kalibrasyon (özellikle `−25 × jointStress`) gerçek katalogla test edilmeli. Katalog seed'i (`data/exercises.json`) henüz yok; test vektörleri varsayılan hareket kümesine dayanıyor.
- **`otherIntent` listesi** 02 §8.3'te "farklı amaç olarak ayrı listede" deniyor ama UI'da nasıl sunulacağı (varsayılan kapalı akordeon) burada karara bağlandı.
- **`familyOf` derinlik 2 sınırı** ve "varsayılan kapalı" kararı 02'de yok; R99.5'i karşılamak için yeterli (geçmiş kaybolmuyor), R123.1 nedeniyle varsayılan kapalı.
- **`bodyweightOnly` her zaman açık** kuralı 03 `EquipmentTag` listesinde ima edilmiyor; burada tanımlandı.
- **`substitution_reason` serbest metin** (03): sabit sebep listesi (`equipmentUnavailable`, `pain`, `preference`, `plateau`) daha analiz edilebilir olurdu; v1'de serbest metin + opsiyonel etiket önerilir.
- **Türetilen adlar:** `SubstitutionContext`, `SubstitutionCandidate`, `alternatives`, `score`, `jaccard`, `SKILL_ORDER`, `PRESETS`, `ALL_TAGS`, `familyOf`, `addExercise`.


---

## 9. AdherenceCalculator, TrendCalculator, KPI'lar ve Day 90 raporu (§103.4, §123, §96, AT-10, AT-11, AT-12, AT-20)

> Modül: `src/domain/analytics/` — `AdherenceCalculator`, `TrendCalculator`, `ChallengeReportService` (02 §3, §6.6, §9.7). Tablolar: `scheduled_workouts`, `workout_sessions`, `set_logs`, `weight_logs`, `body_measurements`, `programs`, `program_pauses`.

### 9.1 AdherenceCalculator (R103.4)

Sayım birimi **`scheduled_workouts` satırıdır** (02 §6.6); bir plan bir kez sayılır. Hafta sınırı **Pazartesi** (yerel), plan `planned_date_key` ile haftaya düşer.

```ts
interface WeekAdherence {
  weekStartKey: DateKey;
  completed: number; partial: number; skipped: number; missed: number; rescheduledOut: number; planned: number;
  partialCompletionRatio: number | null;    // Σ yapılan working set / Σ planlanan working set (yalnız partial'lar)
  pausedDays: number;                        // bilgi amaçlı; adherence yüzdesi hesabından düşülür
}
completionRate = completed / max(1, completed + partial + skipped + missed)     // rescheduledOut ve planned sayılmaz
```

`rescheduledOut` = o haftadan başka güne taşınmış planlar (çift sayımı önler; hedef hafta kendi satırında sayar). Dondurma günlerindeki planlar üretilmediği için `missed` oluşmaz (R89.3). Kısmi antrenmanlar **asla** `completed`'a eklenmez (R103.4); UI dört ayrı renkte gösterir ve kısmi çubuğun içinde tamamlanma oranı yer alır.

### 9.2 TrendCalculator (R123.2, R123.3)

```ts
const MIN_DAYS_IN_WINDOW = 3;

function weightMovingAverage(logs: WeightLog[], endKey: DateKey, windowDays = 7): TrendPoint | null {
  const byDay = groupBy(logs, l => l.localDateKey);
  const days = lastNDayKeys(endKey, windowDays)
    .map(k => byDay[k] ? mean(byDay[k].map(l => l.weightKg)) : null)      // aynı gün birden çok tartı → o günün ORTALAMASI
    .filter((v): v is number => v != null);
  if (days.length < MIN_DAYS_IN_WINDOW) return null;                      // "yeterli veri yok" (R123.1)
  return { value: round1(mean(days)), daysUsed: days.length, isEstimate: false };
}

function slope28d(logs: WeightLog[], endKey: DateKey): { kgPerWeek: number; label: 'up'|'down'|'stable' } | null {
  // günlük ortalamalar üzerinde en küçük kareler; en az 8 gün veri
}
```

Etiket eşikleri (02 §9.7): kilo `|kg/hafta| < 0.2` → `stable`; ölçüm `|Δ| < 0.5 cm` → `stable`. UI hiçbir zaman tek bir tartıyı "ilerleme" olarak sunmaz; her kart 7 günlük ortalamayı birincil, günlük değeri ikincil gösterir.

**Yasak ifadeler (R123.1) — lint kuralı ve kod inceleme kontrol listesi:** "kesin", "garanti", "% X hazırsın", "X gram kas kazandın", "vücut yağın % X" (ölçümden türetilmiş tahmin olmadıkça ve "tahmin" etiketi olmadıkça). İzin verilen dil: "7 günlük ortalama", "eğilim", "tahmini", "değişmedi denebilir".

### 9.3 KPI'lar

| KPI | Formül | Eksik veri davranışı |
|-----|--------|----------------------|
| Kilo (7g ort.) | §9.2 | < 3 gün → "Yeterli tartı yok" |
| Omuz/bel oranı (AT-11) | `shoulder ÷ waist`, 2 ondalık; iki sitenin **birbirine en yakın ± 3 gün** ölçüm çifti | Eşleşme yoksa "Ölçümler eşleşmedi" |
| Kol (biceps) gelişimi (AT-12) | `son − baseline`; baseline `BaselineResolver.biceps()` (02 §11.2) | Baseline `null` → KPI **pasif**, CTA **"Başlangıç kol ölçümünü ekle."**, **asla `0 cm`** (R96.3–R96.5) |
| Haftalık uyum | §9.1 `completionRate` | Plan yoksa "—" |
| Haftalık direkt set | §6 `VolumeAnalytics` | — |

Sol/sağ biceps ayrı girildiyse KPI ortalamayı gösterir ve satır altında "sol 38.4 / sağ 38.9" verir; tek taraf eksikse yalnızca mevcut taraf gösterilir (uydurma ortalama yok).

### 9.4 Day 90 raporu (AT-20)

```ts
interface ChallengeReport {
  programId: string; startDateKey: DateKey; endDateKey: DateKey; calendarMode: CalendarMode;
  pausedDays: number; sessions: { completed: number; partial: number; skipped: number; missed: number };
  metrics: ReportMetric[];     // her biri: { key, startValue|null, finalValue|null, delta|null, sourceTr, isEstimate }
  prs: PersonalRecord[]; volumeByMuscle: WeeklySets[]; notesTr: string[];
}
```

- **Başlangıç değeri:** `is_baseline=1` kaydı; yoksa `start_date_key ± 7 gün` penceresindeki ilk kayıt; yoksa `null` → rapor satırı **"ölçülmedi"** der (uydurma yok).
- **Final değer:** `endDateKey` (90. gün veya program `completed_at_utc` günü) ve öncesindeki **son 7 gün** içindeki kayıtların medyanı; o pencerede kayıt yoksa son kayıt + tarihi ("14 gün önce ölçüldü" notu).
- **Kilo:** başlangıç = `start_date_key` ± 7 gün penceresindeki ilk 7 günlük ortalama; final = son 7 günlük ortalama (R123.2).
- **Geç baseline:** biceps gibi sonradan alınan ölçümlerde satır "Başlangıç: Gün 40" etiketi taşır ve delta bu tarihten itibaren hesaplanır.
- **`activeDays` modunda** rapor başlığı "90 aktif gün (takvimde 104 gün, 14 gün dondurma)" biçiminde her iki sayıyı da verir.

Rapor salt okunurdur ve dışa aktarılabilir (metin + yedek ZIP'i); hiçbir hedef veya program otomatik değişmez.

### 9.5 Sınır durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | Program 90 günden kısa sürdü (abandoned) | Rapor yine üretilir; başlık "N. günde bırakıldı" |
| E2 | Hiç ölçüm yok | Tüm satırlar "ölçülmedi"; rapor yine antrenman istatistiklerini gösterir |
| E3 | Timezone değişti | Tüm hesaplar `local_date_key` üzerinden; gün kayması yok (R112.4) |
| E4 | Aynı gün çift tartı | O günün ortalaması (§9.2) |
| E5 | 7 günlük pencerede 2 gün veri | `null` + "Yeterli tartı yok" |
| E6 | Bel ve omuz farklı günlerde (5 gün fark) | Oran gösterilmez (± 3 gün kuralı) |
| E7 | Biceps yalnızca sağ ölçülmüş | KPI sağ üzerinden, "yalnızca sağ" etiketiyle |

### 9.6 Test vektörleri

| # | Girdi | Beklenen |
|---|-------|----------|
| TV-9.01 (AT-10) | 107.0, 106.8, 107.4, 106.5, (eksik), 106.9, 106.6 | 6 gün kullanıldı; ortalama **106.87 → 106.9** (1 ondalık) |
| TV-9.02 (AT-10) | Aynı pencerede yalnızca 2 gün | `null`, "Yeterli tartı yok" |
| TV-9.03 (AT-10) | Bir günde 106.4 ve 106.8 | O gün 106.6 olarak sayılır |
| TV-9.04 (AT-11) | waist 95, shoulder 137, aynı gün | `1.44` |
| TV-9.05 (AT-11) | waist 95 (1 Eyl), shoulder 137 (3 Eyl) | `1.44` (± 3 gün içinde) |
| TV-9.06 (AT-11) | waist 95 (1 Eyl), shoulder 137 (8 Eyl) | Oran gösterilmez |
| TV-9.07 (AT-12) | Biceps ölçümü hiç yok | KPI pasif + CTA "Başlangıç kol ölçümünü ekle."; **`0 cm` hiçbir yerde yok** |
| TV-9.08 (AT-12) | Biceps yalnızca Gün 40'ta | KPI aktif, "Başlangıç: Gün 40" etiketi |
| TV-9.09 (R103.4) | Hafta: 2 completed, 1 partial, 1 missed | `completionRate = 2/4 = %50`; partial ayrı çubuk |
| TV-9.10 (R103.4) | Plan salıdan perşembeye taşındı (aynı hafta) | `rescheduledOut` 1, hedef gün kendi sonucuyla sayılır; çift sayım yok |
| TV-9.11 (AT-20) | Başlangıç waist 95 (Gün 1), final 89.5/90/89 (son 7 gün) | `startValue 95`, `finalValue 89.5` (medyan), `delta −5.5` |
| TV-9.12 (AT-20) | `activeDays` modu, 14 gün dondurma | Başlık iki sayıyı da gösterir |

### 9.7 İlgili gereksinimler

R89.5, R96.3–R96.5, R103.4, R112.4, R119.3, R123.1–R123.4, AT-10, AT-11, AT-12, AT-20.

### Tutarsızlık / açık nokta

- **`ChallengeReportService`** bu turda 02 modül haritasına eklendi; ekran (`app/(tabs)/progress/report.tsx`) ve raporun ne zaman üretileceği (kullanıcı "Programı tamamla" dediğinde, 02 §6.5) tanımlandı.
- **Final değer için "son 7 gün medyanı"** 01/02'de yok; alternatif "son kayıt"tı. Medyan gürültüye daha dayanıklı (R123.2), ama tek kayıt varsa o kayıt kullanılır.
- **± 3 gün eşleştirme penceresi** (omuz/bel) burada tanımlandı; 01 yalnızca "waist/shoulder ratio doğru" der.
- **Oran yönü `shoulder ÷ waist`** seçildi (V-taper hedefiyle uyumlu, büyüyen sayı = iyileşme). 01 yön belirtmiyor.
- **`completionRate` paydası**: `rescheduledOut` ve `planned` dışarıda. Alternatif payda tanımı ürün kararıdır.
- **Yasak ifade lint kuralı** için sözlük dosyası (`src/shared/copy/forbidden-phrases.ts`) gerekir; test bu dosyayı UI string'lerine karşı çalıştırır.
- **Türetilen adlar:** `WeekAdherence`, `TrendPoint`, `ChallengeReport`, `ReportMetric`, `weightMovingAverage`, `slope28d`, `MIN_DAYS_IN_WINDOW`, `completionRate`, `lastNDayKeys`, `round1`.


---

## 10. RecipeBuilder, CopyService ve besin kaynağı yönetimi (§109, §110, §111)

> Modül: `src/domain/nutrition/` — `FoodCatalog`, `RecipeBuilder`, `MealLogService`, `CopyService` (02 §3). Tablolar: `food_items`, `food_favorites`, `recipes`, `recipe_ingredients`, `saved_meals`, `saved_meal_entries`, `meal_logs`, `meal_entries`, `nutrition_targets` (03 §1.9). Tüm servisler saf TypeScript'tir; DB'ye yalnızca repository port'ları ve `Clock` üzerinden erişir; her kullanıcı komutu tek `db.withTransaction(tx => …)` içinde çalışır (02 §3, 03 §0).

### 10.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Sorumluluk | Girdi | Çıktı | Yazdığı tablolar |
|---------|------------|-------|-------|------------------|
| `RecipeBuilder` | Tarif toplamı, per-100g-cooked, porsiyon hesabı (R110.1–R110.5); tarif kaydı | `Recipe` (+ `recipe_ingredients`), ilgili `FoodItem` haritası, `portionG` | `RecipeNutrition` (tam hassasiyet), `PortionNutrition` (yuvarlanmış) | `recipes`, `recipe_ingredients` — **asla** `meal_entries` |
| `MealLogService` | Öğün girişi; snapshot üretimi; gram düzenlemede snapshot ölçekleme; günlük toplam ve hedefe uyum (adherence) | `EntryRef` (`foodId` **veya** `recipeId`), `grams`, `localDateKey`, `mealSlot` | `meal_entries` snapshot'ları, `DailyTotals`, `DailyAdherence`, `AdherenceWindow` | `meal_logs`, `meal_entries`, `command_log` |
| `CopyService` | Copy Yesterday / Copy Meal / Repeat Breakfast / Saved Meal (R109.1) | kaynak `meal_logs.id` veya `local_date_key`, hedef `toKey` + `slot`, `commandId` | `CopyResult` | `meal_logs` (`copied_from_id`), `meal_entries`, `saved_meals`, `saved_meal_entries`, `command_log` |
| `FoodCatalog` | Besin arama; favorites / recents sorguları (R109.1); seed birleştirme, label override, geri alma (R111.1–R111.3) | seed dosyası (`data/foods.seed.json`, `seedVersion`), kullanıcı override girdisi | `FoodItem[]`, `RecentItem[]`, `SeedApplyReport` | `food_items`, `food_favorites` |

Ortak ilkeler:

1. **Snapshot = tarih**. `meal_entries.*_snapshot` kolonları giriş anındaki değeri saklar (03 §1.9 yorumu: "sonradan besin düzenlense de geçmiş değişmez"). Besin veya tarif düzenlemesi geçmiş satırlara **hiçbir zaman** yansımaz.
2. **Tam hassasiyetle hesapla, sınırda yuvarla.** Yuvarlama yalnızca (a) `meal_entries` snapshot'ı yazılırken ve (b) ekranda gösterirken uygulanır; ara sonuçlar (toplam, per-100g) yuvarlanmaz.
3. **Bilinmeyen = `null`** (R119.3). Fiber'ı `NULL` olan bir malzeme varsa tarifin fiber'ı `null`dır, `0` değil.
4. **Sahte kesinlik yok** (R123.4). Adherence yüzdeleri "hedef (tahmin)" etiketiyle sunulur; log'suz gün "%0" değil "kayıt yok"tur.
5. **İdempotent komutlar** (R117): kopyalama/giriş komutları `commandId` taşır; `command_log` çakışmasında hiçbir yazma yapılmaz ve `duplicate: true` döner.

### 10.2 TypeScript arayüzleri ve sözde kod

#### 10.2.1 Ortak tipler ve yuvarlama

```ts
// src/domain/nutrition/types.ts
export type FoodSource  = 'seed:usda' | 'seed:tr-label' | 'user' | 'label-override';   // food_items.source
export type ServingUnit = 'g' | 'ml' | 'piece' | 'scoop' | 'slice';                     // food_items.serving_unit
export type MealSlot    = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'preWorkout' | 'postWorkout';

export interface Per100g { kcal: number; protein: number; carb: number; fat: number; fiber: number | null; } // 02 §10

export interface FoodItem {
  id: string; name: string; brand: string | null;
  source: FoodSource; servingUnit: ServingUnit; servingSizeG: number | null;   // servingSizeG: 1 servingUnit kaç gram
  per100g: Per100g;
  lastUpdated: string;          // food_items.last_updated (ISO-8601 UTC)
  customEdited: boolean; seedVersion: number | null; isDeleted: boolean;
}

export interface Macros { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG: number | null; }

export interface Recipe {
  id: string; name: string; cookedYieldG: number | null; note: string | null;
  isDeleted: boolean; updatedAtUtc: string;
  ingredients: Array<{ id: string; foodId: string; grams: number; orderIndex: number }>;
}

/** meal_entries CHECK ((food_id IS NULL) <> (recipe_id IS NULL)) karşılığı */
export type EntryRef = { foodId: string; recipeId?: never } | { recipeId: string; foodId?: never };

// Yuvarlama (tek yer): gram cinsinden makrolar 1 ondalık, kcal tam sayı; negatif değer olmadığı için "yarım yukarı".
export const round1    = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;
export const roundKcal = (x: number): number => Math.round(x + Number.EPSILON);
export function roundMacros(m: Macros): Macros {
  return { kcal: roundKcal(m.kcal), proteinG: round1(m.proteinG), carbG: round1(m.carbG), fatG: round1(m.fatG),
           fiberG: m.fiberG === null ? null : round1(m.fiberG) };
}
export function scale(m: Macros, k: number): Macros {
  return { kcal: m.kcal * k, proteinG: m.proteinG * k, carbG: m.carbG * k, fatG: m.fatG * k,
           fiberG: m.fiberG === null ? null : m.fiberG * k };
}
export const per100gToMacros = (p: Per100g): Macros =>
  ({ kcal: p.kcal, proteinG: p.protein, carbG: p.carb, fatG: p.fat, fiberG: p.fiber });

export class NutritionError extends Error {                     // 02 §15 hata taksonomisine 'domain' sınıfı olarak bağlanır
  constructor(public readonly code: NutritionErrorCode, public readonly detail: Record<string, unknown> = {}) { super(code); }
}
export type NutritionErrorCode =
  | 'recipeEmpty' | 'ingredientFoodMissing' | 'invalidGrams' | 'foodNotFound' | 'recipeNotFound'
  | 'mealLogNotFound' | 'savedMealNotFound' | 'notInSeed' | 'foodDeleted' | 'macroSumExceeds100' | 'servingSizeRequired';
```

IEEE-754 notu: `Math.round` tam `.x5` sınırında ikili gösterime bağlı olarak nadiren "aşağı" yuvarlayabilir (örn. `1.005 → 1.0`, ki ondalık olarak da doğrudur). Makro bağlamında etkisi ≤ 0.1 g'dır; test vektörleri (10.5, TV-5) davranışı sabitler.

#### 10.2.2 `RecipeBuilder`

```ts
export type RecipeWarning =
  | 'cookedYieldMissing'      // R110.5: cooked_yield_g NULL → ham toplam kullanıldı
  | 'fiberUnknown'            // en az bir malzemede fiber_g_per_100g NULL → fiberG = null
  | 'ingredientFoodDeleted'   // is_deleted = 1 besin; hesap yine yapılır
  | 'yieldImplausible'        // cookedYieldG < 0.25·rawTotalG veya > 4·rawTotalG (sezgisel eşik, bkz. açık noktalar)
  | 'portionExceedsBasis';    // portionG > basisG (birden fazla parti olabilir; engellenmez)

export interface RecipeNutrition {
  recipeId: string;
  rawTotalG: number;                       // Σ ingredients.grams
  basis: 'cookedYield' | 'rawTotal';       // R110.4 / R110.5
  basisG: number;                          // cookedYieldG ?? rawTotalG
  total: Macros;                           // TAM hassasiyet
  per100g: Macros;                         // TAM hassasiyet: total × 100 / basisG
  warnings: RecipeWarning[];
}

export interface PortionNutrition {
  recipeId: string; portionG: number; basis: 'cookedYield' | 'rawTotal';
  macros: Macros;                          // YUVARLANMIŞ (roundMacros)
  warnings: RecipeWarning[];
}

export class RecipeBuilder {
  constructor(private readonly recipes: RecipeRepository, private readonly foods: FoodRepository, private readonly clock: Clock) {}

  /** Saf: DB'ye dokunmaz. `foods` haritası tüm ingredient foodId'lerini içermeli. */
  static compute(recipe: Recipe, foods: ReadonlyMap<string, FoodItem>): RecipeNutrition {
    if (recipe.ingredients.length === 0) throw new NutritionError('recipeEmpty', { recipeId: recipe.id });
    const warnings = new Set<RecipeWarning>();
    const total: Macros = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
    let rawTotalG = 0, fiberKnown = true;
    for (const ing of recipe.ingredients) {                       // order_index sırası; toplam sıradan bağımsız
      const f = foods.get(ing.foodId);
      if (!f) throw new NutritionError('ingredientFoodMissing', { recipeId: recipe.id, foodId: ing.foodId });
      if (f.isDeleted) warnings.add('ingredientFoodDeleted');
      const k = ing.grams / 100;                                   // recipe_ingredients.grams CHECK (> 0)
      rawTotalG      += ing.grams;
      total.kcal     += f.per100g.kcal    * k;
      total.proteinG += f.per100g.protein * k;
      total.carbG    += f.per100g.carb    * k;
      total.fatG     += f.per100g.fat     * k;
      if (f.per100g.fiber === null) fiberKnown = false; else total.fiberG! += f.per100g.fiber * k;
    }
    if (!fiberKnown) { total.fiberG = null; warnings.add('fiberUnknown'); }

    const basis  = recipe.cookedYieldG !== null ? 'cookedYield' : 'rawTotal';
    const basisG = recipe.cookedYieldG ?? rawTotalG;               // recipes.cooked_yield_g CHECK (NULL OR > 0)
    if (basis === 'rawTotal') warnings.add('cookedYieldMissing');
    else if (basisG < 0.25 * rawTotalG || basisG > 4 * rawTotalG) warnings.add('yieldImplausible');

    return { recipeId: recipe.id, rawTotalG, basis, basisG, total, per100g: scale(total, 100 / basisG), warnings: [...warnings] };
  }

  /** Porsiyon: yuvarlanmış per100g'den DEĞİL, tam hassasiyetli total'dan (10.3.2). */
  static portion(n: RecipeNutrition, portionG: number): PortionNutrition {
    if (!Number.isFinite(portionG) || portionG <= 0) throw new NutritionError('invalidGrams', { grams: portionG });
    const warnings = [...n.warnings];
    if (portionG > n.basisG) warnings.push('portionExceedsBasis');
    return { recipeId: n.recipeId, portionG, basis: n.basis, macros: roundMacros(scale(n.total, portionG / n.basisG)), warnings };
  }

  /** Gösterim için: per100g yuvarlanmış kopya. Hesaplarda kullanılmaz. */
  static displayPer100g(n: RecipeNutrition): Macros { return roundMacros(n.per100g); }

  /** Kayıt (insert/update). Tek transaction; recipes UPSERT + recipe_ingredients tam yeniden yazım.
   *  İNVARİYANT: meal_entries'e yazmaz, okumaz (10.3.3). */
  async save(input: RecipeInput /* Zod: RecipeInputSchema */, tx: Tx): Promise<Recipe> {
    const now = this.clock.nowUtc().toISOString();
    const id = input.id ?? uuid();
    await this.recipes.upsert({ id, name: input.name, cookedYieldG: input.cookedYieldG ?? null, note: input.note ?? null, updatedAtUtc: now }, tx);
    await this.recipes.replaceIngredients(id, input.ingredients.map((i, orderIndex) => ({ id: uuid(), foodId: i.foodId, grams: i.grams, orderIndex })), tx);
    return this.recipes.getWithIngredients(id, tx);
  }
}

export const RecipeInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  cookedYieldG: z.number().positive().max(50_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  ingredients: z.array(z.object({ foodId: z.string().min(1), grams: z.number().positive().max(50_000) })).min(1).max(50),
});
```

#### 10.2.3 `MealLogService` — snapshot, gram düzenleme, günlük toplam

```ts
export interface DailyTotals { dateKey: string; kcal: number; proteinG: number; carbG: number; fatG: number; entryCount: number; mealLogCount: number; }
// Not: fiber snapshot kolonu yoktur (03 §1.9) → DailyTotals'ta fiber yok (bkz. açık noktalar).

export class MealLogService {
  constructor(private readonly meals: MealLogRepository, private readonly foods: FoodRepository,
              private readonly recipes: RecipeRepository, private readonly clock: Clock) {}

  /** Giriş anı snapshot'ı. Besin: per100g × grams/100. Tarif: RecipeBuilder.portion. Sonuç yuvarlanmıştır. */
  async snapshotFor(ref: EntryRef, grams: number, tx: Tx): Promise<{ macros: Macros; warnings: RecipeWarning[] }> {
    if (!Number.isFinite(grams) || grams <= 0) throw new NutritionError('invalidGrams', { grams });
    if (ref.foodId) {
      const f = await this.foods.get(ref.foodId, tx);
      if (!f) throw new NutritionError('foodNotFound', { foodId: ref.foodId });
      return { macros: roundMacros(scale(per100gToMacros(f.per100g), grams / 100)), warnings: f.isDeleted ? ['ingredientFoodDeleted'] : [] };
    }
    const r = await this.recipes.getWithIngredients(ref.recipeId, tx);
    if (!r) throw new NutritionError('recipeNotFound', { recipeId: ref.recipeId });
    const n = RecipeBuilder.compute(r, await this.foods.getMany(r.ingredients.map(i => i.foodId), tx));
    const p = RecipeBuilder.portion(n, grams);
    return { macros: p.macros, warnings: p.warnings };
  }

  /** servingUnit ≠ 'g' girişleri gramaja çevirir; entries her zaman gram saklar (meal_entries.grams). */
  toGrams(f: FoodItem, amount: number, unit: ServingUnit | 'g'): number {
    if (unit === 'g') return amount;
    if (unit !== f.servingUnit || f.servingSizeG === null) throw new NutritionError('servingSizeRequired', { foodId: f.id, unit });
    return amount * f.servingSizeG;
  }

  async addEntry(cmd: { commandId: string; dateKey: string; slot: MealSlot; ref: EntryRef; grams: number }, tx: Tx) {
    if (!(await this.meals.claimCommand(cmd.commandId, 'nutrition.addEntry', this.clock, tx))) return { duplicate: true as const };
    const mealLog = await this.openOrCreateMealLog(cmd.dateKey, cmd.slot, tx);            // 10.3.4 kural 1
    const { macros, warnings } = await this.snapshotFor(cmd.ref, cmd.grams, tx);
    const entryId = uuid();
    await this.meals.insertEntry({ id: entryId, mealLogId: mealLog.id, foodId: cmd.ref.foodId ?? null, recipeId: cmd.ref.recipeId ?? null,
      grams: cmd.grams, kcalSnapshot: macros.kcal, proteinGSnapshot: macros.proteinG, carbGSnapshot: macros.carbG, fatGSnapshot: macros.fatG,
      orderIndex: await this.meals.nextOrderIndex(mealLog.id, tx) }, tx);
    return { duplicate: false as const, entryId, mealLogId: mealLog.id, macros, warnings };
  }

  /** Gram değişikliği: snapshot ORANSAL ölçeklenir; katalog OKUNMAZ → giriş anındaki besin tabanı korunur. */
  async updateEntryGrams(entryId: string, newGrams: number, tx: Tx): Promise<Macros> {
    if (!Number.isFinite(newGrams) || newGrams <= 0) throw new NutritionError('invalidGrams', { grams: newGrams });
    const e = await this.meals.getEntry(entryId, tx);
    const k = newGrams / e.grams;
    const macros = roundMacros({ kcal: e.kcalSnapshot * k, proteinG: e.proteinGSnapshot * k, carbG: e.carbGSnapshot * k, fatG: e.fatGSnapshot * k, fiberG: null });
    await this.meals.updateEntry(entryId, { grams: newGrams, ...toSnapshotColumns(macros) }, tx);
    return macros;
  }

  /** Besin/tarif değişikliği = yeni giriş anlamına gelir → güncel katalogdan yeniden snapshot. */
  async replaceEntryRef(entryId: string, ref: EntryRef, grams: number, tx: Tx): Promise<Macros> {
    const { macros } = await this.snapshotFor(ref, grams, tx);
    await this.meals.updateEntry(entryId, { foodId: ref.foodId ?? null, recipeId: ref.recipeId ?? null, grams, ...toSnapshotColumns(macros) }, tx);
    return macros;
  }

  async dailyTotals(dateKey: string, tx?: Tx): Promise<DailyTotals> { return this.meals.sumSnapshots(dateKey, tx); }

  private async openOrCreateMealLog(dateKey: string, slot: MealSlot, tx: Tx) {
    const existing = await this.meals.latestMealLog(dateKey, slot, tx);                  // logged_at_utc DESC LIMIT 1
    if (existing) return existing;
    const row = { id: uuid(), localDateKey: dateKey, timeZone: this.clock.timeZone(), loggedAtUtc: this.clock.nowUtc().toISOString(),
                  mealSlot: slot, copiedFromId: null, note: null };
    await this.meals.insertMealLog(row, tx); return row;
  }
}
```

```sql
-- MealLogRepository.sumSnapshots(dateKey)
SELECT m.local_date_key AS date_key,
       COALESCE(SUM(e.kcal_snapshot), 0)      AS kcal,
       COALESCE(SUM(e.protein_g_snapshot), 0) AS protein_g,
       COALESCE(SUM(e.carb_g_snapshot), 0)    AS carb_g,
       COALESCE(SUM(e.fat_g_snapshot), 0)     AS fat_g,
       COUNT(e.id)                            AS entry_count,
       COUNT(DISTINCT m.id)                   AS meal_log_count
FROM meal_logs m LEFT JOIN meal_entries e ON e.meal_log_id = m.id
WHERE m.local_date_key = ?;
```

#### 10.2.4 `CopyService`

```ts
export interface CopyResult {
  commandId: string; duplicate: boolean;
  createdMealLogIds: string[]; copiedEntryCount: number;
  skippedSlots: MealSlot[];
  warnings: Array<{ code: 'sourceEmpty' | 'snapshotStale' | 'itemDeleted' | 'noCandidate'; refId?: string }>;
}

export class CopyService {
  constructor(private readonly meals: MealLogRepository, private readonly saved: SavedMealRepository,
              private readonly mealLog: MealLogService, private readonly foods: FoodRepository,
              private readonly recipes: RecipeRepository, private readonly clock: Clock, private readonly db: Db) {}

  /** Copy Yesterday (ve genel gün kopyası). Snapshot BİREBİR kopyalanır (10.3.4). */
  copyDay(cmd: { commandId: string; fromKey: string; toKey: string; skipNonEmptySlots?: boolean }): Promise<CopyResult> {
    const skip = cmd.skipNonEmptySlots ?? true;
    return this.db.withTransaction(async tx => {
      const res = this.empty(cmd.commandId);
      if (!(await this.meals.claimCommand(cmd.commandId, 'nutrition.copyDay', this.clock, tx))) return { ...res, duplicate: true };
      if (cmd.fromKey === cmd.toKey) return res;                                          // no-op, hata değil
      const sources = await this.meals.mealLogsWithEntries(cmd.fromKey, tx);              // slot, logged_at_utc sırası
      if (sources.every(s => s.entries.length === 0)) { res.warnings.push({ code: 'sourceEmpty' }); return res; }
      const nonEmptyTargetSlots = new Set(await this.meals.slotsWithEntries(cmd.toKey, tx));
      for (const src of sources) {
        if (src.entries.length === 0) continue;                                           // boş kaynak öğün kopyalanmaz
        if (skip && nonEmptyTargetSlots.has(src.mealSlot)) { if (!res.skippedSlots.includes(src.mealSlot)) res.skippedSlots.push(src.mealSlot); continue; }
        await this.cloneMealLog(src, cmd.toKey, src.mealSlot, res, tx);
      }
      return res;
    });
  }

  /** Copy Meal: tek öğün, slot değişebilir (lunch → dinner). */
  copyMeal(cmd: { commandId: string; mealLogId: string; toKey: string; slot: MealSlot }): Promise<CopyResult> {
    return this.db.withTransaction(async tx => {
      const res = this.empty(cmd.commandId);
      if (!(await this.meals.claimCommand(cmd.commandId, 'nutrition.copyMeal', this.clock, tx))) return { ...res, duplicate: true };
      const src = await this.meals.mealLogWithEntries(cmd.mealLogId, tx);
      if (!src) throw new NutritionError('mealLogNotFound', { mealLogId: cmd.mealLogId });
      if (src.entries.length === 0) { res.warnings.push({ code: 'sourceEmpty' }); return res; }
      await this.cloneMealLog(src, cmd.toKey, cmd.slot, res, tx);
      return res;
    });
  }

  /** Repeat Breakfast: son 7 günün aynı slot'undaki en yeni dolu öğün (02 §10). Bugün aday değildir. */
  async repeatSlotCandidates(slot: MealSlot, toKey = this.clock.todayKey(), days = 7): Promise<MealLogSummary[]> {
    return this.meals.mealLogsInRange(addDaysToKey(toKey, -days), addDaysToKey(toKey, -1), { slot, nonEmptyOnly: true, order: 'newestFirst' });
  }
  async repeatSlot(cmd: { commandId: string; slot: MealSlot; toKey?: string; sourceMealLogId?: string }): Promise<CopyResult> {
    const toKey = cmd.toKey ?? this.clock.todayKey();
    const sourceId = cmd.sourceMealLogId ?? (await this.repeatSlotCandidates(cmd.slot, toKey))[0]?.id;
    if (!sourceId) return { ...this.empty(cmd.commandId), warnings: [{ code: 'noCandidate' }] };
    return this.copyMeal({ commandId: cmd.commandId, mealLogId: sourceId, toKey, slot: cmd.slot });
  }

  /** Saved Meal: şablon kaydı — snapshot YOK (saved_meal_entries'te kolon yok), yalnızca ref + gram. */
  saveMeal(cmd: { commandId: string; mealLogId: string; name: string }): Promise<{ savedMealId: string; duplicate: boolean }> {
    return this.db.withTransaction(async tx => {
      if (!(await this.meals.claimCommand(cmd.commandId, 'nutrition.saveMeal', this.clock, tx))) return { savedMealId: '', duplicate: true };
      const src = await this.meals.mealLogWithEntries(cmd.mealLogId, tx);
      if (!src || src.entries.length === 0) throw new NutritionError('mealLogNotFound', { mealLogId: cmd.mealLogId });
      const id = uuid();
      await this.saved.insert({ id, name: cmd.name.trim(), createdAtUtc: this.clock.nowUtc().toISOString() }, tx);
      await this.saved.insertEntries(src.entries.map((e, orderIndex) => ({ id: uuid(), savedMealId: id, foodId: e.foodId, recipeId: e.recipeId, grams: e.grams, orderIndex })), tx);
      return { savedMealId: id, duplicate: false };
    });
  }

  /** Saved Meal uygulama: snapshot GÜNCEL katalog/tarif değerlerinden yeniden hesaplanır (10.3.4). */
  applySavedMeal(cmd: { commandId: string; savedMealId: string; toKey: string; slot: MealSlot }): Promise<CopyResult> {
    return this.db.withTransaction(async tx => {
      const res = this.empty(cmd.commandId);
      if (!(await this.meals.claimCommand(cmd.commandId, 'nutrition.applySavedMeal', this.clock, tx))) return { ...res, duplicate: true };
      const sm = await this.saved.getWithEntries(cmd.savedMealId, tx);
      if (!sm) throw new NutritionError('savedMealNotFound', { savedMealId: cmd.savedMealId });
      const mealLogId = uuid();
      await this.meals.insertMealLog({ id: mealLogId, localDateKey: cmd.toKey, timeZone: this.clock.timeZone(),
        loggedAtUtc: this.clock.nowUtc().toISOString(), mealSlot: cmd.slot, copiedFromId: null, note: null }, tx);   // saved meal bir meal_log değil → copied_from_id NULL
      let orderIndex = 0;
      for (const e of sm.entries) {
        const ref: EntryRef = e.foodId ? { foodId: e.foodId } : { recipeId: e.recipeId! };
        const { macros, warnings } = await this.mealLog.snapshotFor(ref, e.grams, tx);
        if (warnings.includes('ingredientFoodDeleted')) res.warnings.push({ code: 'itemDeleted', refId: e.foodId ?? e.recipeId! });
        await this.meals.insertEntry({ id: uuid(), mealLogId, foodId: e.foodId, recipeId: e.recipeId, grams: e.grams, ...toSnapshotColumns(macros), orderIndex: orderIndex++ }, tx);
        res.copiedEntryCount++;
      }
      res.createdMealLogIds.push(mealLogId);
      return res;
    });
  }

  /** Ortak klonlama: yeni meal_logs satırı + entries birebir (snapshot dahil). note kopyalanmaz (güne özgü). */
  private async cloneMealLog(src: MealLogWithEntries, toKey: string, slot: MealSlot, res: CopyResult, tx: Tx) {
    const id = uuid();
    await this.meals.insertMealLog({ id, localDateKey: toKey, timeZone: this.clock.timeZone(), loggedAtUtc: this.clock.nowUtc().toISOString(),
                                     mealSlot: slot, copiedFromId: src.id, note: null }, tx);
    let orderIndex = 0;
    for (const e of src.entries) {
      await this.meals.insertEntry({ id: uuid(), mealLogId: id, foodId: e.foodId, recipeId: e.recipeId, grams: e.grams,
        kcalSnapshot: e.kcalSnapshot, proteinGSnapshot: e.proteinGSnapshot, carbGSnapshot: e.carbGSnapshot, fatGSnapshot: e.fatGSnapshot,
        orderIndex: orderIndex++ }, tx);
      res.copiedEntryCount++;
      // Bilgilendirme: kaynak log'dan SONRA düzenlenmiş besin/tarif → kullanıcı isterse girişi replaceEntryRef ile tazeler.
      const updatedAt = e.foodId ? (await this.foods.get(e.foodId, tx))?.lastUpdated : (await this.recipes.get(e.recipeId!, tx))?.updatedAtUtc;
      if (updatedAt && updatedAt > src.loggedAtUtc) res.warnings.push({ code: 'snapshotStale', refId: e.foodId ?? e.recipeId! });
    }
    res.createdMealLogIds.push(id);
  }

  private empty(commandId: string): CopyResult { return { commandId, duplicate: false, createdMealLogIds: [], copiedEntryCount: 0, skippedSlots: [], warnings: [] }; }
}
```

`claimCommand(commandId, type, clock, tx)`: `INSERT OR IGNORE INTO command_log(command_id, command_type, executed_at_utc)`; `changes() === 0` ise `false` (R117, 03 §1.1). `addDaysToKey` `core/time` yardımcısıdır (02 §3).

**Snapshot: kopyala mı, yeniden hesapla mı? — Karar ve gerekçe**

| İşlem | Kaynak | Politika | Gerekçe |
|-------|--------|----------|---------|
| `copyDay`, `copyMeal`, `repeatSlot` | `meal_logs` + `meal_entries` (geçmiş) | **Snapshot birebir kopyalanır** | (1) "Dünkünü kopyala" = "dün ne yediysem aynısı"; kullanıcı gördüğü değerlerin aynısını bekler. (2) Deterministik ve hızlı: katalog okunmaz, silinmiş besin bile sorunsuz. (3) Snapshot ilkesiyle (madde 1) tutarlı: geçmiş kayıt geçmiş değerdir. (4) Katalog o günden beri değiştiyse `snapshotStale` uyarısı verilir; kullanıcı girişi `replaceEntryRef` ile bilinçli olarak tazeler (R121 — override her zaman mümkün). Alternatif (yeniden hesaplama) reddedildi: kopya ile kaynak farklı çıkar, kullanıcı "kopyaladım ama sayılar değişti" şaşkınlığı yaşar; ayrıca silinmiş besinlerde davranış belirsizleşir. |
| `applySavedMeal` | `saved_meal_entries` (şablon) | **Güncel katalog/tarif değerlerinden yeniden hesaplanır** | Şablonda snapshot kolonu yoktur (03 §1.9); şablon "bu besinlerden şu kadar" der, "şu makrolar" demez. Label override sonrası şablon otomatik olarak doğru değeri üretir. |

#### 10.2.5 `FoodCatalog` — favorites, recents, seed birleştirme, label override

```ts
export interface RecentItem { kind: 'food' | 'recipe'; id: string; name: string; useCount: number; lastUsedAtUtc: string; lastGrams: number; }

export interface SeedFood { id: string; name: string; brand?: string | null; source: 'seed:usda' | 'seed:tr-label';
                            servingUnit: ServingUnit; servingSizeG?: number | null; per100g: Per100g; }
export interface SeedApplyReport { seedVersion: number; inserted: number; updated: number; skippedCustomEdited: number;
                                   skippedUpToDate: number; skippedUserIdConflict: string[]; missingFromSeed: string[]; }

export class FoodCatalog {
  constructor(private readonly foods: FoodRepository, private readonly clock: Clock, private readonly db: Db,
              private readonly seedIndex: ReadonlyMap<string, SeedFood>, private readonly seedVersion: number) {}

  favorites(): Promise<FoodItem[]>                        // SQL aşağıda
  async toggleFavorite(foodId: string): Promise<boolean>  // var → DELETE, yok → INSERT(added_at_utc = now); yeni durum döner
  recents(opts: { days?: number; limit?: number; toKey?: string } = {}): Promise<RecentItem[]>  // days=30, limit=20

  /** Uygulama açılışında (migration sonrası) çağrılır; seedVersion değişmediyse tek sorguyla no-op. */
  applySeed(): Promise<SeedApplyReport> {
    return this.db.withTransaction(async tx => {
      const now = this.clock.nowUtc().toISOString(); const rep: SeedApplyReport = { seedVersion: this.seedVersion, inserted: 0, updated: 0, skippedCustomEdited: 0, skippedUpToDate: 0, skippedUserIdConflict: [], missingFromSeed: [] };
      for (const s of this.seedIndex.values()) {
        const row = await this.foods.get(s.id, tx);
        if (!row) { await this.foods.insert({ ...fromSeed(s), lastUpdated: now, customEdited: false, seedVersion: this.seedVersion, isDeleted: false }, tx); rep.inserted++; continue; }
        if (row.source === 'user')      { rep.skippedUserIdConflict.push(s.id); continue; }   // beklenmez; asla ezme
        if (row.customEdited)           { rep.skippedCustomEdited++; continue; }              // R111.3 — değer, source, seed_version dokunulmaz
        if ((row.seedVersion ?? 0) >= this.seedVersion) { rep.skippedUpToDate++; continue; } // idempotent
        await this.foods.update(s.id, { ...fromSeed(s), lastUpdated: now, seedVersion: this.seedVersion }, tx);   // is_deleted KORUNUR
        rep.updated++;
      }
      rep.missingFromSeed = await this.foods.idsWithSourceNotIn('seed:', [...this.seedIndex.keys()], tx);        // yalnızca rapor; satır silinmez
      return rep;
    });
  }

  /** Label override (R111.3). Yerinde düzenleme; id ve geçmiş korunur. */
  overrideLabel(cmd: { foodId: string; per100g: Per100g; servingUnit?: ServingUnit; servingSizeG?: number | null; brand?: string | null; name?: string })
    : Promise<{ food: FoodItem; warnings: Array<'kcalMismatch'> }> {
    return this.db.withTransaction(async tx => {
      const row = await this.foods.get(cmd.foodId, tx);
      if (!row) throw new NutritionError('foodNotFound', { foodId: cmd.foodId });
      if (row.isDeleted) throw new NutritionError('foodDeleted', { foodId: cmd.foodId });
      const p = Per100gSchema.parse(cmd.per100g);                                        // ≥ 0, sonlu; fiber nullable
      if (p.protein + p.carb + p.fat > 100 + 1) throw new NutritionError('macroSumExceeds100', { sum: p.protein + p.carb + p.fat });  // 1 g tolerans
      const warnings: Array<'kcalMismatch'> = [];
      const atwater = 4 * p.protein + 4 * p.carb + 9 * p.fat;                             // kaba tahmin; yalnızca uyarı
      if (Math.abs(p.kcal - atwater) > Math.max(30, 0.25 * atwater)) warnings.push('kcalMismatch');
      const isUser = row.source === 'user';
      await this.foods.update(row.id, { per100g: p, servingUnit: cmd.servingUnit ?? row.servingUnit, servingSizeG: cmd.servingSizeG === undefined ? row.servingSizeG : cmd.servingSizeG,
        brand: cmd.brand === undefined ? row.brand : cmd.brand, name: cmd.name ?? row.name,
        source: isUser ? 'user' : 'label-override', customEdited: !isUser, lastUpdated: this.clock.nowUtc().toISOString() /* seedVersion değişmez */ }, tx);
      return { food: (await this.foods.get(row.id, tx))!, warnings };
    });
  }

  /** Override'ı geri al: seed'deki güncel değerlere dön. */
  revertToSeed(foodId: string): Promise<FoodItem> {
    return this.db.withTransaction(async tx => {
      const s = this.seedIndex.get(foodId);
      if (!s) throw new NutritionError('notInSeed', { foodId });
      await this.foods.update(foodId, { ...fromSeed(s), customEdited: false, seedVersion: this.seedVersion, lastUpdated: this.clock.nowUtc().toISOString() }, tx);
      return (await this.foods.get(foodId, tx))!;
    });
  }

  createUserFood(input: UserFoodInput): Promise<FoodItem>   // source='user', custom_edited=0, seed_version=NULL, id=uuid
  softDelete(foodId: string): Promise<void>                 // is_deleted=1; geçmiş ve tarifler FK ile kalır
  /** UI rozeti "seed'de yeni değer var": custom_edited=1 AND seed_version < FoodCatalog.seedVersion AND id ∈ seedIndex */
  hasNewerSeedValue(f: FoodItem): boolean { return f.customEdited && this.seedIndex.has(f.id) && (f.seedVersion ?? 0) < this.seedVersion; }
}
```

```sql
-- favorites(): food_favorites yalnızca food_items'a bağlıdır (tarif favorisi yok, bkz. açık noktalar)
SELECT f.* FROM food_favorites fav JOIN food_items f ON f.id = fav.food_id
WHERE f.is_deleted = 0
ORDER BY fav.added_at_utc DESC;

-- recents(days=30, limit=20, toKey=today): besin VE tarif; sıklık, sonra en son kullanım, sonra id (kararlı sıra)
WITH used AS (
  SELECT CASE WHEN e.food_id IS NOT NULL THEN 'food' ELSE 'recipe' END AS kind,
         COALESCE(e.food_id, e.recipe_id) AS item_id, e.grams, m.logged_at_utc
  FROM meal_entries e JOIN meal_logs m ON m.id = e.meal_log_id
  WHERE m.local_date_key BETWEEN :fromKey AND :toKey                      -- fromKey = addDaysToKey(toKey, -30)
)
SELECT u.kind, u.item_id, COUNT(*) AS use_count, MAX(u.logged_at_utc) AS last_used_at_utc,
       (SELECT grams FROM used u2 WHERE u2.kind = u.kind AND u2.item_id = u.item_id ORDER BY u2.logged_at_utc DESC LIMIT 1) AS last_grams,
       COALESCE(f.name, r.name) AS name
FROM used u
LEFT JOIN food_items f ON u.kind = 'food'   AND f.id = u.item_id
LEFT JOIN recipes    r ON u.kind = 'recipe' AND r.id = u.item_id
WHERE COALESCE(f.is_deleted, r.is_deleted, 1) = 0
GROUP BY u.kind, u.item_id
ORDER BY use_count DESC, last_used_at_utc DESC, u.item_id ASC
LIMIT :limit;
```

#### 10.2.6 `nutrition_targets` ve günlük adherence (plateau checklist + guardrails girdisi)

```ts
export interface NutritionTarget { id: string; effectiveFromDateKey: string; kcal: number; proteinG: number; carbG: number | null; fatG: number | null; rationaleTr: string | null; }

export interface DailyAdherence {
  dateKey: string;
  target: NutritionTarget | null;              // effective_from_date_key ≤ dateKey olan en yeni satır
  logged: boolean;                             // entryCount > 0
  consumed: DailyTotals;
  ratio: { kcal: number | null; proteinG: number | null; carbG: number | null; fatG: number | null };   // consumed/target; null = hedef yok/0 veya log yok
  targetIsEstimate: true;                      // R123.4: kalori hedefi tahmindir
}

export interface AdherenceWindow {
  fromKey: string; toKey: string; days: DailyAdherence[];
  daysLogged: number; daysUnlogged: number;
  kcalMeanRatio: number | null; proteinMeanRatio: number | null;   // yalnızca logged günler; daysLogged < MIN_LOGGED_DAYS → null
  kcalDaysInBand: number;                      // |ratio − 1| ≤ KCAL_BAND
  proteinDaysMet: number;                      // ratio ≥ PROTEIN_MIN
  status: 'ok' | 'lowProtein' | 'lowKcal' | 'highKcal' | 'insufficientData' | 'noTarget';
  targetIsEstimate: true;
}

// Eşikler (spec'te yok; sezgisel, ayarlanabilir sabitler — bkz. açık noktalar)
export const KCAL_BAND = 0.10, PROTEIN_MIN = 0.90, MIN_LOGGED_DAYS = 4;

export class MealLogService {  // (devam)
  async dailyAdherence(dateKey: string, tx?: Tx): Promise<DailyAdherence> {
    const target = await this.meals.targetFor(dateKey, tx);      // SQL aşağıda
    const consumed = await this.dailyTotals(dateKey, tx);
    const logged = consumed.entryCount > 0;
    const r = (c: number, t: number | null | undefined) => (!logged || !target || !t || t <= 0) ? null : c / t;
    return { dateKey, target, logged, consumed,
      ratio: { kcal: r(consumed.kcal, target?.kcal), proteinG: r(consumed.proteinG, target?.proteinG), carbG: r(consumed.carbG, target?.carbG), fatG: r(consumed.fatG, target?.fatG) },
      targetIsEstimate: true };
  }

  /** Plateau checklist madde 3 (R104.4) ve guardrails recovery bağlamı (R105.3) bunu tüketir; window = son 7 gün. */
  async adherenceWindow(toKey: string, days = 7): Promise<AdherenceWindow> {
    const fromKey = addDaysToKey(toKey, -(days - 1));
    const list: DailyAdherence[] = []; for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) list.push(await this.dailyAdherence(k));
    const logged = list.filter(d => d.logged && d.ratio.kcal !== null && d.ratio.proteinG !== null);
    const w: AdherenceWindow = { fromKey, toKey, days: list, daysLogged: list.filter(d => d.logged).length, daysUnlogged: list.filter(d => !d.logged).length,
      kcalMeanRatio: null, proteinMeanRatio: null, kcalDaysInBand: 0, proteinDaysMet: 0, status: 'ok', targetIsEstimate: true };
    if (list.every(d => d.target === null)) { w.status = 'noTarget'; return w; }
    if (logged.length < MIN_LOGGED_DAYS)     { w.status = 'insufficientData'; return w; }
    w.kcalMeanRatio    = mean(logged.map(d => d.ratio.kcal!));
    w.proteinMeanRatio = mean(logged.map(d => d.ratio.proteinG!));
    w.kcalDaysInBand   = logged.filter(d => Math.abs(d.ratio.kcal! - 1) <= KCAL_BAND).length;
    w.proteinDaysMet   = logged.filter(d => d.ratio.proteinG! >= PROTEIN_MIN).length;
    w.status = w.proteinMeanRatio < PROTEIN_MIN ? 'lowProtein'
             : w.kcalMeanRatio < 1 - KCAL_BAND  ? 'lowKcal'
             : w.kcalMeanRatio > 1 + KCAL_BAND  ? 'highKcal' : 'ok';
    return w;
  }
}
```

```sql
-- targetFor(dateKey): aynı gün iki hedef varsa en son oluşturulan kazanır
SELECT * FROM nutrition_targets
WHERE effective_from_date_key <= ?
ORDER BY effective_from_date_key DESC, created_at_utc DESC
LIMIT 1;
```

Plateau checklist metni (R104.4 madde 3, R122): `"Son 7 günde 5 gün beslenme kaydı var; protein ort. hedefin %96'sı, kalori ort. %99'u (hedef tahmini)."` — `insufficientData` ise `"Son 7 günde yalnızca 2 gün kayıt var; beslenme uyumu değerlendirilemiyor."` (yüzde gösterilmez). `evidence.metrics` alanına `{ daysLogged, kcalMeanRatio, proteinMeanRatio }` yazılır.

### 10.3 Kural / geçiş tabloları

#### 10.3.1 Tarif hesap tabanı (R110.2–R110.5)

| `recipes.cooked_yield_g` | `basis` | `basisG` | per100g | Porsiyon `portionG` | Kullanıcıya |
|---|---|---|---|---|---|
| `> 0` | `cookedYield` | `cooked_yield_g` | `total × 100 / cooked_yield_g` | `total × portionG / cooked_yield_g` | Normal; `yieldImplausible` ise "Pişmiş ağırlık ham toplamdan çok farklı, kontrol et." |
| `NULL` | `rawTotal` | `Σ grams` | `total × 100 / Σ grams` | `total × portionG / Σ grams` | **Zorunlu not** (R110.5): "Pişmiş ağırlık girilmedi; ham toplam (820 g) kullanılıyor." |

#### 10.3.2 Yuvarlama noktaları

| Aşama | Yuvarlama | Neden |
|-------|-----------|-------|
| Malzeme katkıları, `total`, `per100g` | **Yok** (double) | Porsiyon ve toplamların doğruluğu |
| `PortionNutrition.macros`, `snapshotFor` sonucu | `roundKcal` / `round1` | Snapshot'a yazılan = ekranda görülen |
| `meal_entries.*_snapshot` | Yuvarlanmış değer saklanır | Girişlerin gösterimi ile günlük toplam **tam olarak** tutar (Σ gösterilen = gösterilen Σ); ondalık altı hassasiyet zaten sahte kesinliktir (R123) |
| `dailyTotals` | Yuvarlanmış snapshot'ların toplamı, tekrar yuvarlanmaz (kcal zaten tam sayı, gramlar 1 ondalık; float toplamı gösterimde `round1`) | — |
| Ekran per100g | `displayPer100g` | Yalnızca gösterim; porsiyon hesabında **kullanılmaz** (TV-4: fark 1 kcal / 0.2 g) |

#### 10.3.3 Tarif düzenlendiğinde geçmişin korunması

| Olay | `recipes` / `recipe_ingredients` | Mevcut `meal_entries` (recipe_id = bu tarif) | Yeni girişler |
|------|------|------|------|
| Malzeme/gram/`cooked_yield_g` değişti (`RecipeBuilder.save`) | Güncellenir, `updated_at_utc = now` | **Değişmez** (snapshot) | Yeni değerlerle hesaplanır |
| Tarif soft delete (`is_deleted = 1`) | İşaretlenir | Değişmez; FK geçerli (`ON DELETE RESTRICT`) | Aramada görünmez; saved meal'den uygulanırsa hesaplanır + `itemDeleted` |
| Geçmiş girişin gramı düzenlendi (`updateEntryGrams`) | — | Snapshot **oransal** ölçeklenir, katalog okunmaz | — |
| Geçmiş girişin tarifi/besini değiştirildi (`replaceEntryRef`) | — | Güncel değerlerle yeniden snapshot (bilinçli kullanıcı eylemi) | — |
| Kopyalama (`copyDay/copyMeal/repeatSlot`) | — | Kaynak dokunulmaz; hedefe birebir kopya | — |

Hard delete yolu yoktur: `recipes` satırı `meal_entries`/`saved_meal_entries` tarafından referanslanırken silinemez (FK RESTRICT); UI yalnızca soft delete sunar.

#### 10.3.4 Kopyalama semantiği

| İşlem | Kaynak | Hedef `meal_logs` satırı | `copied_from_id` | Snapshot | Çakışma / boş kaynak |
|-------|--------|--------------------------|------------------|----------|----------------------|
| `copyDay(from, to)` | `from` günündeki dolu öğünler | Her kaynak öğün için **yeni** satır (`local_date_key = to`, aynı `meal_slot`, `time_zone = clock.timeZone()`, `logged_at_utc = now`) | kaynak `meal_logs.id` | Kopya | `skipNonEmptySlots=true` (varsayılan): hedefte dolu slot atlanır → `skippedSlots`; UI "Boş öğünlere kopyala / Hepsini ekle / İptal" sorar. Boş kaynak öğün kopyalanmaz; hiç dolu öğün yoksa `sourceEmpty`. `from === to` → no-op. |
| `copyMeal(id, to, slot)` | Tek öğün | Yeni satır; `slot` kaynaktan farklı olabilir | kaynak id | Kopya | Kaynak boşsa `sourceEmpty`, yazma yok |
| `repeatSlot(slot)` | `[to−7, to−1]` aralığında aynı `meal_slot`'taki en yeni dolu öğün (bugün hariç) | `copyMeal` ile aynı | kaynak id | Kopya | Aday yoksa `noCandidate`; `sourceMealLogId` ile kullanıcı başka aday seçebilir |
| `saveMeal(id, name)` | Tek öğün | `saved_meals` + `saved_meal_entries` (ref + gram) | — | **Yok** | Boş öğün kaydedilemez (`mealLogNotFound`) |
| `applySavedMeal(id, to, slot)` | Şablon | Yeni satır | `NULL` (kaynak bir `meal_logs` değil) | **Yeniden hesap** | Silinmiş besin/tarif: hesaplanır + `itemDeleted` |

Kural 1 — **slot başına satır sayısı:** şema `(local_date_key, meal_slot)` için tekillik zorlamaz; kopya her zaman yeni `meal_logs` satırı açar, `addEntry` ise slot'taki en yeni satıra ekler. UI aynı günün aynı slot'undaki tüm satırları tek öğün olarak gruplar; `dailyTotals` tümünü toplar.
Kural 2 — **`note` kopyalanmaz** (güne özgü).
Kural 3 — **`copied_from_id` zinciri** doğrudan kaynağı gösterir (kök değil); köke ulaşmak için zincir izlenir.
Kural 4 — **Idempotency:** aynı `commandId` ile ikinci çağrı `duplicate: true`, sıfır yazma.

#### 10.3.5 `food_items.source` / `custom_edited` geçişleri (R111.2, R111.3)

| Olay | Önkoşul | `source` | `custom_edited` | `seed_version` | `last_updated` | Değerler | `is_deleted` |
|------|---------|----------|-----------------|----------------|----------------|----------|--------------|
| Seed ilk yükleme | satır yok | seed'deki (`seed:usda`/`seed:tr-label`) | 0 | S | now | seed | 0 |
| Seed güncelleme | `custom_edited=0`, `source ∈ seed:*`, `seed_version < S` | aynı | 0 | S | now | seed | **korunur** |
| Seed güncelleme | `custom_edited=1` | değişmez | 1 | **değişmez** (override'ın tabanı) | değişmez | **değişmez** | değişmez |
| Seed güncelleme | `seed_version ≥ S` | — | — | — | — | no-op | — |
| Seed güncelleme | `source='user'` (id çakışması) | değişmez | — | — | — | no-op + rapor | — |
| Seed'den çıkarılmış besin | satır var, seed'de yok | değişmez | değişmez | değişmez | değişmez | değişmez (silinmez; geçmiş referans eder) | değişmez |
| Label override | `source ∈ seed:*` | `label-override` | 1 | değişmez | now | kullanıcı | 0 (silinmişse hata) |
| Label override (tekrar) | `source='label-override'` | `label-override` | 1 | değişmez | now | kullanıcı | — |
| Kullanıcı düzenler | `source='user'` | `user` | 0 | NULL | now | kullanıcı | — |
| Geri al (`revertToSeed`) | seed'de var | seed'deki | 0 | S | now | seed (güncel) | değişmez |
| Geri al | seed'de yok | hata `notInSeed` | | | | | |
| Kullanıcı besini oluştur | — | `user` | 0 | NULL | now | kullanıcı | 0 |
| Soft delete | — | değişmez | değişmez | değişmez | now | değişmez | 1 |

`custom_edited` anlamı: "seed kökenli satır kullanıcı tarafından ayrıştırıldı → seed dokunmasın". `source='user'` satırlar için her zaman 0 (seed zaten dokunmaz). `source` ilk kökeni kaybeder (`seed:usda` → `label-override`); geri alma sırasında köken seed dosyasından (`SeedFood.source`) okunur.

#### 10.3.6 Adherence yorumu

| Durum | Koşul | Checklist / UI |
|-------|-------|----------------|
| `noTarget` | Pencerede hiçbir gün için `nutrition_targets` yok | "Beslenme hedefi tanımlı değil." — yüzde yok |
| `insufficientData` | logged gün < `MIN_LOGGED_DAYS` (4/7) | "Yeterli kayıt yok." — yüzde yok |
| `lowProtein` | `proteinMeanRatio < 0.90` | Plateau checklist'te öncelikli madde; öneri `nutritionAdjust` **değil** yalnızca bilgi (R104.3) |
| `lowKcal` / `highKcal` | `kcalMeanRatio < 0.90` / `> 1.10` | Bilgi; "hedef tahmini" etiketi |
| `ok` | aksi | — |

Log'suz gün ratio `null` → ortalamadan **dışlanır** (0 sayılmaz). Ratio üst sınırı yok (%110 gösterilir).

### 10.4 Sınır durumları ve hata durumları

| # | Durum | Davranış |
|---|-------|----------|
| E1 | Tarifte malzeme yok | `NutritionError('recipeEmpty')`; UI kaydetmeyi engeller (Zod `min(1)`) |
| E2 | Malzeme `food_items`'ta yok (hard delete/bozuk yedek) | `ingredientFoodMissing`; tarif ekranı "Eksik malzeme" satırı gösterir, hesap yapılmaz |
| E3 | Malzeme `is_deleted=1` | Hesap yapılır + `ingredientFoodDeleted`; aramada çıkmaz |
| E4 | `cooked_yield_g` NULL | `basis='rawTotal'` + `cookedYieldMissing` notu (R110.5) |
| E5 | `cooked_yield_g` ham toplamın 0.25×'inden az veya 4×'inden çok | Hesap yapılır + `yieldImplausible` (engellenmez, R121) |
| E6 | `cooked_yield_g ≤ 0`, `grams ≤ 0`, `portionG ≤ 0`, NaN/∞ | Zod/CHECK reddi, `invalidGrams` |
| E7 | `portionG > basisG` | Hesap yapılır + `portionExceedsBasis` (birden fazla parti olabilir) |
| E8 | Malzemede `fiber_g_per_100g` NULL | Tarif `fiberG = null` + `fiberUnknown`; UI "—" gösterir, `0 g` **değil** (R119.3) |
| E9 | Tarif içinde tarif | Desteklenmez (`recipe_ingredients.food_id` yalnızca besin) |
| E10 | `serving_unit ≠ 'g'` ve `serving_size_g` NULL | Yalnızca gram girişi; adet/ölçek girişi `servingSizeRequired` |
| E11 | `meal_entries.grams` çok büyük (>10 000 g) | Zod uyarı eşiği; CHECK yalnızca `> 0` (bkz. açık nokta) |
| E12 | `copyDay` hedef gün gelecekte | İzin verilir (öğün planı); UI bugün/dün'ü öne çıkarır |
| E13 | `copyDay` sırasında transaction hatası (disk dolu) | Tümü geri alınır; `DbWriteError` → "Kaydedilemedi" + aynı `commandId` ile yeniden dene (R117) |
| E14 | Kaynak entry'nin besini kopyadan önce label override edilmiş | Kopya eski snapshot'ı taşır + `snapshotStale(foodId)`; UI "X'in değerleri o günden beri değişti — güncelle?" |
| E15 | `repeatSlot` son 7 günde aday yok | `noCandidate`; UI "Son 7 günde kahvaltı kaydı yok" + "Daha eskiyi seç" |
| E16 | Saved meal'de tüm satırlar silinmiş besin | Hepsi hesaplanır + `itemDeleted` ×N; kullanıcı düzenleyebilir |
| E17 | `overrideLabel`: `protein+carb+fat > 101 g/100 g` | `macroSumExceeds100` (kaydedilmez) |
| E18 | `overrideLabel`: kcal ile Atwater tahmini arasında > max(30 kcal, %25) fark | Kaydedilir + `kcalMismatch` uyarısı ("Etiketi kontrol et") |
| E19 | `overrideLabel` silinmiş besin | `foodDeleted` |
| E20 | `revertToSeed` seed'de olmayan besin | `notInSeed`; UI seçeneği gri |
| E21 | Seed dosyasında `id` çakışan `source='user'` satır | No-op + `skippedUserIdConflict` raporu (uuid vs slug; pratikte olmaz) |
| E22 | Seed sürümü geri gitti (`seedVersion < DB'deki`) | No-op (`skippedUpToDate`); downgrade yok |
| E23 | `nutrition_targets.protein_g = 0` | `ratio.proteinG = null` (bölme yok); UI "hedef girilmemiş" |
| E24 | Aynı `effective_from_date_key` ile iki hedef | `created_at_utc DESC` kazanır |
| E25 | Adherence: log var ama tüm girişler 0 kcal (örn. su) | `logged=true`, ratio 0 → düşük; yanlış pozitif kabul edilir, UI "eksik kayıt?" ipucu |
| E26 | Timezone değişimi sonrası `copyDay('dün')` | "Dün" = `addDaysToKey(clock.todayKey(), -1)`; kayıtlar `local_date_key` ile eşleşir, UTC aralığı kullanılmaz (R112.2, R112.4) |
| E27 | Recents: aynı sayı ve aynı son kullanım | `item_id ASC` ile kararlı sıra |
| E28 | Favorite olan besin soft delete | Listede çıkmaz; `food_favorites` satırı kalır (geri alınırsa tekrar görünür) |

### 10.5 Test vektörleri

Seed fixture (**örnek** değerler; `data/foods.seed.json` farklı olabilir — testler bu fixture'ı kullanır, gerçek seed'e bağlı değildir):

| `food_items.id` | `source` | `kcal_per_100g` | `protein_g_per_100g` | `carb_g_per_100g` | `fat_g_per_100g` | `fiber_g_per_100g` |
|---|---|---|---|---|---|---|
| `chicken-breast-raw` | `seed:usda` | 120 | 22.5 | 0 | 2.6 | 0 |
| `rice-white-raw` | `seed:usda` | 365 | 7.1 | 80.0 | 0.7 | 1.3 |
| `sunflower-oil` | `seed:usda` | 884 | 0 | 0 | 100 | 0 |
| `yogurt-plain` | `seed:tr-label` | 61 | 3.5 | 4.7 | 3.3 | 0 |

**TV-1 — Tavuklu Pilav, malzeme katkıları** (`RecipeBuilder.compute`, tam hassasiyet)

| Malzeme | g | kcal | protein | carb | fat | fiber |
|---|---|---|---|---|---|---|
| chicken-breast-raw | 500 | 600.0 | 112.5 | 0 | 13.0 | 0 |
| rice-white-raw | 300 | 1095.0 | 21.3 | 240.0 | 2.1 | 3.9 |
| sunflower-oil | 20 | 176.8 | 0 | 0 | 20.0 | 0 |
| **`total`** (`rawTotalG` = 820) | | **1871.8** | **133.8** | **240.0** | **35.1** | **3.9** |

**TV-2 — per-100g ve porsiyon**

| Girdi | `basis` / `basisG` | `per100g` (tam) | `displayPer100g` | Porsiyon 350 g (`PortionNutrition.macros`) | `warnings` |
|---|---|---|---|---|---|
| `cooked_yield_g = 1050` | `cookedYield` / 1050 | 178.267 / 12.743 / 22.857 / 3.343 / 0.371 | **178 kcal / 12.7 P / 22.9 C / 3.3 F / 0.4 fiber** | **624 kcal / 44.6 P / 80.0 C / 11.7 F / 1.3 fiber** | `[]` |
| `cooked_yield_g = NULL` | `rawTotal` / 820 | 228.268 / 16.317 / 29.268 / 4.280 / 0.476 | 228 / 16.3 / 29.3 / 4.3 / 0.5 | 799 / 57.1 / 102.4 / 15.0 / 1.7 | `['cookedYieldMissing']` |
| `cooked_yield_g = 1050`, porsiyon 1200 g | `cookedYield` / 1050 | (aynı) | (aynı) | 2139 / 152.9 / 274.3 / 40.1 / 4.5 | `['portionExceedsBasis']` |
| `cooked_yield_g = 150` | `cookedYield` / 150 | — | — | — | `['yieldImplausible']` (150 < 0.25 × 820 = 205) |
| `sunflower-oil.fiber = NULL` | `cookedYield` / 1050 | fiber `null` | fiber "—" | 624 / 44.6 / 80.0 / 11.7 / **null** | `['fiberUnknown']` |
| malzeme listesi boş | — | — | — | — | `NutritionError('recipeEmpty')` |
| porsiyon 0 / −5 / NaN | — | — | — | — | `NutritionError('invalidGrams')` |

**TV-3 — Yuvarlama sırası** (neden porsiyon tam hassasiyetten hesaplanır)

| Yöntem | 350 g porsiyon | Sonuç |
|---|---|---|
| `roundMacros(total × 350/1050)` (**kural**) | 623.933 → 624; 44.600 → 44.6; 80.000 → 80.0; 11.700 → 11.7 | **624 / 44.6 / 80.0 / 11.7** |
| `displayPer100g × 3.5` (yanlış) | 178 × 3.5 = 623; 12.7 × 3.5 = 44.45 → 44.4; 22.9 × 3.5 = 80.15 → 80.1; 3.3 × 3.5 = 11.55 → 11.5 | 623 / 44.4 / 80.1 / 11.5 (−1 kcal, −0.2 g P) |

**TV-4 — `round1` / `roundKcal`**

| x | `round1(x)` | `roundKcal(x)` |
|---|---|---|
| 12.25 | 12.3 | 12 |
| 12.35 | 12.4 | 12 |
| 0.05 | 0.1 | 0 |
| 0.04 | 0.0 | 0 |
| 2.675 | 2.7 | 3 |
| 1.005 | 1.0 | 1 |
| 623.9333 | 623.9 | 624 |
| 623.5 | 623.5 | 624 |
| 624.4999 | 624.5 | 624 |
| 22.857142857 | 22.9 | 23 |

**TV-5 — Snapshot koruma (tarif düzenleme)**

| Adım | İşlem | `meal_entries` (Day 1, 350 g) | Yeni giriş (350 g) |
|---|---|---|---|
| 1 | Day 1: Tavuklu Pilav 350 g logla | 624 / 44.6 / 80.0 / 11.7 | — |
| 2 | Day 2: `RecipeBuilder.save` — yağ 20 → 40 g, `cooked_yield_g` 1050 → 1070 (`total` = 2048.6 / 133.8 / 240.0 / 55.1; `rawTotalG` 840) | **değişmez**: 624 / 44.6 / 80.0 / 11.7 | — |
| 3 | Day 3: 350 g logla | (değişmez) | **670 / 43.8 / 78.5 / 18.0** |
| 4 | Day 1 girişinin gramı 350 → 200 (`updateEntryGrams`) | 624×200/350 → **357 / 25.5 / 45.7 / 6.7** (katalog okunmadı; yeni tarifle hesaplansaydı 383 / 25.0 / 44.9 / 10.3 olurdu) | — |
| 5 | Tarif soft delete | değişmez | Aramada çıkmaz |

**TV-6 — Besin girişi ve birim çevirimi**

| Girdi | Beklenen snapshot |
|---|---|
| `chicken-breast-raw`, 150 g | 180 / 33.8 / 0.0 / 3.9 |
| `yogurt-plain`, 200 g (seed) | 122 / 7.0 / 9.4 / 6.6 |
| `serving_unit='scoop'`, `serving_size_g=30`, 2 scoop | `toGrams` → 60 g |
| `serving_unit='piece'`, `serving_size_g=NULL`, 2 piece | `servingSizeRequired` |
| 0 g | `invalidGrams` |

**TV-7 — CopyService** (bugün = `2026-09-04`)

| Senaryo | Girdi | Beklenen |
|---|---|---|
| Copy Yesterday, hedef boş | `copyDay('2026-09-03','2026-09-04')`; kaynak breakfast(2 entry), lunch(1), dinner(3), snack(0) | 3 yeni `meal_logs` (`local_date_key='2026-09-04'`, `copied_from_id` = kaynak id, `logged_at_utc` = now), 6 entry snapshot birebir; `skippedSlots=[]`; snack kopyalanmaz |
| Hedefte lunch dolu, varsayılan | aynı | 2 yeni satır (breakfast, dinner); `skippedSlots=['lunch']` |
| `skipNonEmptySlots=false` | aynı | 3 yeni satır; 09-04 lunch'ta 2 `meal_logs`; UI tek öğün olarak gösterir; `dailyTotals` 7 entry toplar |
| Kaynak gün boş | `copyDay('2026-08-20', …)` | `createdMealLogIds=[]`, `warnings=[sourceEmpty]` |
| `from === to` | `copyDay('2026-09-04','2026-09-04')` | no-op, uyarı yok |
| Aynı `commandId` ikinci kez | | `duplicate=true`, sıfır yazma (`command_log` PK) |
| Copy Meal, slot değişimi | `copyMeal(lunch@09-03, '2026-09-04', 'dinner')` | 1 satır `meal_slot='dinner'`, `copied_from_id` = lunch id |
| Kopyadan önce label override | 09-03 yoğurt 200 g (122/7.0/9.4/6.6); 09-04 sabah `overrideLabel(yogurt-plain, 66/4.0/4.5/3.8)`; sonra `copyDay` | Kopya **122 / 7.0 / 9.4 / 6.6** taşır + `snapshotStale(yogurt-plain)`; `replaceEntryRef` sonrası 132 / 8.0 / 9.0 / 7.6 |
| Repeat Breakfast | breakfast kayıtları: 09-04 (bugün), 09-02, 08-30, 08-27 | Aday sırası: 09-02, 08-30 (08-27 pencere dışı, 09-04 hariç); varsayılan 09-02 kopyalanır |
| Repeat Breakfast, aday yok | son breakfast 08-27 | `noCandidate`, yazma yok |
| Save Meal | `saveMeal(lunch@09-03, 'Öğle standart')` | 1 `saved_meals` + N `saved_meal_entries` (food/recipe id + grams, snapshot yok) |
| Apply Saved Meal (override sonrası) | şablon: yoğurt 200 g; besin artık 66/4.0/4.5/3.8 | Yeni entry **132 / 8.0 / 9.0 / 7.6** (güncel), `copied_from_id=NULL` |
| Apply Saved Meal, tarif silinmiş | şablon: Tavuklu Pilav (is_deleted=1) 350 g | Hesaplanır (624/…), `warnings=[itemDeleted(recipeId)]` |
| Boş öğünü kaydet | `saveMeal(snack@09-03 (0 entry))` | `mealLogNotFound` |

**TV-8 — Seed birleştirme** (`applySeed`, S = 3)

| DB satırı (öncesi) | Seed (S=3) | Sonuç |
|---|---|---|
| yok | `chicken-breast-raw` 120 kcal | INSERT `source='seed:usda'`, `custom_edited=0`, `seed_version=3` → `inserted` |
| `custom_edited=0`, `seed_version=2`, kcal 120 | kcal 123 | UPDATE kcal 123, `seed_version=3`, `last_updated=now` → `updated` |
| `custom_edited=1`, `source='label-override'`, `seed_version=2`, kcal 118 | kcal 123 | **değişmez**; `seed_version=2` kalır; `hasNewerSeedValue=true` (UI rozeti) → `skippedCustomEdited` |
| `custom_edited=0`, `seed_version=3` | aynı | no-op → `skippedUpToDate` |
| `custom_edited=0`, `is_deleted=1`, `seed_version=2` | kcal 123 | UPDATE değerler, `is_deleted=1` **korunur** |
| var, `source='seed:usda'` | seed'de yok | değişmez → `missingFromSeed=['…']` |
| `source='user'`, id çakışıyor | var | no-op → `skippedUserIdConflict` |
| İki kez çalıştırma | | ikinci çalıştırma: `inserted=0, updated=0` (idempotent) |

**TV-9 — Label override / geri alma**

| Girdi | Beklenen |
|---|---|
| `overrideLabel(yogurt-plain, {66, 4.0, 4.5, 3.8, fiber 0})` | `source='label-override'`, `custom_edited=1`, `seed_version` değişmez, `last_updated=now`; eski `meal_entries` değişmez; Atwater 68.2 ≈ 66 → uyarı yok |
| `{250, 4.0, 4.5, 3.8}` | Kaydedilir + `kcalMismatch` (|250 − 68.2| > max(30, 17.05)) |
| `{400, 60, 50, 10}` | `macroSumExceeds100` (120 > 101) |
| `{-5, …}` | Zod hatası |
| `revertToSeed(yogurt-plain)` (seed'de var, S=3) | `source='seed:tr-label'`, `custom_edited=0`, `seed_version=3`, değerler seed |
| `revertToSeed(user-food-uuid)` | `notInSeed` |
| `overrideLabel` üzerinde `source='user'` besin | `source='user'`, `custom_edited=0` |
| Override sonrası `applySeed` (S=4) | Satır atlanır (`skippedCustomEdited`) |

**TV-10 — Adherence** (`nutrition_targets`: `2026-09-01` → 2400 kcal / 190 g P; `2026-09-06` → 2300 / 185; `adherenceWindow('2026-09-07')`)

| Gün | Hedef | Tüketim kcal / P | `ratio.kcal` | `ratio.proteinG` | kcal bant (±10 %) | P ≥ 90 % |
|---|---|---|---|---|---|---|
| 09-01 | 2400/190 | 2310 / 178 | 0.9625 | 0.9368 | ✓ | ✓ |
| 09-02 | 2400/190 | 2650 / 205 | 1.1042 | 1.0789 | ✗ | ✓ |
| 09-03 | 2400/190 | 2150 / 160 | 0.8958 | 0.8421 | ✗ | ✗ |
| 09-04 | 2400/190 | kayıt yok | `null` | `null` | — | — |
| 09-05 | 2400/190 | 2400 / 190 | 1.0000 | 1.0000 | ✓ | ✓ |
| 09-06 | **2300/185** | 2280 / 172 | 0.9913 | 0.9297 | ✓ | ✓ |
| 09-07 | 2300/185 | kayıt yok | `null` | `null` | — | — |
| **Pencere** | | | `kcalMeanRatio` **0.9908** | `proteinMeanRatio` **0.9575** | `kcalDaysInBand` **3** | `proteinDaysMet` **4** |

`daysLogged=5`, `daysUnlogged=2`, `status='ok'`, `targetIsEstimate=true`. Diğer vektörler: yalnızca 09-05 ve 09-06 kayıtlı → `insufficientData`, ortalamalar `null`; hiç hedef yok → `noTarget`; `protein_g=0` → `ratio.proteinG=null`, gün protein ortalamasına girmez; 09-01..09-05 protein 150/gün → `proteinMeanRatio=0.789` → `lowProtein`.

**TV-11 — Recents / favorites** (bugün `2026-09-04`, pencere `2026-08-05..2026-09-04`)

| Kullanım (son 30 gün) | Beklenen `recents(limit=5)` sırası |
|---|---|
| chicken ×12 (son 09-03 12:00), rice ×12 (son 09-03 12:00), Tavuklu Pilav (recipe) ×8 (son 09-04), yogurt ×5 (son 09-04), oats ×5 (son 09-01), banana ×1 (08-01, pencere dışı), `deleted-bar` ×9 (`is_deleted=1`) | 1) chicken-breast-raw (12, id asc) 2) rice-white-raw (12) 3) Tavuklu Pilav [recipe] (8) 4) yogurt-plain (5, 09-04) 5) oats (5, 09-01); banana ve deleted-bar yok; her satırda `lastGrams` |
| `food_favorites`: yogurt (09-01), chicken (08-15), deleted-bar (08-20) | `favorites()` → yogurt, chicken (deleted-bar hariç) |
| `toggleFavorite(chicken)` ×2 | 1. çağrı → `false` (silindi), 2. çağrı → `true` (yeni `added_at_utc`) |

### 10.6 İlgili gereksinimler

| Gereksinim | Karşılayan öğe (bu bölüm) |
|---|---|
| R109.1 | `CopyService.copyDay` (Copy Yesterday), `copyMeal` (Copy Meal), `repeatSlot` (Repeat Breakfast), `saveMeal`/`applySavedMeal` (Saved Meal), `FoodCatalog.favorites` (Favorite Food), `FoodCatalog.recents` (Recent Food) |
| R109.2 | Tüm kopyalama işlemleri tek transaction, tek dokunuş; `snapshotStale` ile tazeleme isteğe bağlı |
| R110.1 | `RecipeBuilder.save`, `RecipeInputSchema` (malzeme + gram) |
| R110.2 | `RecipeBuilder.compute` → `total`, `per100g` |
| R110.3 | `recipes.cooked_yield_g`, `basis='cookedYield'` |
| R110.4 | `RecipeBuilder.portion` (`total × portionG / basisG`, tam hassasiyetten) |
| R110.5 | `basis='rawTotal'` + `cookedYieldMissing` zorunlu notu |
| R111.1 | Seed satırları `custom_edited`/`label-override` ile ayrıştırılabilir; `hasNewerSeedValue` rozeti; seed "tek gerçek" değil |
| R111.2 | `food_items.source`, `serving_unit` (+`serving_size_g`), `last_updated`, `custom_edited` alanları ve `FoodItem` tipi |
| R111.3 | `overrideLabel` (yerinde, `custom_edited=1`), `applySeed` atlama kuralı, `revertToSeed` |
| R104.4 (madde 3) | `MealLogService.adherenceWindow` → plateau checklist `adherence` maddesi |
| R105.3 | `AdherenceWindow` guardrails recovery bağlamına girdi (bkz. açık nokta) |
| R112.2, R112.4 | Tüm gün sorguları `local_date_key`; kopyalarda `time_zone = clock.timeZone()` |
| R117 | `commandId` + `command_log` idempotency; `NutritionError` → Türkçe mesaj haritası |
| R119.3 | Fiber `null`; adherence log'suz gün `null` |
| R121 | Uyarılar (`yieldImplausible`, `portionExceedsBasis`, `kcalMismatch`) engellemez |
| R122 | Adherence checklist metni kanıt metrikleriyle (`daysLogged`, oranlar) |
| R123.1–R123.4 | Yuvarlama sınırda; `targetIsEstimate`; `insufficientData`'da yüzde gösterilmez |
| R95.1 | `recipes`, `recipe_ingredients`, `saved_meals`, `food_items` özelleştirmeleri `TableRegistry` üzerinden yedeğe girer |

### Tutarsızlık / açık nokta

- **02 §10 `MealLog.entries[{…, grams|servings}]` vs 03 `meal_entries.grams`:** şemada yalnızca `grams` var, `servings` kolonu yok. Bu belge girişleri her zaman gram olarak saklar ve `servingUnit ≠ 'g'` girişlerini `toGrams` ile çevirir; kullanıcının girdiği "2 scoop" bilgisi kaybolur. Karar: 02'deki `servings` ifadesini kaldırmak ya da ileride `meal_entries.amount`/`amount_unit` kolonu eklemek (migration).
- **`meal_entries`'te fiber snapshot yok** (02 §10 `per100g` fiber içerir, 03 §1.9 `fiber_g_snapshot` yok). Günlük fiber toplamı geçmişten güvenilir türetilemez; `DailyTotals` fiber içermez. Fiber istenirse `fiber_g_snapshot REAL` (nullable) kolonu için migration gerekir.
- **`saved_meals` kaynağı için provenance yok:** `meal_logs.copied_from_id` yalnızca `meal_logs`'a referans verir; saved meal'den üretilen öğünde kaynak (`saved_meal_id`) saklanamaz → `NULL`. Gerekirse `meal_logs.saved_meal_id TEXT REFERENCES saved_meals(id)` kolonu.
- **`food_favorites` yalnızca `food_items`'a bağlı:** tarifler favorilenemez (R109.1 "Favorite Food" için yeterli; UX açısından tarif favorisi istenirse `recipe_id` eklenmeli). `recents` ise tarifleri de kapsar (`meal_entries.recipe_id` üzerinden).
- **`(local_date_key, meal_slot)` tekilliği şemada yok:** bu belge çoklu satıra izin verir ve UI'da gruplar. Alternatif (tek satır + kopyada entry ekleme) `copied_from_id` semantiğini bozacağı için seçilmedi; 02/03'te açıkça karara bağlanmalı.
- **`food_items.last_updated` adlandırması** 03 §0 kuralına (`*_at_utc`) uymuyor (R111.2'deki `lastUpdated` adını doğrudan taşıyor). Bu belge kolonu olduğu gibi kullanır; içerik ISO-8601 UTC varsayılır.
- **`serving_size_g` semantiği `ml` için tanımsız:** bu belge "1 `serving_unit` = `serving_size_g` gram" (ml için yoğunluk) kabul eder; 03'te açıklama yok.
- **Yeni türetilmiş isimler** (02/03'te yok; mevcut isimlerden türetildi): `RecipeBuilder.compute/portion/displayPer100g/save`, `MealLogService.snapshotFor/addEntry/updateEntryGrams/replaceEntryRef/dailyTotals/dailyAdherence/adherenceWindow/toGrams`, `CopyService.repeatSlotCandidates/saveMeal/applySavedMeal`, `FoodCatalog.applySeed/overrideLabel/revertToSeed/toggleFavorite/hasNewerSeedValue`, tipler `RecipeNutrition/PortionNutrition/CopyResult/RecentItem/SeedApplyReport/AdherenceWindow/DailyAdherence`, `NutritionError`, `core/time.addDaysToKey`, `claimCommand`. 02 §3/§10'a eklenmesi önerilir.
- **Nutrition adherence hangi bileşende?** 02 `AdherenceCalculator`'ı (domain/analytics) antrenman adherence'ı için tanımlar; beslenme adherence'ı bu belgede `MealLogService` altına kondu. 02 §9.3 `recoveryOk(last7d)` tanımı beslenmeyi içermiyor; `AdherenceWindow`'un guardrails koşuluna girip girmeyeceği (R105.3) 02'de netleştirilmeli.
- **Sezgisel eşikler spec'te yok:** `KCAL_BAND=0.10`, `PROTEIN_MIN=0.90`, `MIN_LOGGED_DAYS=4`, `yieldImplausible` (0.25×–4×), `kcalMismatch` (max(30 kcal, %25)), `macroSumExceeds100` toleransı (1 g), gram üst sınırı (10 000 g / tarif 50 000 g). Ayarlanabilir sabitler olarak tanımlandı; ürün kararı bekliyor.
- **`nutrition_targets.protein_g` için `CHECK (> 0)` yok** (`kcal` için var). Bu belge 0'ı `null` ratio ile ele alır; şemaya CHECK eklenmesi önerilir.
- **`meal_entries.grams` üst sınırı yok** (`CHECK (grams > 0)`); Zod tarafında sınır bu belgede tanımlandı.
- **Recents sorgusu için indeks:** `meal_entries(food_id)` / `meal_entries(recipe_id)` indeksi 03'te yok; veri hacmi küçük olduğundan v1'de gerekmeyebilir, ölçülmeli.
- **Tarif revizyon geçmişi yok:** snapshot makroları korur ama giriş anındaki malzeme listesi yeniden kurulamaz (`recipes` tek satır). R95/R99.5 ruhuna göre `recipe_revisions` istenirse migration konusu.
- **`command_log` kullanımı:** `meal_logs`/`meal_entries` tablolarında `command_id` kolonu yok (`set_logs`'ta var); idempotency bu belgede `command_log` ile sağlandı. 02 §15 "her komut `commandId` ile" ifadesiyle uyumlu, 03'te açıkça belirtilmeli.


---

## 11. MeasurementQuality, BaselineResolver ve MeasurementGuide (§96, §97, §119)

> Modül: `src/domain/measurements/` (`MeasurementService`, `MeasurementQuality`, `BaselineResolver`, `MeasurementGuide`) ve `src/domain/profile/` (`Onboarding`, `seedInitialProfile`). Tablolar: `body_measurements`, `measurement_samples` (03 §1.8); yardımcı: `profiles`, `weight_logs`, `settings`, `command_log`, `programs`. Mimari bağlam: 02 §11.1–§11.3, §5.1 (zaman alanları), §3 (transaction kuralı). Domain katmanı React/Expo bağımsızdır; görsel `require()` haritası `features/measurements/` içindedir, domain yalnızca asset **anahtarı** üretir.

### 11.1 Sorumluluk ve girdiler/çıktılar

| Bileşen | Sorumluluk | Girdi | Çıktı | Yan etki |
|---|---|---|---|---|
| `MeasurementQuality.evaluate` | Saf fonksiyon. 1–3 ham örnekten kalite durumu, `aggregation` ve final değeri türetir; 2 örnekte fark `> max(0.8 cm, %1.5)` ise üçüncü ölçüm önerir (R97.3, R97.4). | `samplesCm: number[]` (0–3), `site` | `QualityAssessment` | Yok |
| `MeasurementService.record` / `recordBatch` | Final değer + ham örnekleri **tek transaction** ile `body_measurements` + `measurement_samples`'a yazar (R97.5); `command_log` ile idempotent (R117). | `RecordMeasurementInput` | `RecordMeasurementResult` | INSERT ×(1 + n örnek) + `command_log` |
| `deriveBicepsView` | `bicepsLeftFlexed` / `bicepsRightFlexed` / `bicepsFlexed` satırlarından gösterim değerini türetir; türetilen değer **saklanmaz** (R96.2, 02 §11.2). | Aynı güne ait satırlar | `BicepsView \| null` | Yok |
| `BaselineResolver` | Site için başlangıç ölçümü: `is_baseline=1` öncelikli; yoksa `programs.start_date_key` ±7 gün penceresi; yoksa `null` (R96.3–R96.5, AT-12, AT-20). | `site`, program | `ResolvedBaseline \| null` | Yok (salt okunur) |
| `buildBicepsKpi` (features) | Dashboard kol KPI view-model'i; baseline `null` → `disabled` + **"Başlangıç kol ölçümünü ekle."** (R96.3–R96.5). | `BaselineResolver`, son ölçümler | `BicepsKpi` | Yok |
| `MeasurementGuide` | Site bazlı "nasıl ölçülür" metni + asset anahtarı (R97.1, R97.2). | `site` | `MeasurementGuideEntry` | Yok |
| `Onboarding` (biceps adımı) | Flexed biceps'i özellikle ister; tek/sol-sağ/"Sonra" (R96.1, R119.2). | Kullanıcı seçimi | `record`/`recordBatch` çağrısı veya hiçbir şey | — |
| `seedInitialProfile` | İlk çalıştırmada, kullanıcı onaylarsa `data/initial-profile.json` değerlerini yazar; biceps satırı **yazılmaz** (R119.1–R119.3). | JSON, `Clock`, kullanıcı onayı | `SeedReport` | `profiles.height_cm`, `weight_logs`, `body_measurements`, `measurement_samples`, `settings` |

Değişmezler (integration testi ile doğrulanır):

1. Her `body_measurements` satırının 1–3 `measurement_samples` satırı vardır; `aggregation` = `{1:'single', 2:'mean', 3:'median'}[örnek sayısı]`.
2. `final_value_cm` = `evaluate(samples).finalValueCm` (yeniden hesaplanabilir; ham veri ile türetilen değer birlikte, R97.5).
3. Hiçbir satırda `final_value_cm = 0` yoktur; bilinmeyen ölçüm = satır yok (R96.3, R119.3).

### 11.2 TypeScript arayüzleri ve sözde kod

#### 11.2.1 Tipler

```ts
// 03 §1.8 body_measurements.site CHECK listesiyle birebir
export type MeasurementSite =
  | 'waist' | 'abdomen' | 'shoulder' | 'hip' | 'chest'
  | 'forearmLeft' | 'forearmRight' | 'forearm'
  | 'bicepsLeftFlexed' | 'bicepsRightFlexed' | 'bicepsFlexed'
  | 'thighLeft' | 'thighRight' | 'thigh'
  | 'calfLeft' | 'calfRight' | 'calf' | 'neck';

export type Aggregation = 'single' | 'mean' | 'median';          // body_measurements.aggregation

export type QualityStatus =
  | 'empty'                 // 0 örnek — kaydedilemez
  | 'single'                // 1 örnek — serbest (R97.4)
  | 'pairWithinThreshold'   // 2 örnek, fark ≤ eşik
  | 'thirdRecommended'      // 2 örnek, fark > eşik (R97.3)
  | 'triple';               // 3 örnek — medyan

export interface QualityAssessment {
  status: QualityStatus;
  sampleCount: 0 | 1 | 2 | 3;
  thresholdCm: number | null;     // yalnızca 2 örnekte: max(0.8, 0.015 × iki örneğin ortalaması)
  spreadCm: number | null;        // max − min (≥ 2 örnek)
  aggregation: Aggregation | null;
  finalValueCm: number | null;    // 0.1 cm çözünürlük
  canSave: boolean;               // status !== 'empty'
  recommendThird: boolean;        // status === 'thirdRecommended'
}

// İç temsil: onda-cm tam sayıları. 38.2 + 38.4 gibi toplamların FP hatası (76.60000000000001)
// ve x.x5 yuvarlama tuzakları (38.35*10 = 383.4999…) bu sayede ortadan kalkar.
const toTenths   = (cm: number): number => Math.round(cm * 10);   // Zod 1 ondalık garanti eder (11.2.10)
const fromTenths = (t: number): number => t / 10;
```

#### 11.2.2 `MeasurementQuality.evaluate`

```ts
export const SPREAD_ABS_MIN_CM = 0.8;   // R97.3 eşiği, mutlak taban
export const SPREAD_REL        = 0.015; // %1.5 — referans: iki örneğin ortalaması (02'de tanımsız, bkz. açık nokta)

export function evaluate(samplesCm: readonly number[], _site: MeasurementSite): QualityAssessment {
  const t = samplesCm.map(toTenths);
  switch (t.length) {
    case 0:
      return { status: 'empty', sampleCount: 0, thresholdCm: null, spreadCm: null,
               aggregation: null, finalValueCm: null, canSave: false, recommendThird: false };
    case 1:
      return { status: 'single', sampleCount: 1, thresholdCm: null, spreadCm: null,
               aggregation: 'single', finalValueCm: fromTenths(t[0]), canSave: true, recommendThird: false };
    case 2: {
      const meanT      = (t[0] + t[1]) / 2;                                   // tam sayı veya tam .5
      const thresholdT = Math.max(SPREAD_ABS_MIN_CM * 10, SPREAD_REL * meanT); // onda-cm
      const diffT      = Math.abs(t[0] - t[1]);                               // tam sayı → karşılaştırma güvenli
      const divergent  = diffT > thresholdT;                                  // eşitlik = eşik AŞILMADI
      return { status: divergent ? 'thirdRecommended' : 'pairWithinThreshold', sampleCount: 2,
               thresholdCm: thresholdT / 10, spreadCm: diffT / 10,
               aggregation: 'mean', finalValueCm: fromTenths(Math.round(meanT)), // .5 → yukarı (tam sayı üzerinde)
               canSave: true, recommendThird: divergent };
    }
    case 3: {
      const s = [...t].sort((a, b) => a - b);
      return { status: 'triple', sampleCount: 3, thresholdCm: null, spreadCm: (s[2] - s[0]) / 10,
               aggregation: 'median', finalValueCm: fromTenths(s[1]), canSave: true, recommendThird: false };
    }
    default:
      throw new MeasurementValidationError('En fazla 3 örnek girilebilir.');    // measurement_samples CHECK 1..3
  }
}
```

Notlar: (i) `_site` v1'de kullanılmaz; eşik site-bağımsızdır, imza 02 §11.1'deki `evaluate(samples, site)` ile uyumlu tutulmuştur. (ii) 3 örnekte eşik uygulanmaz; medyan aykırı değere dirençlidir, `spreadCm` yalnızca bilgi amaçlı gösterilir (R123.2). (iii) Fonksiyon örnek sırasından bağımsızdır; `sample_index` ise giriş sırasını korur (ham veri, R97.5).

#### 11.2.3 `MeasurementService.record` — tek transaction

```ts
export interface RecordMeasurementInput {
  commandId: string;                    // uuid; body_measurements.id olarak da kullanılır (bkz. açık nokta 4)
  site: MeasurementSite;
  samplesCm: number[];                  // 1..3; dizi sırası = sample_index (1 tabanlı)
  localDateKey?: string;                // yoksa clock.todayKey(); "dün" için tarih seçici (02 §5.3)
  isBaseline?: boolean;                 // onboarding ve CTA akışı true gönderir
  replaceExistingBaseline?: boolean;    // aynı site için mevcut is_baseline=1 satırını 0'a çeker
  confirmSpread?: boolean;              // 'thirdRecommended' iken yine de ortalamayla kaydet (R97.4)
  note?: string | null;
}

export type RecordMeasurementResult =
  | { ok: true;  measurementId: string; assessment: QualityAssessment; replayed: boolean }
  | { ok: false; reason: 'thirdRecommended'; assessment: QualityAssessment }
  | { ok: false; reason: 'baselineExists'; existingMeasurementId: string; existingDateKey: string };

async record(input: RecordMeasurementInput): Promise<RecordMeasurementResult> {
  const p = RecordMeasurementInputSchema.parse(input);            // ZodError → MeasurementValidationError (TR mesaj)
  const assessment = evaluate(p.samplesCm, p.site);
  if (assessment.status === 'thirdRecommended' && !p.confirmSpread)
    return { ok: false, reason: 'thirdRecommended', assessment };   // hata değil, karar noktası

  const nowUtc = clock.nowUtc().toISOString();
  const todayKey = clock.todayKey();
  const localDateKey = p.localDateKey ?? todayKey;
  if (localDateKey > todayKey) throw new MeasurementValidationError('Gelecek tarihe ölçüm girilemez.');

  return db.withTransaction(async tx => {                          // BEGIN IMMEDIATE … COMMIT (03 §0)
    if (await commandLog.exists(tx, p.commandId))
      return { ok: true, measurementId: p.commandId, assessment, replayed: true };   // idempotent tekrar

    if (p.isBaseline) {
      const current = await measurements.findExplicitBaseline(tx, p.site);          // is_baseline=1
      if (current && !p.replaceExistingBaseline)
        return { ok: false, reason: 'baselineExists', existingMeasurementId: current.id, existingDateKey: current.local_date_key };
      if (current) await measurements.clearBaseline(tx, current.id);                // UPDATE … SET is_baseline = 0
    }

    await measurements.insert(tx, {
      id: p.commandId, measured_at_utc: nowUtc, local_date_key: localDateKey, time_zone: clock.timeZone(),
      site: p.site, final_value_cm: assessment.finalValueCm!, aggregation: assessment.aggregation!,
      is_baseline: p.isBaseline ? 1 : 0, note: p.note ?? null,
    });
    for (let i = 0; i < p.samplesCm.length; i++)
      await samples.insert(tx, { id: uuid(), measurement_id: p.commandId, sample_index: i + 1, value_cm: p.samplesCm[i] });
    await commandLog.insert(tx, { command_id: p.commandId, command_type: 'measurement.record', executed_at_utc: nowUtc });

    return { ok: true, measurementId: p.commandId, assessment, replayed: false };
  });
}

// Sol + sağ biceps gibi birlikte anlamlı kayıtlar: hepsi ya yazılır ya hiçbiri.
async recordBatch(inputs: RecordMeasurementInput[]): Promise<RecordMeasurementResult[]> {
  // 1) Tümünü transaction DIŞINDA değerlendir; herhangi biri 'thirdRecommended' (onaysız) ise hiçbirini yazma, sonuçları döndür.
  // 2) Tek db.withTransaction içinde record()'un tx-içi gövdesini sırayla uygula.
}
```

`measured_at_utc` her zaman "şimdi"dir; kullanıcı geçmiş bir gün seçtiğinde yalnızca `local_date_key` değişir (02 §5.3). `time_zone` yazıldığı anda sabitlenir ve sonradan yeniden hesaplanmaz (R112.3, 02 §5.1).

#### 11.2.4 Sol/sağ biceps ve `bicepsFlexed` türetimi (R96.2)

Yazma kuralı: kullanıcı **tek değer** girerse `site='bicepsFlexed'` satırı; **sol/sağ ayrı** girerse `bicepsLeftFlexed` + `bicepsRightFlexed` satırları (`recordBatch`, her biri kendi örnekleri ve kendi `evaluate` sonucuyla). Türetilmiş birleşik değer için **satır yazılmaz**.

```ts
export interface BicepsView {
  localDateKey: string;
  leftCm: number | null;                    // bicepsLeftFlexed.final_value_cm
  rightCm: number | null;                   // bicepsRightFlexed.final_value_cm
  combinedCm: number;                       // gösterim değeri
  combinedSource: 'stored' | 'meanOfSides' | 'leftOnly' | 'rightOnly';
  measurementIds: string[];                 // Recommendation.evidence.measurementIds için (R122.3)
}

// rowsOfDay: aynı local_date_key'e ait biceps satırları; aynı site aynı gün birden fazlaysa en yeni measured_at_utc alınır.
export function deriveBicepsView(rowsOfDay: BodyMeasurementRow[]): BicepsView | null {
  const pick = (site: MeasurementSite) =>
    rowsOfDay.filter(r => r.site === site).sort((a, b) => b.measured_at_utc.localeCompare(a.measured_at_utc))[0];
  const stored = pick('bicepsFlexed'), left = pick('bicepsLeftFlexed'), right = pick('bicepsRightFlexed');
  const base = { localDateKey: rowsOfDay[0]?.local_date_key, leftCm: left?.final_value_cm ?? null, rightCm: right?.final_value_cm ?? null,
                 measurementIds: [stored, left, right].filter(Boolean).map(r => r!.id) };
  if (stored)        return { ...base, combinedCm: stored.final_value_cm, combinedSource: 'stored' };     // açık > türetilmiş
  if (left && right) return { ...base, combinedSource: 'meanOfSides',
                              combinedCm: fromTenths(Math.round((toTenths(left.final_value_cm) + toTenths(right.final_value_cm)) / 2)) };
  if (left)          return { ...base, combinedCm: left.final_value_cm,  combinedSource: 'leftOnly' };
  if (right)         return { ...base, combinedCm: right.final_value_cm, combinedSource: 'rightOnly' };
  return null;
}
```

#### 11.2.5 `BaselineResolver`

```ts
export interface ResolvedBaseline {
  measurementId: string; site: MeasurementSite; valueCm: number; localDateKey: string;
  source: 'explicit' | 'startWindow';   // is_baseline=1  |  start_date_key ±7 gün
  daysFromStart: number | null;         // program yoksa null
}

export interface BicepsBaseline { combined: BicepsView; left: ResolvedBaseline | null; right: ResolvedBaseline | null; }

export class BaselineResolver {
  constructor(private readonly measurements: MeasurementReadPort,
              private readonly programs: ProgramReadPort) {}

  async forSite(site: MeasurementSite): Promise<ResolvedBaseline | null> {
    // 1) Açık başlangıç: is_baseline = 1
    const explicit = await this.measurements.findExplicitBaselines(site);          // ORDER BY measured_at_utc ASC
    const program  = await this.programs.findForBaseline();                          // açık (active|paused) ?? en son completed ?? null
    if (explicit.length > 0) {
      if (explicit.length > 1) log.warn('multiple explicit baselines', { site });    // veri anomalisi; ilk yazılan kazanır
      return this.toResolved(explicit[0], 'explicit', program);
    }
    // 2) Program başlangıç penceresi
    if (!program) return null;
    const start = program.start_date_key;
    const rows = await this.measurements.findInDateRange(site, addDays(start, -7), addDays(start, +7));
    if (rows.length === 0) return null;
    rows.sort((a, b) =>
      Math.abs(daysBetween(start, a.local_date_key)) - Math.abs(daysBetween(start, b.local_date_key)) // en yakın
      || a.measured_at_utc.localeCompare(b.measured_at_utc));                                           // eşitlikte ilk
    return this.toResolved(rows[0], 'startWindow', program);
  }

  async biceps(): Promise<BicepsBaseline | null> {
    const [c, l, r] = await Promise.all([this.forSite('bicepsFlexed'), this.forSite('bicepsLeftFlexed'), this.forSite('bicepsRightFlexed')]);
    if (!c && !l && !r) return null;                                                 // → dashboard CTA (R96.4)
    const combined = deriveBicepsView(await this.measurements.byIds([c, l, r].filter(Boolean).map(b => b!.measurementId)))!;
    return { combined, left: l, right: r };                                          // 11.2.4 ile aynı türetim kuralı
  }
}
```

`addDays` / `daysBetween` `core/time`'dan gelir (02 §6.1'de kullanılan yardımcı). Resolver hiçbir şey yazmaz; `startWindow` kaynaklı bir başlangıcı kalıcılaştırmak istenirse ayrı bir kullanıcı eylemi (`MeasurementService.markBaseline(id)` → `is_baseline=1`) gerekir.

#### 11.2.6 Dashboard kol KPI'sı (R96.3–R96.5, AT-12)

```ts
export type BicepsKpi =
  | { state: 'disabled'; ctaTr: 'Başlangıç kol ölçümünü ekle.' }                           // R96.4 — birebir metin
  | { state: 'baselineOnly'; baselineCm: number; baselineDateKey: string; hintTr: string }
  | { state: 'active'; baselineCm: number; baselineDateKey: string;
      latestCm: number; latestDateKey: string; deltaCm: number;
      trendMedianCm: number | null;     // son 3 ölçüm gününün medyanı (02 §9.7); < 3 ise null
      noisy: boolean;                   // son ölçümün örnek yayılımı eşiği aşıyorsa (R123.2)
      sides?: { left?: { baselineCm: number; latestCm: number; deltaCm: number };
                right?: { baselineCm: number; latestCm: number; deltaCm: number } } };

export async function buildBicepsKpi(resolver: BaselineResolver, measurements: MeasurementReadPort): Promise<BicepsKpi> {
  const baseline = await resolver.biceps();
  if (!baseline) return { state: 'disabled', ctaTr: 'Başlangıç kol ölçümünü ekle.' };     // asla '0 cm' (R96.3)
  const b = baseline.combined;
  const days = await measurements.bicepsViewsAfter(b.measurementIds, { limit: 3 });        // baseline satırlarından SONRA, gün bazında, en yeni önce
  if (days.length === 0) return { state: 'baselineOnly', baselineCm: b.combinedCm, baselineDateKey: b.localDateKey, hintTr: 'Henüz yeni ölçüm yok.' };
  const latest = days[0];
  const deltaCm = fromTenths(toTenths(latest.combinedCm) - toTenths(b.combinedCm));
  const trendMedianCm = days.length >= 3 ? fromTenths(medianTenths(days.map(d => toTenths(d.combinedCm)))) : null;
  return { state: 'active', baselineCm: b.combinedCm, baselineDateKey: b.localDateKey,
           latestCm: latest.combinedCm, latestDateKey: latest.localDateKey, deltaCm, trendMedianCm,
           noisy: await measurements.latestSpreadExceedsThreshold(latest.measurementIds),
           sides: sideDeltas(baseline, latest) };                                            // yalnızca iki tarafta da veri varsa
}
```

Kopya kuralı (R123.1–R123.3): "Başlangıca göre **+0.6 cm** · tekil ölçüm, gürültülü olabilir" / "Son 3 ölçüm medyanı 38.7 cm". "Kas kazandın" türü ifade yok; `deltaCm` 1 ondalık ve işaretli gösterilir.

#### 11.2.7 `MeasurementGuide` (R97.1, R97.2) ve görsel asset adlandırması

```ts
export type GuideAssetKey = 'waist' | 'abdomen' | 'shoulder' | 'hip' | 'chest' | 'forearm' | 'biceps-flexed' | 'thigh' | 'calf' | 'neck';

export interface MeasurementGuideEntry {
  site: MeasurementSite;
  titleTr: string;
  landmarkTr: string;            // anatomik nokta (R97.2)
  stepsTr: string[];             // 2–4 kısa adım
  consistencyTr: string;         // "her seferinde aynı …" kuralı
  asset: GuideAssetKey;          // taraf farkı görselde değil, rozette gösterilir
  side: 'left' | 'right' | null;
}

export const MEASUREMENT_GUIDE: Record<MeasurementSite, MeasurementGuideEntry> = { /* aşağıdaki tablo */ };
export const guideFor = (site: MeasurementSite): MeasurementGuideEntry => MEASUREMENT_GUIDE[site];

// features/measurements/guideImages.ts — Metro statik require zorunlu
export const GUIDE_IMAGES: Record<GuideAssetKey, ImageSourcePropType> = {
  'waist': require('../../../assets/measurement-guides/waist.png'),
  'biceps-flexed': require('../../../assets/measurement-guides/biceps-flexed.png'), /* … */
};
```

Dosya kuralı: `assets/measurement-guides/<GuideAssetKey>.png` + `<GuideAssetKey>@2x.png` + `<GuideAssetKey>@3x.png` (RN yoğunluk son ekleri). Taraflı site'lar aile asset'ini paylaşır: `bicepsLeftFlexed | bicepsRightFlexed | bicepsFlexed → biceps-flexed`, `forearmLeft | forearmRight | forearm → forearm` (thigh/calf aynı kalıp). Unit testi: `MEASUREMENT_GUIDE` 18 site'ın hepsini içerir; `GUIDE_IMAGES` her `GuideAssetKey` için dosya bulur.

| site | `landmarkTr` | `stepsTr` (özet) | `consistencyTr` | `asset` |
|---|---|---|---|---|
| `waist` | Kaburga altı ile kalça kemiği üstü arasındaki en dar nokta | Mezura yere paralel · normal nefes verişin sonunda · mezurayı sıkma, cilde temas etsin | **Her seferinde aynı anatomik noktadan** (R97.2). En dar nokta belirgin değilse bir referans seç ve `note`'a yaz | `waist` |
| `abdomen` | **Göbek deliği hizası** (R97.2) | Yere paralel · karnı içeri çekme · normal nefes verişin sonunda | Aynı hiza, aynı duruş, aynı nefes fazı | `abdomen` |
| `shoulder` | **Omuzların en geniş çevresi** — deltoidlerin en dış noktası (R97.2) | Kollar yanda gevşek · mezura yere paralel · mümkünse yardım al | Omuz silkme/kol kaldırma yok | `shoulder` |
| `bicepsFlexed`, `bicepsLeftFlexed`, `bicepsRightFlexed` | Bükülü (flexed) üst kolun en kalın noktası | Dirsek ~90°, yumruk sıkılı, kol kasılı · mezura kola dik · en kalın noktadan | **Kol flexed, her seferinde aynı pozisyon** (R97.2). Sol/sağ ayrı takipte aynı kolu aynı site'a gir | `biceps-flexed` |
| `hip` | Kalçanın en geniş çevresi | Ayaklar bitişik · mezura yere paralel | Aynı duruş | `hip` |
| `chest` | Meme ucu hizası, kollar yanda | Normal nefes verişin sonunda · mezura yere paralel · göğsü şişirme | Aynı nefes fazı | `chest` |
| `forearm`, `forearmLeft`, `forearmRight` | Dirseğin hemen altındaki en kalın nokta | Kol gevşek, dirsek düz, yumruk gevşek · mezura kola dik | Kasmadan; aynı kol aynı site | `forearm` |
| `thigh*`, `calf*`, `neck` | 03'te tanımlı; metinleri bu bölümün kapsamı dışında (açık nokta 12) | — | — | `thigh` / `calf` / `neck` |

Ortak alt not (tüm site'lar): "Sabah, aç karnına, aynı mezurayla; mezura düz, gergin ama sıkmadan." Rehber ekranda örnek girişinin hemen üstünde gösterilir; görsel yüklenemezse metin tek başına yeterlidir (R117.1).

#### 11.2.8 Onboarding biceps adımı ve "Sonra" (R96.1, R119.2)

```
Onboarding adımları (profile/Onboarding):
  'profile'          → profiles satırı (height_cm dahil)
  'trainingProfile'  → training_profiles (§120)
  'measurements'     → [Önceden girilmiş değerleri kullan] → seedInitialProfile({ useProvidedValues: true })
                       [Kendim gireceğim]                  → waist, abdomen, shoulder, hip, chest, forearm için
                                                             MeasurementEntry(site, isBaseline: true); her biri atlanabilir
  'bicepsBaseline'   → HER ZAMAN gösterilir (seed biceps içermez, R119.2)
                       mode 'single' → MeasurementEntry('bicepsFlexed', isBaseline: true)          → record
                       mode 'sides'  → MeasurementEntry('bicepsLeftFlexed') + ('bicepsRightFlexed') → recordBatch (tek tx)
                       [Sonra]       → HİÇBİR yazma yok; adım tamamlanmış sayılır; onboarding engellenmez
  'programStart'     → programs INSERT; profiles.onboarding_completed = 1
```

- `MeasurementEntry` bileşeni: `guideFor(site)` rehberi + 1–3 örnek girişi (`NumericStepper`, 0.1 cm adım) + `evaluate` sonucuna göre buton seti (11.3 tablosu).
- "Sonra" için ayrı bir ayar/bayrak **tutulmaz**: dashboard CTA'sı `resolver.biceps() === null` olduğu sürece görünür (R96.4); CTA → aynı `MeasurementEntry` (biceps ailesi, `isBaseline: true`). Kayıt sonrası KPI bir sonraki `hydrate()` ile `active`/`baselineOnly` olur (R96.5).
- "Sonra" hiçbir koşulda `0` veya yer tutucu satır yazmaz (R96.3, R119.3).

#### 11.2.9 `seedInitialProfile` (R119.1–R119.3)

```jsonc
// data/initial-profile.json — Bölüm I §11 değerleri; anahtarlar MeasurementSite değerleriyle birebir
{ "version": 1, "heightCm": 187, "weightKg": 107,
  "measurements": { "waist": 95, "abdomen": 114, "shoulder": 137, "hip": 119, "chest": 110, "forearm": 37,
                    "bicepsFlexed": null } }   // UNKNOWN → null; 0 YASAK (R119.2, R119.3)
```

```ts
export type SeedReport =
  | { skipped: 'userDeclined' | 'alreadyApplied' }
  | { skipped: null; measurementsWritten: number; weightWritten: boolean; heightWritten: boolean };

export async function seedInitialProfile(db: Db, clock: Clock, opts: { useProvidedValues: boolean }): Promise<SeedReport> {
  if (!opts.useProvidedValues) return { skipped: 'userDeclined' };
  const seed = InitialProfileSchema.parse(initialProfileJson);        // parse hatası → SeedValidationError (11.4)
  const now = clock.nowUtc().toISOString(), today = clock.todayKey(), tz = clock.timeZone();
  return db.withTransaction(async tx => {
    if (await settings.get(tx, 'seed.initialProfileApplied')) return { skipped: 'alreadyApplied' };   // idempotent
    const profile = await profiles.findSingle(tx);                     // 'profile' adımında oluşturulmuş olmalı
    if (seed.heightCm != null) await profiles.update(tx, profile.id, { height_cm: seed.heightCm, updated_at_utc: now });
    if (seed.weightKg != null) await weightLogs.insert(tx, { id: uuid(), measured_at_utc: now, local_date_key: today,
                                                             time_zone: tz, weight_kg: seed.weightKg, note: 'seed:initial-profile' });
    let written = 0;
    for (const [site, cm] of Object.entries(seed.measurements) as Array<[MeasurementSite, number | null]>) {
      if (cm == null) continue;                                        // bicepsFlexed → satır YOK
      const id = uuid();
      await measurements.insert(tx, { id, measured_at_utc: now, local_date_key: today, time_zone: tz, site,
                                      final_value_cm: cm, aggregation: 'single', is_baseline: 1, note: 'seed:initial-profile' });
      await samples.insert(tx, { id: uuid(), measurement_id: id, sample_index: 1, value_cm: cm });   // değişmez 1 korunur
      written++;                                                       // beklenen: 6
    }
    await settings.set(tx, 'seed.initialProfileApplied', { at: now, version: seed.version });
    return { skipped: null, measurementsWritten: written, weightWritten: seed.weightKg != null, heightWritten: seed.heightCm != null };
  });
}
```

Seed satırları `is_baseline=1` taşıdığı için `BaselineResolver` program tarihinden bağımsız çalışır (onboarding günü ≠ `start_date_key` olabilir). `local_date_key` onboarding günüdür; program henüz yoktur.

#### 11.2.10 Zod şemaları (R119.4, 03 §4)

```ts
export const DateKeySchema        = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const CmSchema             = z.number().positive().lt(300);          // 03 CHECK: > 0 AND < 300 (bkz. açık nokta 3)
export const NullableCmSchema     = CmSchema.nullable();                     // null = bilinmiyor; 0/negatif/≥300 = hata
export const CmSampleSchema       = CmSchema.refine(v => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6,
                                                    { message: 'En fazla 1 ondalık (0.1 cm).' });
export const MeasurementSiteSchema = z.enum(['waist','abdomen','shoulder','hip','chest','forearmLeft','forearmRight','forearm',
  'bicepsLeftFlexed','bicepsRightFlexed','bicepsFlexed','thighLeft','thighRight','thigh','calfLeft','calfRight','calf','neck']);
export const AggregationSchema    = z.enum(['single','mean','median']);

export const RecordMeasurementInputSchema = z.object({
  commandId: z.string().uuid(),
  site: MeasurementSiteSchema,
  samplesCm: z.array(CmSampleSchema).min(1).max(3),
  localDateKey: DateKeySchema.optional(),
  isBaseline: z.boolean().default(false),
  replaceExistingBaseline: z.boolean().default(false),
  confirmSpread: z.boolean().default(false),
  note: z.string().max(500).nullable().optional(),
}).strict();

// TableRegistry satır şemaları (03 §4 adlandırma kalıbı: <Table>Row)
export const BodyMeasurementRow = z.object({
  id: z.string().uuid(), measured_at_utc: z.string().datetime({ offset: false }), local_date_key: DateKeySchema,
  time_zone: z.string().min(1), site: MeasurementSiteSchema, final_value_cm: CmSchema, aggregation: AggregationSchema,
  is_baseline: z.union([z.literal(0), z.literal(1)]), note: z.string().nullable(),
}).strict();
export const MeasurementSampleRow = z.object({
  id: z.string().uuid(), measurement_id: z.string().uuid(),
  sample_index: z.union([z.literal(1), z.literal(2), z.literal(3)]), value_cm: CmSampleSchema,
}).strict();

export const InitialProfileSchema = z.object({
  version: z.literal(1),
  heightCm: NullableCmSchema,
  weightKg: z.number().positive().lt(400).nullable(),                      // weight_logs CHECK: > 0 AND < 400
  measurements: z.object({
    waist: NullableCmSchema, abdomen: NullableCmSchema, shoulder: NullableCmSchema, hip: NullableCmSchema,
    chest: NullableCmSchema, forearm: NullableCmSchema, bicepsFlexed: NullableCmSchema,
  }).strict(),
}).strict();
// Build/unit testi: InitialProfileSchema.parse(initialProfileJson).measurements.bicepsFlexed === null  (R119.2)
```

Import (§95) ve backup `data.json` doğrulaması aynı `BodyMeasurementRow` / `MeasurementSampleRow` şemalarını `TableRegistry` üzerinden kullanır; ek olarak import sonrası değişmez 1 (`aggregation` ↔ örnek sayısı) `integrity` adımında kontrol edilir.

### 11.3 Kural / geçiş tablosu

**A. Örnek girişi durum makinesi** (`MeasurementEntry` + `evaluate`; T = `max(0.8, 0.015 × ortalama)`)

| # | Mevcut durum | Olay | Yeni durum | `aggregation` / `final` | UI |
|---|---|---|---|---|---|
| 1 | `empty` | örnek ekle | `single` | `single` / s₁ | "Kaydet" aktif; ikincil "2. ölçüm ekle (önerilir)" |
| 2 | `single` | örnek ekle, fark ≤ T | `pairWithinThreshold` | `mean` / yuvarlanmış ortalama | "Kaydet" |
| 3 | `single` | örnek ekle, fark > T | `thirdRecommended` | (`mean`, onayla) | Birincil **"3. ölçüm ekle"**; ikincil "Yine de ortalamayla kaydet" (`confirmSpread`), "Bir örneği sil" |
| 4 | `thirdRecommended` | örnek ekle | `triple` | `median` / orta değer | "Kaydet"; `spreadCm > T` ise bilgi notu (engel yok) |
| 5 | `pairWithinThreshold` | örnek ekle | `triple` | `median` | "Kaydet" |
| 6 | `thirdRecommended` | örnek sil | `single` | `single` | Tek ölçümle devam (R97.4) |
| 7 | `triple` | örnek sil | kalan 2 ile yeniden değerlendir (2 veya 3) | `mean` | — |
| 8 | herhangi (3 örnek) | 4. örnek | — | — | UI'da buton yok; servis `MeasurementValidationError` |
| 9 | `thirdRecommended` | Kaydet, `confirmSpread=false` | değişmez | — | `record` → `{ ok:false, reason:'thirdRecommended' }`; alt sayfa: "İki ölçüm arasında 1.4 cm fark var (eşik 0.8 cm)." |
| 10 | `single` / `pairWithinThreshold` / `triple` / onaylı `thirdRecommended` | Kaydet | kaydedildi | tek transaction (11.2.3) | Liste + KPI `hydrate()` |

**B. Baseline çözümleme** (`BaselineResolver.forSite`)

| `is_baseline=1` satır | Program | ±7 gün penceresinde satır | Sonuç |
|---|---|---|---|
| var (1) | herhangi | — | O satır, `source:'explicit'` |
| var (>1) | herhangi | — | En erken `measured_at_utc`, `source:'explicit'`, uyarı logu |
| yok | var | var | \|`daysBetween(start, local_date_key)`\| en küçük; eşitlikte en erken `measured_at_utc`; `source:'startWindow'` |
| yok | var | yok | `null` |
| yok | yok | — | `null` (pencere adımı atlanır) |

**C. Biceps birleşik değer** (`deriveBicepsView`, aynı gün)

| `bicepsFlexed` satırı | `bicepsLeftFlexed` | `bicepsRightFlexed` | `combinedCm` | `combinedSource` |
|---|---|---|---|---|
| var | herhangi | herhangi | saklanan değer | `stored` |
| yok | var | var | onda-cm ortalaması, .5 yukarı | `meanOfSides` |
| yok | var | yok | sol | `leftOnly` |
| yok | yok | var | sağ | `rightOnly` |
| yok | yok | yok | — | `null` |

**D. KPI durumu** (`buildBicepsKpi`)

| Baseline | Baseline sonrası ölçüm günü | KPI |
|---|---|---|
| `null` | — | `disabled`, CTA "Başlangıç kol ölçümünü ekle." (asla `0 cm`) |
| var | 0 | `baselineOnly` |
| var | 1–2 | `active`, `trendMedianCm: null` ("trend için en az 3 ölçüm") |
| var | ≥ 3 | `active`, `trendMedianCm` = son 3 günün medyanı |

### 11.4 Sınır durumları ve hata durumları

Sınır durumları:

- **Eşitlik eşiği aşmaz:** fark tam T ise `pairWithinThreshold` (`>` katı). Onda-cm tam sayı fark ile kayan noktalı eşik karşılaştırıldığı için FP eşitlik tuzağı yoktur.
- **.5 yuvarlama:** 2 örneğin ortalaması x.x5 ise yukarı (383.5 → 384 → 38.4); tam sayı `Math.round` deterministik.
- **Sıra bağımsızlığı:** `[39.6, 38.2]` ≡ `[38.2, 39.6]`; `sample_index` giriş sırasını korur.
- **Özdeş örnekler:** `[38.2, 38.2]` → fark 0 → `mean` 38.2.
- **Aykırı üçlü:** `[38.2, 45.0, 38.3]` → medyan 38.3; `spreadCm 6.8` bilgi notu, kayıt engellenmez (medyan dirençli; R123.2).
- **Girdi çözünürlüğü:** 38.25 → Zod reddi ("En fazla 1 ondalık"); stepper zaten 0.1 üretir.
- **Geçmiş gün:** tarih seçici `local_date_key`'i ayarlar, `measured_at_utc` şimdi; gelecek gün → hata. Timezone değişse de `local_date_key` yeniden hesaplanmaz (02 §5.1).
- **Aynı site aynı gün birden fazla satır:** izinli (UNIQUE yok); görünümler en yeni `measured_at_utc`'yi alır, geçmiş korunur.
- **Baseline silme:** `body_measurements` satırı silinince örnekler `ON DELETE CASCADE`; `is_baseline=1` ise UI onayı: "Bu başlangıç ölçümün; silersen kol KPI'sı pasifleşebilir." Silme sonrası resolver pencereye düşer, o da yoksa `disabled`.
- **Geç baseline (CTA ile Gün 40):** `is_baseline=1` yazılır; KPI "Başlangıç: 17 Ekim (Gün 40)" etiketi gösterir (AT-20 etiketi açık nokta 16).
- **İkinci açık baseline:** `replaceExistingBaseline` yoksa `{ ok:false, reason:'baselineExists' }`; varsa eski satır `is_baseline=0` yapılır, silinmez.
- **Program yok / `paused`:** resolver açık programı (`active`|`paused`) kullanır; yoksa en son `completed` (Day 90 raporu); hiçbiri yoksa yalnızca açık baseline.
- **Tek taraflı baseline, sonra tek değer ölçümü:** birleşik KPI çalışır (`leftOnly` → `stored` karşılaştırması); taraf bazlı delta yalnızca iki tarafta da veri varsa gösterilir.
- **Replay:** aynı `commandId` ikinci kez → `replayed: true`, ek satır yok (`command_log` + `body_measurements.id` PK).
- **Seed:** `useProvidedValues=false` → hiçbir yazma; ikinci çağrı → `alreadyApplied`; `profiles` satırı yoksa `SeedPreconditionError` (onboarding sırası hatası, geliştirici hatası).

Hata durumları:

| Hata / sonuç | Kaynak | Kullanıcıya (TR, R117.5) | Aksiyon |
|---|---|---|---|
| `MeasurementValidationError` | Zod (`RecordMeasurementInputSchema`) veya servis ön-koşulu | "Ölçüm değeri geçersiz: 0–300 cm arası, en fazla 1 ondalık." / "Gelecek tarihe ölçüm girilemez." / "En fazla 3 örnek girilebilir." | Düzelt |
| `{ ok:false, reason:'thirdRecommended' }` | `record` | "İki ölçüm arasında {spread} cm fark var (eşik {threshold} cm). Üçüncü ölçüm önerilir." | 3. ekle · Yine de kaydet · Örnek sil |
| `{ ok:false, reason:'baselineExists' }` | `record` | "Bu bölge için başlangıç ölçümü zaten var ({tarih})." | Değiştir · Vazgeç |
| `DbWriteError` (disk dolu, SQLITE_BUSY, CHECK ihlali) | repository | "Kaydedilemedi. Boş alanı kontrol et." | Yeniden dene (aynı `commandId`, idempotent) |
| Görsel yüklenemedi | `Image.onError` | Rehber yalnızca metinle | — (beyaz ekran yok, R117.1) |
| `SeedValidationError` (JSON şemaya uymuyor) | `seedInitialProfile` | "Önceden girilmiş değerler yüklenemedi; kendin girebilirsin." | Manuel giriş; ayrıca build testi bunu yayın öncesi yakalar |
| `SeedPreconditionError` | `seedInitialProfile` | Genel hata kartı | Geliştirici hatası; onboarding sırası |

### 11.5 Test vektörleri

**A. `MeasurementQuality.evaluate`** (T = `max(0.8, 0.015 × ortalama)`, cm)

| # | site | `samplesCm` | Ortalama | T | Fark | `status` | `aggregation` | `finalValueCm` |
|---|---|---|---|---|---|---|---|---|
| A1 | bicepsFlexed | [38.2, 38.4] | 38.3 | max(0.8, 0.5745) = 0.8 | 0.2 | `pairWithinThreshold` | `mean` | **38.3** |
| A2 | bicepsFlexed | [38.2, 39.6] | 38.9 | max(0.8, 0.5835) = 0.8 | 1.4 | **`thirdRecommended`** | `mean` (onayla) | 38.9 (yalnızca `confirmSpread`) |
| A3 | bicepsFlexed | [38.2, 39.6, 38.3] | — | — | spread 1.4 | `triple` | `median` | **38.3** |
| A4 | bicepsFlexed | [38.2] | — | — | — | `single` | `single` | 38.2 |
| A5 | bicepsFlexed | [39.6, 38.2] | 38.9 | 0.8 | 1.4 | `thirdRecommended` (A2 ile özdeş) | — | — |
| A6 | bicepsFlexed | [38.2, 38.5] | 38.35 | 0.8 | 0.3 | `pairWithinThreshold` | `mean` | 38.4 (.5 yukarı) |
| A7 | bicepsFlexed | [38.2, 38.2] | 38.2 | 0.8 | 0.0 | `pairWithinThreshold` | `mean` | 38.2 |
| A8 | waist | [95.0, 96.4] | 95.7 | max(0.8, 1.4355) = 1.4355 | 1.4 | `pairWithinThreshold` | `mean` | 95.7 |
| A9 | waist | [95.0, 96.5] | 95.75 | 1.43625 | 1.5 | `thirdRecommended` | — | (95.8 onaylanırsa) |
| A10 | abdomen | [114.0, 115.7] | 114.85 | 1.72275 | 1.7 | `pairWithinThreshold` | `mean` | 114.9 |
| A11 | shoulder | [137.0, 139.0] | 138.0 | 2.07 | 2.0 | `pairWithinThreshold` | `mean` | 138.0 |
| A12 | shoulder | [137.0, 139.1] | 138.05 | 2.07075 | 2.1 | `thirdRecommended` | — | — |
| A13 | bicepsFlexed | [38.2, 38.2, 39.6] | — | — | 1.4 | `triple` | `median` | 38.2 |
| A14 | bicepsFlexed | [38.2, 45.0, 38.3] | — | — | 6.8 | `triple` (bilgi notu) | `median` | 38.3 |
| A15 | any | [] | — | — | — | `empty`, `canSave:false` | `null` | `null` |
| A16 | any | [38.2, 38.4, 38.3, 38.5] | — | — | — | `MeasurementValidationError` | — | — |
| A17 | any | [0] | — | — | — | Zod reddi (`positive`) | — | — |
| A18 | any | [300] | — | — | — | Zod reddi (`lt(300)`) | — | — |
| A19 | any | [38.25] | — | — | — | Zod reddi (1 ondalık) | — | — |

**B. `deriveBicepsView`** (aynı `local_date_key`)

| # | Satırlar | `combinedCm` | `combinedSource` |
|---|---|---|---|
| B1 | bicepsFlexed 38.3 | 38.3 | `stored` |
| B2 | left 38.3, right 37.6 | 38.0 ((383+376)/2 = 379.5 → 380) | `meanOfSides` |
| B3 | left 38.3, right 37.8 | 38.1 (380.5 → 381) | `meanOfSides` |
| B4 | left 38.3 | 38.3 | `leftOnly` |
| B5 | bicepsFlexed 38.6 + left 38.3 + right 37.6 | 38.6 | `stored` (açık > türetilmiş) |
| B6 | yok | `null` | — |

**C. `BaselineResolver`** (`programs.start_date_key = '2026-09-07'`)

| # | Satırlar (site, `local_date_key`, `is_baseline`) | Program | Sonuç |
|---|---|---|---|
| C1 | bicepsFlexed 2026-09-20 `1` | active | 2026-09-20, `explicit` (tarih pencere dışı olsa da) |
| C2 | bicepsFlexed 2026-09-01 `0`; 2026-09-09 `0` | active | 2026-09-09 (\|2\| < \|6\|), `startWindow` |
| C3 | bicepsFlexed 2026-09-05 `0`; 2026-09-09 `0` | active | 2026-09-05 (eşitlikte en erken), `startWindow` |
| C4 | bicepsFlexed 2026-09-15 `0` | active | `null` (+8 gün, pencere dışı) → KPI `disabled` |
| C5 | bicepsFlexed 2026-09-03 `0` | yok | `null` (pencere adımı atlanır) |
| C6 | left 2026-09-07 `1`, right 2026-09-07 `1` (38.3 / 37.6) | active | `biceps()` → `combined 38.0 meanOfSides`, `left`, `right` dolu |
| C7 | hiç biceps satırı yok; waist/abdomen seed `1` | active | `biceps()` → `null`; `forSite('waist')` → seed satırı `explicit` |
| C8 | bicepsFlexed 2026-09-06 `1`; 2026-09-07 `1` (anomali) | active | 2026-09-06 (en erken `measured_at_utc`), uyarı logu |

**D. `buildBicepsKpi`** (AT-12)

| # | Baseline | Sonraki ölçümler | Beklenen |
|---|---|---|---|
| D1 | `null` | — | `{ state:'disabled', ctaTr:'Başlangıç kol ölçümünü ekle.' }`; ekranda `0 cm` metni **yok** |
| D2 | 38.3 (2026-09-07) | yok | `baselineOnly`, `baselineCm 38.3` |
| D3 | 38.3 | 38.9 (2026-10-05) | `active`, `deltaCm +0.6`, `trendMedianCm null` |
| D4 | 38.3 | 38.9, 38.7, 39.0 (üç ayrı gün) | `active`, `deltaCm +0.7` (son: 39.0), `trendMedianCm 38.9` |
| D5 | left 38.3 / right 37.6 (combined 38.0) | bicepsFlexed 38.6 | `active`, `deltaCm +0.6`, `sides` yok (son ölçümde taraf yok) |
| D6 | 38.3 | 38.9 (örnekler [38.2, 39.6], `confirmSpread`) | `active`, `noisy: true` → "gürültülü olabilir" notu |

**E. `seedInitialProfile` ve Zod**

| # | Girdi | Beklenen |
|---|---|---|
| E1 | İlk çalıştırma, `useProvidedValues:true` | `profiles.height_cm=187`; `weight_logs` 1 satır (107); `body_measurements` 6 satır (`waist 95, abdomen 114, shoulder 137, hip 119, chest 110, forearm 37`, hepsi `aggregation='single'`, `is_baseline=1`); `measurement_samples` 6 satır (`sample_index=1`); **biceps satırı yok**; `settings['seed.initialProfileApplied']` var |
| E2 | E1 sonrası ikinci çağrı | `{ skipped:'alreadyApplied' }`; satır sayıları değişmez |
| E3 | `useProvidedValues:false` | `{ skipped:'userDeclined' }`; hiçbir yazma |
| E4 | JSON `bicepsFlexed: 0` | `InitialProfileSchema` reddi (`positive`) — build testi |
| E5 | JSON `bicepsFlexed: null` | Kabul; `measurements.bicepsFlexed === null` (R119.2) |
| E6 | JSON `waist: -5` / `waist: 300` | Reddi |
| E7 | E1 + onboarding'de biceps "Sonra" | `resolver.biceps() === null` → D1; `forSite('waist')` → E1 satırı |
| E8 | `RecordMeasurementInputSchema` `{ samplesCm: [38.2], site: 'bicepsFlexed', commandId: uuid }` | Kabul; `isBaseline=false`, `confirmSpread=false` varsayılan |
| E9 | `{ …, localDateKey: '2026-9-7' }` | Reddi (regex) |
| E10 | `{ …, site: 'biceps' }` | Reddi (enum) |

### 11.6 İlgili gereksinimler

- **§96:** R96.1 (onboarding biceps adımı, 11.2.8), R96.2 (`bicepsLeftFlexed`/`bicepsRightFlexed`/`bicepsFlexed`, 11.2.4), R96.3 (`disabled` durumunda `0 cm` yok, 11.2.6), R96.4 (CTA metni birebir), R96.5 (KPI yalnızca baseline sonrası `active`).
- **§97:** R97.1–R97.2 (`MeasurementGuide`, 11.2.7), R97.3 (eşik ve üçüncü ölçüm önerisi, 11.2.2), R97.4 (`mean`/`median`/`single`, `confirmSpread`), R97.5 (`measurement_samples` + `final_value_cm` tek transaction, 11.2.3).
- **§119:** R119.1 (`data/initial-profile.json`, 11.2.9), R119.2 (biceps `null`, satır yok), R119.3 (nullable, `0` yasak), R119.4 (`CmSchema`, `NullableCmSchema`, 11.2.10).
- **Dolaylı:** R112.3 (`measured_at_utc` + `local_date_key` + `time_zone`), R117.1/R117.5 (hata tablosu, görsel fallback), R122.3 (`BicepsView.measurementIds` kanıt referansı), R123.2–R123.3 (gürültü notu, son 3 medyan trendi, tekil değer bağlamı), R95.6 (`BodyMeasurementRow`/`MeasurementSampleRow` import doğrulaması).
- **Kabul testleri:** AT-11 (`forSite('waist')`, `forSite('shoulder')` tüketicisi), AT-12 (D1), AT-20 (seed `explicit` baseline'ları ve `findForBaseline` → en son `completed` program).

### Tutarsızlık / açık nokta

1. **Baseline kuralı ifadesi (ÇÖZÜLDÜ; 02 §11.2 `is_baseline` önceliğiyle yeniden yazıldı, geç baseline etiketi dahil):** 02 §11.2 "program başlangıcına en yakın (±7 gün) ilk kayıt" der ve `is_baseline` kolonundan söz etmez; 03'te `is_baseline` vardır. Bu bölüm kuralı "`is_baseline=1` öncelikli; yoksa ±7 gün penceresinde \|gün farkı\| en küçük, eşitlikte en erken" olarak birleştirdi. "En yakın" ile "penceredeki ilk kayıt" farklı sonuç verebilir (C2); 02 metni netleştirilmeli.
2. **R96.2 alan adları vs. 03 site değerleri:** Spec `leftBicepsCm` / `rightBicepsCm` / `bicepsCm` alanlarından söz eder; 03'te bunlar kolon değil, `site` enum değerleridir (`bicepsLeftFlexed` / `bicepsRightFlexed` / `bicepsFlexed`). Eşleme bu bölümde tanımlandı; spec'e "site satırı olarak modellenir" notu eklenmeli.
3. **Zod sınırı vs. DB CHECK (ÇÖZÜLDÜ):** 02 §11.3 ve 03 §4 `.lt(300)` / `.lt(400)` olarak güncellendi; Zod ve DB CHECK artık aynı yönde.
4. **`body_measurements` içinde `command_id` yok:** `set_logs`'un aksine replay'de satır bulunamaz. Geçici kural: `body_measurements.id = commandId`. Kalıcı çözüm: `002_…` migration'ında `command_id TEXT UNIQUE` kolonu.
5. **`is_baseline=1` tekilliği DB'de zorlanmıyor:** Site başına tek açık baseline için partial unique index yok (`ux_meas_one_baseline_per_site ON body_measurements(site) WHERE is_baseline = 1` önerilir). Servis (`replaceExistingBaseline`) ve resolver (en erken kazanır) bunu yazılımda telafi eder.
6. **Baseline program bağımsız:** `body_measurements`'ta `program_id` yok; `is_baseline` globaldir. İkinci bir program (`completed`/`abandoned` sonrası yeni `programs` satırı) başlatıldığında eski baseline'ların ne olacağı 02/03'te tanımsız. v1 tek program varsayımıyla ilerlendi.
7. **Soft delete yok:** 03 §0 "kullanıcıya görünen silme = soft delete veya açık transaction; geçmiş asla cascade ile kaybolmaz" der; `body_measurements`'ta `is_deleted` yok ve `measurement_samples` `ON DELETE CASCADE`. Bu bölüm hard delete + onay diyaloğunu kabul etti; `is_deleted` kolonu düşünülmeli.
8. **Seed satırlarını ayırt eden kolon yok:** `note = 'seed:initial-profile'` sözleşmesi kullanıldı. Bir `source` kolonu (`'user' | 'seed' | 'import'`) daha temiz olur.
9. **02 §11.1 şema taslağı eksik:** `body_measurements(id, localDateKey, site, finalValueCm, aggregation, note)` taslağında `measured_at_utc`, `time_zone`, `is_baseline` yok; 03 DDL esas alındı.
10. **%1.5'in referansı:** 02'de "%1.5" neye göre belirtilmemiş; bu bölüm iki örneğin ortalamasını referans aldı. Küçük çevrelerde (< ~53 cm) mutlak taban 0.8 cm baskındır, büyük çevrelerde (bel/omuz/karın) yüzde baskındır.
11. **Divergent çiftin onayla kaydı için kalite bayrağı yok:** `confirmSpread` ile kaydedilen ölçüm DB'de işaretlenmez; `spreadCm` okuma anında örneklerden türetilir (`noisy`). Sorgulanabilirlik gerekirse `quality_flag` kolonu.
12. **`MeasurementGuide` ve asset adlandırması türetildi:** `MeasurementGuide` 02 §3 modül haritasında yok (yalnızca §11.1'de anılıyor); `domain/measurements/` altına konuldu. `GuideAssetKey`, `assets/measurement-guides/<key>.png` (+`@2x/@3x`) ve `GUIDE_IMAGES` bu bölümün türetimidir. R97.2 yalnızca waist/abdomen/shoulder/biceps için anatomik nokta tanımlar; hip/chest/forearm metinleri standart antropometrik pratiğe göre yazıldı ve ürün/koç onayı gerektirir; thigh/calf/neck metinleri yazılmadı.
13. **Türetilen isimler (02/03'te yok):** `QualityStatus`, `QualityAssessment`, `RecordMeasurementInput`/`RecordMeasurementResult`, `recordBatch`, `BicepsView`, `deriveBicepsView`, `ResolvedBaseline`, `BicepsBaseline`, `BicepsKpi`/`buildBicepsKpi`, `MeasurementGuideEntry`, `guideFor`, `MeasurementValidationError`, `SeedValidationError`, `SeedPreconditionError`, `SeedReport`, `InitialProfileSchema`, `BodyMeasurementRow`, `MeasurementSampleRow`, `settings` anahtarı `seed.initialProfileApplied`, `command_log.command_type = 'measurement.record'`, port adları `MeasurementReadPort`/`ProgramReadPort`, `findForBaseline`, `markBaseline`. Hepsi mevcut adlandırma kalıplarından türetildi.
14. **Seed kilosunun tarihi:** 107 kg `weight_logs`'a onboarding günüyle yazılır; program henüz yoktur. AT-10/AT-20'deki "başlangıç kilosu"nun bu satır mı, yoksa `start_date_key` civarı ilk ölçüm mü olduğu 02'de tanımsız (kilo için `BaselineResolver` benzeri kural yok).
15. **Ölçüm düzenleme yok:** Kaydedilmiş bir ölçümün örneklerini düzenlemek için 02/03'te akış ve denetim tablosu (`set_log_revisions` benzeri) yok. v1: sil + yeniden kaydet.
16. **Geç baseline etiketi (AT-20):** CTA ile Gün 40'ta alınan biceps baseline'ının Day 90 raporunda nasıl etiketleneceği tanımsız; KPI'da "Başlangıç: Gün N" gösterilmesi bu bölümün önerisidir.
17. **`evaluate(samples, site)` imzasındaki `site`:** 02 §11.1 imzasında var, v1'de eşik site-bağımsız olduğu için kullanılmıyor; site bazlı eşik istenirse burada genişletilir.


---

## 12. Zaman, localDateKey, DayRolloverObserver ve timezone senaryoları (§112, §113)

> Modül: `src/core/clock/`, `src/core/time/` (02 §3, §5). Bu bölüm uygulamanın **tek zaman sözleşmesini** tanımlar; diğer tüm motorlar buradaki yardımcıları kullanır.

### 12.1 Sözleşme

| Kural | Uygulama |
|-------|----------|
| Sıralama ve süre | Yalnızca `*_at_utc` (ISO-8601, `Z`) |
| Gün aidiyeti | Yalnızca `*_date_key` (`YYYY-MM-DD`), yazıldığı anda hesaplanır, **asla yeniden hesaplanmaz** (R112.2) |
| Denetim | `time_zone` (IANA), `workout_sessions`'ta ayrıca `utc_offset_minutes` |
| "Bugün" sorgusu | `WHERE local_date_key = :todayKey` — **UTC aralığı kullanmak yasaktır** (R112.2) |
| Oturuma bağlı kayıtlar | `set_logs`, `rest_timers`, `personal_records` günü = `workout_sessions.calendar_date_key` (02 §5.1 istisnası, R113.1) |

### 12.2 API

```ts
interface Clock { nowUtc(): Date; timeZone(): string; todayKey(): DateKey }

export function localDateKey(utc: Date, tz: string): DateKey {
  // Intl tabanlı; 'sv-SE' locale'i ISO benzeri YYYY-MM-DD üretir, ay/gün sıfır dolgulu
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utc);
}
export function utcOffsetMinutes(utc: Date, tz: string): number { /* Intl parça karşılaştırması */ }
export function stamp(clock: Clock): Timestamped {
  const now = clock.nowUtc(), tz = clock.timeZone();
  return { occurredAtUtc: now.toISOString(), localDateKey: localDateKey(now, tz), timeZone: tz, utcOffsetMinutes: utcOffsetMinutes(now, tz) };
}

// Test edilebilirlik: FakeClock saat VE timezone değiştirebilir
class FakeClock implements Clock {
  constructor(private iso: string, private tz = 'Europe/Istanbul') {}
  set(iso: string) { this.iso = iso } setTimeZone(tz: string) { this.tz = tz }
  advance(ms: number) { this.iso = new Date(Date.parse(this.iso) + ms).toISOString() }
  nowUtc() { return new Date(this.iso) } timeZone() { return this.tz }
  todayKey() { return localDateKey(this.nowUtc(), this.tz) }
}
```

### 12.3 `DayRolloverObserver`

```ts
class DayRolloverObserver {
  private lastKey: DateKey; private lastTz: string;
  start() {                                   // AppState 'active' + 60 sn'lik interval (foreground'da)
    this.tick();  AppState.addEventListener('change', s => { if (s === 'active') this.tick() });
    setInterval(() => this.tick(), 60_000);
  }
  private tick() {
    const key = clock.todayKey(), tz = clock.timeZone();
    if (tz !== this.lastTz) { this.lastTz = tz; bus.emit('TZ_CHANGED', { tz }) }
    if (key !== this.lastKey) { this.lastKey = key; bus.emit('DAY_CHANGED', { key }) }
  }
}
```

Aboneler: `ChallengeCalendar` (Day X/90), `MissedWorkoutResolver` (kaçırılan kartı), `Scheduler.ensurePlanned`, Dashboard KPI'ları, beslenme günlüğü, `missedCard.dismissedDateKey` sıfırlama. **Abone olmayan:** rest timer (zaten UTC damgasından türetir) ve aktif oturum (günü `calendar_date_key` ile sabittir).

### 12.4 Timezone değişimi (R112.4, AT-13)

| Etki | Davranış |
|------|----------|
| Mevcut kayıtlar | Dokunulmaz; `local_date_key` sabit kalır |
| `Day X / 90` | Yeni tz'nin `todayKey`'i ile türetilir; ±1 gün oynayabilir, bu **beklenen** ve UI'da "Saat dilimi değişti" alt metniyle açıklanır |
| Planlanan antrenman | Doğuya seyahatte anında `missed` görünebilir; kaçırılan kartı aynı üç seçeneği sunar (sessiz atlama yok, R88.3) |
| Aktif oturum | `time_zone` başlangıç değeri korunur; `calendar_date_key` değişmez; rest timer etkilenmez |
| Beslenme günlüğü | Yeni günler yeni tz'ye göre; geçmiş günler olduğu gibi |

**DST:** Türkiye'de kalıcı UTC+3 (DST yok), ancak seyahat için DST geçişi desteklenir: `localDateKey` her zaman `Intl` üzerinden hesaplandığı için 23 veya 25 saatlik günlerde de doğrudur. Gün sınırında (00:00 ± 1 sa) DST geçişi olan bölgelerde `DAY_CHANGED` iki kez tetiklenebilir; `lastKey` karşılaştırması bunu tekilleştirir.

### 12.5 Gün sınırı (R113)

- `WorkoutSession.calendar_date_key` varsayılanı = `localDateKey(started_at_utc, tz@start)`.
- `overrideCalendarDate(sessionId, dateKey)`: izinli aralık `[localDateKey(started_at) − 1, todayKey]`; `calendar_date_overridden=1`; aynı transaction'da oturumun `set_logs.local_date_key` ve `personal_records.local_date_key` satırları da taşınır.
- Geriye dönük giriş (beslenme, ölçüm, uyku): tarih seçici `local_date_key`'i **açıkça** ayarlar; `occurredAtUtc` yine gerçek yazma anıdır. Böylece "dün için giriş" gerçek saatle çelişmez.

### 12.6 Test vektörleri

| # | Senaryo | Adımlar (FakeClock) | Beklenen |
|---|---------|---------------------|----------|
| TV-12.01 (R113.1) | Gece yarısını aşan antrenman | İstanbul 23:50 `start` → 00:10 `finish` | `calendar_date_key` = başlangıç günü; `set_logs.local_date_key` aynı gün; `completed_at_utc` gerçek an |
| TV-12.02 (AT-13) | İstanbul 23:30 beslenme logu | `stamp()` | `local_date_key` = o gün; tz `Europe/Istanbul` |
| TV-12.03 (AT-13) | Uçuşla New York'a geçiş | `setTimeZone('America/New_York')`, saat aynı UTC | TV-12.02 kaydı **değişmez**; `todayKey` bir gün geri gidebilir; `Day X/90` ±1, UI açıklar |
| TV-12.04 (AT-13) | New York'ta 20:00 log | `stamp()` | `local_date_key` = NY tarihi (UTC'de ertesi gün) |
| TV-12.05 | Gece yarısı açık dashboard | 23:59 → 00:01 | Tek `DAY_CHANGED`; Day X/90 ve kaçırılan kartı yenilendi |
| TV-12.06 | Batıya seyahat, aynı gün iki kez | tz UTC+3 → UTC−5 | `DAY_CHANGED` tetiklenmez (anahtar geri gitse de `lastKey` farklıysa tetiklenir; test tetiklenme sayısını doğrular) |
| TV-12.07 | DST geçişi (Berlin, 25 saatlik gün) | 02:30 → 03:30 | `localDateKey` doğru; ikinci `DAY_CHANGED` yok |
| TV-12.08 (R113.4) | `overrideCalendarDate` | Oturum 8 Eyl, kullanıcı 7 Eyl seçer | Oturum + setler + PR'lar 7 Eyl'e taşındı; `calendar_date_overridden=1` |
| TV-12.09 | Override sınırı | Kullanıcı 5 Eyl (2 gün geri) seçer | `ValidationError`; UI seçiciyi zaten kısıtlar |
| TV-12.10 | "Bugünün logları" sorgusu | tz değişiminden sonra | `WHERE local_date_key = todayKey`; UTC aralığı kullanan bir sorgu testte yakalanır (SQL lint testi) |

### 12.7 İlgili gereksinimler

R112.1–R112.5, R113.1–R113.4, R90.3 (oturum kalıcılığı), R91.3 (timer UTC'den), R123.1.

### Tutarsızlık / açık nokta

- **`sv-SE` locale hilesi** yerine `Intl.DateTimeFormat().formatToParts` ile açık birleştirme de kullanılabilir; ikisi de test edilir (bazı RN/Hermes sürümlerinde `sv-SE` ICU verisi eksik olabilir → `formatToParts` fallback zorunlu).
- **Hermes ICU:** Expo'da tam ICU için `expo-localization` ve/veya `Intl` polyfill gerekebilir; teknoloji tablosuna (02 §2) `@formatjs/intl-*` polyfill'i eklenmesi gerekebilir — cihaz testiyle doğrulanmalı.
- **Batıya seyahatte `todayKey` geri gitmesi:** `challengeDay` monoton değildir (bir gün geri gidebilir). `ChallengeCalendar` monotonluk zorlamaz (kayıt bütünlüğü daha önemli); UI bunu açıklar. Alternatif (en yüksek görülen günü saklamak) reddedildi çünkü kayıtlarla tutarsızlık yaratır.
- **`overrideCalendarDate` bağlı kayıtları taşıması** 02 §5.1'e bu turda eklendi; 03'te ek kolon gerekmiyor.
- **SQL lint testi** (UTC aralığı ile gün sorgusu yasağı) için basit bir kaynak taraması gerekir: `local_date_key` içermeyen ve `completed_at_utc BETWEEN` kullanan sorgular uyarı üretir.
- **Türetilen adlar:** `stamp`, `utcOffsetMinutes`, `FakeClock`, `DayRolloverObserver`, `bus`, `DAY_CHANGED`, `TZ_CHANGED`, `overrideCalendarDate`.


---

