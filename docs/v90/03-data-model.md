# V90 – Veri Modeli (SQLite / SQLCipher)

> `02-architecture.md` §12 ile birlikte okunur. Bu belge **şema sürümü 1** (`001_initial`) için tam DDL'i, migration kurallarını, türetilmiş görünümleri ve TypeScript domain tiplerini tanımlar. DDL doğrudan `src/core/db/migrations/001_initial.ts` içine taşınır; testler aynı SQL'i Node SQLite üzerinde çalıştırır.

## 0. Genel kurallar

| Kural | Açıklama |
|-------|----------|
| Kimlikler | `TEXT` UUID v4 (`expo-crypto`). Seed kayıtları (exercises, foods) okunabilir slug kullanır (`lat-pulldown`). |
| Zaman | `*_at_utc TEXT` ISO-8601 (`2026-09-07T05:12:44.000Z`). Gün aidiyeti `*_date_key TEXT` (`YYYY-MM-DD`). Timezone `time_zone TEXT` (IANA), `utc_offset_minutes INTEGER`. |
| Boolean | `INTEGER` 0/1, `NOT NULL DEFAULT 0`. |
| Bilinmeyen | `NULL`. Ölçüm/sağlık kolonlarında `CHECK (x IS NULL OR x > 0)` (R119.3). |
| JSON kolonlar | `*_json TEXT` — Zod ile okunur/yazılır; sorgu gerekmeyen listeler için. |
| Enum | `TEXT` + `CHECK (col IN (...))`. |
| FK | `PRAGMA foreign_keys = ON`; silme çoğunlukla `ON DELETE RESTRICT`; geçmiş asla cascade ile kaybolmaz. Kullanıcıya görünen silme = soft delete (`is_deleted`) veya açık transaction. |
| Transaction | Her kullanıcı komutu tek `BEGIN IMMEDIATE … COMMIT`. |
| Backup | `data.json` tüm tabloları içerir; **tek kaynak** `TableRegistry` (tablo adı → Zod satır şeması) hem repository hem backup tarafından kullanılır. |

## 1. `001_initial` DDL

### 1.1 Sistem

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version        INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  checksum       TEXT NOT NULL,
  applied_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key            TEXT PRIMARY KEY,          -- 'appLock.enabled', 'appLock.graceSeconds', 'analytics.enabled',
  value_json     TEXT NOT NULL,             -- 'units.weight', 'notifications.restTimer', 'privacy.androidFlagSecure', …
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_history (
  id             TEXT PRIMARY KEY,
  key            TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  changed_at_utc TEXT NOT NULL
);

-- İdempotent komutlar (R117): aynı command_id ile tekrar gelen yazma no-op olur.
CREATE TABLE IF NOT EXISTS command_log (
  command_id     TEXT PRIMARY KEY,
  command_type   TEXT NOT NULL,
  executed_at_utc TEXT NOT NULL
);
```

### 1.2 Profil ve onboarding

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id                 TEXT PRIMARY KEY,
  display_name       TEXT,
  birth_year         INTEGER CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  sex                TEXT CHECK (sex IS NULL OR sex IN ('male','female','other')),
  height_cm          REAL CHECK (height_cm IS NULL OR height_cm > 0),
  created_at_utc     TEXT NOT NULL,
  updated_at_utc     TEXT NOT NULL,
  onboarding_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS training_profiles (
  profile_id               TEXT PRIMARY KEY REFERENCES profiles(id),
  experience               TEXT NOT NULL CHECK (experience IN ('beginner','intermediate','advanced')),
  gym_type                 TEXT NOT NULL CHECK (gym_type IN ('fullCommercialGym','homeGym','limitedGym')),
  typical_workout_minutes  INTEGER CHECK (typical_workout_minutes IS NULL OR typical_workout_minutes BETWEEN 15 AND 240),
  preferred_workout_days_json TEXT NOT NULL DEFAULT '[]',   -- [1,2,3,5] (0=Pazar … 6=Cumartesi)
  sleep_target_hours       REAL CHECK (sleep_target_hours IS NULL OR sleep_target_hours BETWEEN 4 AND 12),
  pain_areas_json          TEXT NOT NULL DEFAULT '[]',      -- ['shoulder','lowerBack']
  updated_at_utc           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment_profiles (
  id             TEXT PRIMARY KEY,
  preset         TEXT NOT NULL CHECK (preset IN ('fullCommercialGym','homeGym','limitedGym','custom')),
  available_json TEXT NOT NULL,             -- EquipmentTag[]
  updated_at_utc TEXT NOT NULL
);
```

### 1.3 Hareket kataloğu (§98–§101)

```sql
CREATE TABLE IF NOT EXISTS exercises (
  id                     TEXT PRIMARY KEY,                 -- 'lat-pulldown'
  name                   TEXT NOT NULL,
  name_tr                TEXT NOT NULL,
  primary_muscle         TEXT NOT NULL,                    -- MuscleGroup
  secondary_muscles_json TEXT NOT NULL DEFAULT '[]',
  movement_pattern       TEXT NOT NULL,                    -- MovementPattern
  equipment_json         TEXT NOT NULL DEFAULT '[]',       -- EquipmentTag[] (hepsi gerekli)
  lengthened_bias        INTEGER NOT NULL DEFAULT 0 CHECK (lengthened_bias BETWEEN 0 AND 3),
  skill_level            TEXT NOT NULL CHECK (skill_level IN ('beginner','intermediate','advanced')),
  joint_stress_json      TEXT NOT NULL DEFAULT '{}',       -- {"shoulder":2,"elbow":1}
  load_progression_type  TEXT NOT NULL CHECK (load_progression_type IN
                           ('externalLoadHigherIsHarder','assistanceLowerIsHarder','bodyweight',
                            'bodyweightPlusExternalLoad','machineLevel','distanceOrBand')),
  is_unilateral          INTEGER NOT NULL DEFAULT 0,
  volume_multiplier      REAL NOT NULL DEFAULT 1,
  default_increment_kg   REAL,                             -- NULL → ekipman varsayılanı
  available_loads_json   TEXT,                             -- [2,4,6,…] opsiyonel
  cues_json              TEXT NOT NULL DEFAULT '[]',       -- teknik ipuçları (video fallback)
  is_custom              INTEGER NOT NULL DEFAULT 0,       -- kullanıcı eklediyse 1
  seed_version           INTEGER,
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  created_at_utc         TEXT NOT NULL,
  updated_at_utc         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_exercises_primary ON exercises(primary_muscle, movement_pattern);

CREATE TABLE IF NOT EXISTS exercise_relations (
  id                  TEXT PRIMARY KEY,
  exercise_id         TEXT NOT NULL REFERENCES exercises(id),
  related_exercise_id TEXT NOT NULL REFERENCES exercises(id),
  relation            TEXT NOT NULL CHECK (relation IN ('variant','substitute')),
  priority            INTEGER NOT NULL DEFAULT 100,        -- küçük = önce
  UNIQUE (exercise_id, related_exercise_id, relation)
);

CREATE TABLE IF NOT EXISTS user_exercise_settings (
  exercise_id          TEXT PRIMARY KEY REFERENCES exercises(id),
  min_increment_kg     REAL CHECK (min_increment_kg IS NULL OR min_increment_kg > 0),
  available_loads_json TEXT,
  default_tracking_mode TEXT CHECK (default_tracking_mode IS NULL OR default_tracking_mode IN ('bothSame','separate')),
  notes                TEXT,
  updated_at_utc       TEXT NOT NULL
);
```

### 1.4 Program şablonu ve program (§88, §89)

```sql
CREATE TABLE IF NOT EXISTS program_templates (
  id             TEXT PRIMARY KEY,             -- 'v90'
  name           TEXT NOT NULL,
  version        INTEGER NOT NULL,
  is_cyclic      INTEGER NOT NULL DEFAULT 1,   -- sıra sona gelince başa döner
  created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id                  TEXT PRIMARY KEY,        -- 'v90-d5-vtaper-upper'
  program_template_id TEXT NOT NULL REFERENCES program_templates(id),
  sequence_order      INTEGER NOT NULL,        -- 0 tabanlı
  name                TEXT NOT NULL,           -- 'Day 5 – V-Taper Upper'
  name_tr             TEXT NOT NULL,
  estimated_minutes   INTEGER,
  UNIQUE (program_template_id, sequence_order)
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id                  TEXT PRIMARY KEY,
  workout_template_id TEXT NOT NULL REFERENCES workout_templates(id),
  order_index         INTEGER NOT NULL,
  exercise_id         TEXT NOT NULL REFERENCES exercises(id),
  working_sets        INTEGER NOT NULL CHECK (working_sets BETWEEN 1 AND 10),
  warmup_sets         INTEGER NOT NULL DEFAULT 0,
  rep_min             INTEGER NOT NULL,
  rep_max             INTEGER NOT NULL CHECK (rep_max >= rep_min),
  target_rir          INTEGER NOT NULL CHECK (target_rir BETWEEN 0 AND 5),
  rest_seconds        INTEGER NOT NULL DEFAULT 120,
  is_customized       INTEGER NOT NULL DEFAULT 0,          -- kullanıcı düzenlediyse 1
  UNIQUE (workout_template_id, order_index)
);

CREATE TABLE IF NOT EXISTS programs (
  id                      TEXT PRIMARY KEY,
  program_template_id     TEXT NOT NULL REFERENCES program_templates(id),
  name                    TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('active','paused','completed','abandoned')),
  start_date_key          TEXT NOT NULL,                   -- Day 1
  start_time_zone         TEXT NOT NULL,
  calendar_mode           TEXT NOT NULL DEFAULT 'strictCalendar'
                            CHECK (calendar_mode IN ('strictCalendar','activeDays')),
  training_sequence_index INTEGER NOT NULL DEFAULT 0,      -- sıradaki şablonun sequence_order'ı
  sequence_wraps          INTEGER NOT NULL DEFAULT 0,      -- kaç kez başa döndü
  duration_days           INTEGER NOT NULL DEFAULT 90,
  completed_at_utc        TEXT,
  created_at_utc          TEXT NOT NULL,
  updated_at_utc          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_programs_one_open ON programs(status) WHERE status IN ('active','paused');

CREATE TABLE IF NOT EXISTS program_pauses (
  id             TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL REFERENCES programs(id),
  reason         TEXT CHECK (reason IS NULL OR reason IN ('illness','travel','injury','work','personal','other')),
  note           TEXT,
  started_at_utc TEXT NOT NULL,
  start_date_key TEXT NOT NULL,
  ended_at_utc   TEXT,
  end_date_key   TEXT,                                     -- NULL = hâlâ dondurulmuş
  time_zone      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pauses_program ON program_pauses(program_id, start_date_key);

-- Sıra ilerlemelerinin denetim izi (R88.6): yalnızca burada listelenen nedenlerle ilerler.
CREATE TABLE IF NOT EXISTS sequence_events (
  id                    TEXT PRIMARY KEY,
  program_id            TEXT NOT NULL REFERENCES programs(id),
  from_index            INTEGER NOT NULL,
  to_index              INTEGER NOT NULL,
  cause                 TEXT NOT NULL CHECK (cause IN ('completed','skipped','partialCountedDone','manualAdjust')),
  scheduled_workout_id  TEXT,
  occurred_at_utc       TEXT NOT NULL
);
```

### 1.5 Planlanan antrenmanlar (§88 FSM)

```sql
CREATE TABLE IF NOT EXISTS scheduled_workouts (
  id                          TEXT PRIMARY KEY,
  program_id                  TEXT NOT NULL REFERENCES programs(id),
  sequence_index              INTEGER NOT NULL,
  workout_template_id         TEXT NOT NULL REFERENCES workout_templates(id),
  planned_date_key            TEXT NOT NULL,
  status                      TEXT NOT NULL CHECK (status IN
                                ('planned','inProgress','completed','partiallyCompleted','skipped','rescheduled')),
  rescheduled_to_id           TEXT REFERENCES scheduled_workouts(id),
  rescheduled_from_id         TEXT REFERENCES scheduled_workouts(id),
  reschedule_reason           TEXT CHECK (reschedule_reason IS NULL OR reschedule_reason IN
                                ('moveToToday','moveToDate','resume','partialContinuation','cancelSession')),
  remaining_exercise_ids_json TEXT,                        -- kısmi devam planı için
  partial_decision            TEXT CHECK (partial_decision IS NULL OR partial_decision IN ('countAsDone','continueLater')),
  resolved_at_utc             TEXT,
  created_at_utc              TEXT NOT NULL,
  updated_at_utc              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sched_program_status ON scheduled_workouts(program_id, status, planned_date_key);
-- Aynı anda yalnızca bir açık plan (R88: yalnızca sıradaki antrenman planlanır)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sched_one_open ON scheduled_workouts(program_id) WHERE status IN ('planned','inProgress');
-- Not: reschedule aynı transaction içinde ÖNCE eski satırı 'rescheduled' yapar, SONRA yeni 'planned' satırı ekler;
-- SQLite unique kısıtını ifade bazında denetlediği için sıra önemlidir.
```

### 1.6 Antrenman oturumu, setler, dinlenme (§90, §91, §102, §103, §107, §113)

```sql
CREATE TABLE IF NOT EXISTS workout_sessions (
  id                        TEXT PRIMARY KEY,
  program_id                TEXT REFERENCES programs(id),
  scheduled_workout_id      TEXT REFERENCES scheduled_workouts(id),
  workout_template_id       TEXT REFERENCES workout_templates(id),
  status                    TEXT NOT NULL CHECK (status IN ('active','completed','partial','cancelled')),
  started_at_utc            TEXT NOT NULL,
  completed_at_utc          TEXT,
  calendar_date_key         TEXT NOT NULL,                 -- varsayılan: started_at yerel tarihi (R113.3)
  calendar_date_overridden  INTEGER NOT NULL DEFAULT 0,
  time_zone                 TEXT NOT NULL,
  utc_offset_minutes        INTEGER NOT NULL,
  bodyweight_kg_snapshot    REAL CHECK (bodyweight_kg_snapshot IS NULL OR bodyweight_kg_snapshot > 0),
  ended_reason              TEXT CHECK (ended_reason IS NULL OR ended_reason IN
                              ('allDone','finishHereToday','resumeCardFinish','resumeCardCancel','userCancel')),
  note                      TEXT,
  created_at_utc            TEXT NOT NULL,
  updated_at_utc            TEXT NOT NULL
);
-- Tek aktif oturum (R90.3)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_single_active ON workout_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_sessions_date ON workout_sessions(calendar_date_key);

CREATE TABLE IF NOT EXISTS session_exercises (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES workout_sessions(id),
  order_index           INTEGER NOT NULL,
  exercise_id           TEXT NOT NULL REFERENCES exercises(id),
  original_exercise_id  TEXT REFERENCES exercises(id),     -- değiştirildiyse şablondaki hareket (R99.7)
  substitution_reason   TEXT,
  tracking_mode         TEXT NOT NULL DEFAULT 'bothSame' CHECK (tracking_mode IN ('bothSame','separate')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','inProgress','done','skipped')),
  planned_working_sets  INTEGER NOT NULL,
  planned_warmup_sets   INTEGER NOT NULL DEFAULT 0,
  rep_min               INTEGER NOT NULL,
  rep_max               INTEGER NOT NULL,
  target_rir            INTEGER NOT NULL,
  rest_seconds          INTEGER NOT NULL,
  draft_load_json       TEXT,                              -- tamamlanmamış set taslağı (R90.1)
  draft_reps            INTEGER,
  draft_rir             INTEGER,
  note                  TEXT,
  updated_at_utc        TEXT NOT NULL,
  UNIQUE (session_id, order_index)
);

CREATE TABLE IF NOT EXISTS set_logs (
  id                      TEXT PRIMARY KEY,
  command_id              TEXT NOT NULL UNIQUE,            -- idempotent tekrar (R117)
  session_id              TEXT NOT NULL REFERENCES workout_sessions(id),
  session_exercise_id     TEXT NOT NULL REFERENCES session_exercises(id),
  exercise_id             TEXT NOT NULL REFERENCES exercises(id),
  set_index               INTEGER NOT NULL,                -- 1 tabanlı, warmup ve working ayrı sayılır
  set_type                TEXT NOT NULL CHECK (set_type IN ('warmup','working','dropset','backoff')),
  side                    TEXT NOT NULL DEFAULT 'both' CHECK (side IN ('both','left','right')),
  -- ham yük alanları: load_progression_type'a göre yalnızca ilgili olanlar dolar (R101)
  load_kg                 REAL CHECK (load_kg IS NULL OR load_kg >= 0),
  assistance_kg           REAL CHECK (assistance_kg IS NULL OR assistance_kg >= 0),
  machine_level           INTEGER,
  band_rank               INTEGER,
  distance_cm             REAL,
  bodyweight_kg_snapshot  REAL,
  reps                    INTEGER NOT NULL CHECK (reps >= 0),
  rir                     INTEGER CHECK (rir IS NULL OR rir BETWEEN 0 AND 6),   -- 4+ UI'da 4 olarak saklanır
  rpe                     REAL,
  exclude_from_pr         INTEGER NOT NULL DEFAULT 0,      -- R107.3
  pain_flag               INTEGER NOT NULL DEFAULT 0,
  form_breakdown_flag     INTEGER NOT NULL DEFAULT 0,
  discarded               INTEGER NOT NULL DEFAULT 0,      -- iptal edilen oturumun setleri (silinmez)
  completed_at_utc        TEXT NOT NULL,
  local_date_key          TEXT NOT NULL,
  time_zone               TEXT NOT NULL,
  note                    TEXT,
  UNIQUE (session_exercise_id, set_index, side)
);
CREATE INDEX IF NOT EXISTS ix_setlogs_exercise_time ON set_logs(exercise_id, completed_at_utc);
CREATE INDEX IF NOT EXISTS ix_setlogs_session ON set_logs(session_id);

CREATE TABLE IF NOT EXISTS set_log_revisions (
  id             TEXT PRIMARY KEY,
  set_log_id     TEXT NOT NULL REFERENCES set_logs(id),
  before_json    TEXT NOT NULL,
  after_json     TEXT NOT NULL,
  revised_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rest_timers (
  id                     TEXT PRIMARY KEY,
  session_id             TEXT NOT NULL REFERENCES workout_sessions(id),
  session_exercise_id    TEXT REFERENCES session_exercises(id),
  set_log_id             TEXT REFERENCES set_logs(id),
  rest_started_at_utc    TEXT NOT NULL,                    -- R91.2
  rest_duration_seconds  INTEGER NOT NULL CHECK (rest_duration_seconds > 0),
  state                  TEXT NOT NULL CHECK (state IN ('running','completed','skipped')),
  notification_id        TEXT,
  updated_at_utc         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rest_single_running ON rest_timers(state) WHERE state = 'running';

CREATE TABLE IF NOT EXISTS personal_records (
  id               TEXT PRIMARY KEY,
  exercise_id      TEXT NOT NULL REFERENCES exercises(id),
  side             TEXT NOT NULL DEFAULT 'both' CHECK (side IN ('both','left','right')),
  pr_type          TEXT NOT NULL CHECK (pr_type IN ('loadPr','repPrAtLoad','estimatedPerformancePr','sessionVolumePr')),
  set_log_id       TEXT REFERENCES set_logs(id),
  session_id       TEXT NOT NULL REFERENCES workout_sessions(id),
  effective_load   REAL,
  reps             INTEGER,
  estimated_1rm    REAL,                                   -- 'tahmin' etiketiyle gösterilir (R123.4)
  session_volume   REAL,
  achieved_at_utc  TEXT NOT NULL,
  local_date_key   TEXT NOT NULL,
  superseded_by_id TEXT REFERENCES personal_records(id)
);
CREATE INDEX IF NOT EXISTS ix_pr_exercise_type ON personal_records(exercise_id, pr_type, side);
```

### 1.7 Öneriler, plateau, hacim hedefleri (§104, §105, §121, §122)

```sql
CREATE TABLE IF NOT EXISTS recommendations (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN
                         ('loadIncrease','holdLoad','loadDecrease','repIncrease','deload',
                          'volumeIncrease','volumeHold','nutritionHold','nutritionAdjust','substitution','plateauReview')),
  exercise_id          TEXT REFERENCES exercises(id),
  muscle               TEXT,
  session_exercise_id  TEXT REFERENCES session_exercises(id),
  proposed_json        TEXT NOT NULL,                      -- { effectiveLoad?, loadKg?, assistanceKg?, reps?, sets?, kcal? }
  rationale_tr         TEXT NOT NULL,                      -- R122
  evidence_json        TEXT NOT NULL,                      -- { setLogIds, measurementIds, metrics }
  is_estimate          INTEGER NOT NULL DEFAULT 0,
  created_at_utc       TEXT NOT NULL,
  expires_at_utc       TEXT,
  decision_action      TEXT CHECK (decision_action IS NULL OR decision_action IN ('accepted','modified','ignored')),
  decision_value_json  TEXT,
  decided_at_utc       TEXT,
  applied_session_id   TEXT REFERENCES workout_sessions(id)
);
CREATE INDEX IF NOT EXISTS ix_reco_open ON recommendations(exercise_id, decision_action, created_at_utc);

CREATE TABLE IF NOT EXISTS plateau_insights (
  id                        TEXT PRIMARY KEY,
  exercise_id               TEXT NOT NULL REFERENCES exercises(id),
  side                      TEXT NOT NULL DEFAULT 'both',
  detected_at_utc           TEXT NOT NULL,
  exposure_session_ids_json TEXT NOT NULL,                 -- 3 ardışık exposure
  checklist_json            TEXT NOT NULL,                 -- sıralı: recovery, sleep, adherence, rirAccuracy, technique, rest, suitability
  suggestions_json          TEXT NOT NULL,                 -- sameLoad | repTargetAdjust | substitution | deload
  status                    TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolution_note           TEXT,
  resolved_at_utc           TEXT
);

CREATE TABLE IF NOT EXISTS muscle_volume_targets (
  muscle                        TEXT PRIMARY KEY,
  baseline_weekly_direct_sets   INTEGER NOT NULL,
  max_recommended_weekly_sets   INTEGER NOT NULL,
  is_priority                   INTEGER NOT NULL DEFAULT 0,
  updated_at_utc                TEXT NOT NULL
);
```

### 1.8 Kilo, ölçüm, fotoğraf, uyku, kardiyo, check-in, supplement, lab (§96, §97, §116, §119)

```sql
CREATE TABLE IF NOT EXISTS weight_logs (
  id              TEXT PRIMARY KEY,
  measured_at_utc TEXT NOT NULL,
  local_date_key  TEXT NOT NULL,
  time_zone       TEXT NOT NULL,
  weight_kg       REAL NOT NULL CHECK (weight_kg > 0 AND weight_kg < 400),
  note            TEXT
);
CREATE INDEX IF NOT EXISTS ix_weight_date ON weight_logs(local_date_key);

CREATE TABLE IF NOT EXISTS body_measurements (
  id              TEXT PRIMARY KEY,
  measured_at_utc TEXT NOT NULL,
  local_date_key  TEXT NOT NULL,
  time_zone       TEXT NOT NULL,
  site            TEXT NOT NULL CHECK (site IN
                    ('waist','abdomen','shoulder','hip','chest','forearmLeft','forearmRight','forearm',
                     'bicepsLeftFlexed','bicepsRightFlexed','bicepsFlexed','thighLeft','thighRight','thigh',
                     'calfLeft','calfRight','calf','neck')),
  final_value_cm  REAL NOT NULL CHECK (final_value_cm > 0 AND final_value_cm < 300),   -- 0 asla (R119.3)
  aggregation     TEXT NOT NULL CHECK (aggregation IN ('single','mean','median')),
  is_baseline     INTEGER NOT NULL DEFAULT 0,
  note            TEXT
);
CREATE INDEX IF NOT EXISTS ix_meas_site_date ON body_measurements(site, local_date_key);

CREATE TABLE IF NOT EXISTS measurement_samples (
  id             TEXT PRIMARY KEY,
  measurement_id TEXT NOT NULL REFERENCES body_measurements(id) ON DELETE CASCADE,
  sample_index   INTEGER NOT NULL CHECK (sample_index BETWEEN 1 AND 3),
  value_cm       REAL NOT NULL CHECK (value_cm > 0),
  UNIQUE (measurement_id, sample_index)
);

CREATE TABLE IF NOT EXISTS progress_photos (
  id             TEXT PRIMARY KEY,
  taken_at_utc   TEXT NOT NULL,
  local_date_key TEXT NOT NULL,
  time_zone      TEXT NOT NULL,
  pose           TEXT NOT NULL CHECK (pose IN ('front','back','sideLeft','sideRight','frontFlexed','backFlexed','other')),
  file_name      TEXT NOT NULL UNIQUE,                     -- documentDirectory/photos/<file_name>
  bytes          INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  width          INTEGER,
  height         INTEGER,
  pending_delete INTEGER NOT NULL DEFAULT 0,               -- R116.4
  note           TEXT
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id               TEXT PRIMARY KEY,
  local_date_key   TEXT NOT NULL,                          -- uyanılan gün
  time_zone        TEXT NOT NULL,
  bedtime_utc      TEXT,
  wake_utc         TEXT,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 1440),
  quality          INTEGER CHECK (quality IS NULL OR quality BETWEEN 1 AND 5),
  note             TEXT
);
CREATE INDEX IF NOT EXISTS ix_sleep_date ON sleep_logs(local_date_key);

CREATE TABLE IF NOT EXISTS cardio_logs (
  id               TEXT PRIMARY KEY,
  started_at_utc   TEXT NOT NULL,
  local_date_key   TEXT NOT NULL,
  time_zone        TEXT NOT NULL,
  type             TEXT NOT NULL,                          -- 'walk','incline','bike','run','other'
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  distance_km      REAL CHECK (distance_km IS NULL OR distance_km >= 0),
  avg_hr           INTEGER CHECK (avg_hr IS NULL OR avg_hr BETWEEN 30 AND 250),
  note             TEXT
);

CREATE TABLE IF NOT EXISTS check_ins (
  id              TEXT PRIMARY KEY,
  created_at_utc  TEXT NOT NULL,
  local_date_key  TEXT NOT NULL,
  time_zone       TEXT NOT NULL,
  soreness        INTEGER CHECK (soreness IS NULL OR soreness BETWEEN 1 AND 5),
  energy          INTEGER CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
  stress          INTEGER CHECK (stress IS NULL OR stress BETWEEN 1 AND 5),
  motivation      INTEGER CHECK (motivation IS NULL OR motivation BETWEEN 1 AND 5),
  note            TEXT,
  UNIQUE (local_date_key)
);

CREATE TABLE IF NOT EXISTS supplements (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  dose           REAL,
  unit           TEXT,
  schedule_json  TEXT NOT NULL DEFAULT '{}',              -- { times: ['morning','preWorkout'] }
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  id             TEXT PRIMARY KEY,
  supplement_id  TEXT NOT NULL REFERENCES supplements(id),
  local_date_key TEXT NOT NULL,
  taken_at_utc   TEXT NOT NULL,
  slot           TEXT,
  UNIQUE (supplement_id, local_date_key, slot)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id               TEXT PRIMARY KEY,
  collected_at_utc TEXT,
  local_date_key   TEXT NOT NULL,
  panel            TEXT,                                   -- 'lipid','thyroid','cbc','hormone','vitamin','other'
  marker           TEXT NOT NULL,                          -- 'testosterone_total','ldl','ferritin',…
  value            REAL NOT NULL,
  unit             TEXT NOT NULL,
  reference_low    REAL,
  reference_high   REAL,
  lab_name         TEXT,
  note             TEXT
);
CREATE INDEX IF NOT EXISTS ix_lab_marker_date ON lab_results(marker, local_date_key);
```

### 1.9 Beslenme (§109–§111)

```sql
CREATE TABLE IF NOT EXISTS food_items (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  brand              TEXT,
  source             TEXT NOT NULL,                        -- 'seed:usda' | 'seed:tr-label' | 'user' | 'label-override'
  serving_unit       TEXT NOT NULL DEFAULT 'g',            -- 'g','ml','piece','scoop','slice'
  serving_size_g     REAL CHECK (serving_size_g IS NULL OR serving_size_g > 0),
  kcal_per_100g      REAL NOT NULL CHECK (kcal_per_100g >= 0),
  protein_g_per_100g REAL NOT NULL CHECK (protein_g_per_100g >= 0),
  carb_g_per_100g    REAL NOT NULL CHECK (carb_g_per_100g >= 0),
  fat_g_per_100g     REAL NOT NULL CHECK (fat_g_per_100g >= 0),
  fiber_g_per_100g   REAL,
  last_updated       TEXT NOT NULL,
  custom_edited      INTEGER NOT NULL DEFAULT 0,           -- seed güncellemeleri bunu ezmez (R111.3)
  seed_version       INTEGER,
  is_deleted         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_food_name ON food_items(name);

CREATE TABLE IF NOT EXISTS food_favorites (
  food_id      TEXT PRIMARY KEY REFERENCES food_items(id),
  added_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  cooked_yield_g REAL CHECK (cooked_yield_g IS NULL OR cooked_yield_g > 0),   -- NULL → ham toplam (R110.5)
  note           TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id     TEXT NOT NULL REFERENCES food_items(id),
  grams       REAL NOT NULL CHECK (grams > 0),
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_meals (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_meal_entries (
  id            TEXT PRIMARY KEY,
  saved_meal_id TEXT NOT NULL REFERENCES saved_meals(id) ON DELETE CASCADE,
  food_id       TEXT REFERENCES food_items(id),
  recipe_id     TEXT REFERENCES recipes(id),
  grams         REAL NOT NULL CHECK (grams > 0),
  order_index   INTEGER NOT NULL,
  CHECK ((food_id IS NULL) <> (recipe_id IS NULL))
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id             TEXT PRIMARY KEY,
  local_date_key TEXT NOT NULL,
  time_zone      TEXT NOT NULL,
  logged_at_utc  TEXT NOT NULL,
  meal_slot      TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack','preWorkout','postWorkout')),
  copied_from_id TEXT REFERENCES meal_logs(id),
  note           TEXT
);
CREATE INDEX IF NOT EXISTS ix_meals_date ON meal_logs(local_date_key, meal_slot);

CREATE TABLE IF NOT EXISTS meal_entries (
  id                 TEXT PRIMARY KEY,
  meal_log_id        TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  food_id            TEXT REFERENCES food_items(id),
  recipe_id          TEXT REFERENCES recipes(id),
  grams              REAL NOT NULL CHECK (grams > 0),
  -- anlık değerler: sonradan besin düzenlense de geçmiş değişmez
  kcal_snapshot      REAL NOT NULL,
  protein_g_snapshot REAL NOT NULL,
  carb_g_snapshot    REAL NOT NULL,
  fat_g_snapshot     REAL NOT NULL,
  order_index        INTEGER NOT NULL,
  CHECK ((food_id IS NULL) <> (recipe_id IS NULL))
);

CREATE TABLE IF NOT EXISTS nutrition_targets (
  id                      TEXT PRIMARY KEY,
  effective_from_date_key TEXT NOT NULL,
  kcal                    INTEGER NOT NULL CHECK (kcal > 0),
  protein_g               INTEGER NOT NULL,
  carb_g                  INTEGER,
  fat_g                   INTEGER,
  rationale_tr            TEXT,
  created_at_utc          TEXT NOT NULL
);
```

### 1.10 Türetilmiş görünümler

```sql
-- Tür-bilinçli effective load (R101.4). Bodyweight bilinmiyorsa NULL üretir; motor NULL'u reps tabanlı kıyasla ele alır.
CREATE VIEW IF NOT EXISTS v_set_effective_load AS
SELECT s.*,
  CASE e.load_progression_type
    WHEN 'externalLoadHigherIsHarder'  THEN s.load_kg
    WHEN 'assistanceLowerIsHarder'     THEN CASE WHEN s.bodyweight_kg_snapshot IS NOT NULL
                                               THEN s.bodyweight_kg_snapshot - COALESCE(s.assistance_kg,0)
                                               ELSE -COALESCE(s.assistance_kg,0) END
    WHEN 'bodyweight'                  THEN s.bodyweight_kg_snapshot
    WHEN 'bodyweightPlusExternalLoad'  THEN COALESCE(s.bodyweight_kg_snapshot,0) + COALESCE(s.load_kg,0)
    WHEN 'machineLevel'                THEN s.machine_level
    WHEN 'distanceOrBand'              THEN COALESCE(s.band_rank, s.distance_cm)
  END AS effective_load,
  e.load_progression_type
FROM set_logs s JOIN exercises e ON e.id = s.exercise_id
WHERE s.discarded = 0;

-- Haftalık direkt set sayımı (R106.2, R102.4): DISTINCT set_index ile unilateral çift sayım yok.
CREATE VIEW IF NOT EXISTS v_weekly_direct_sets AS
SELECT ws.calendar_date_key, e.primary_muscle AS muscle,
       COUNT(DISTINCT s.session_exercise_id || ':' || s.set_index) AS direct_sets
FROM set_logs s
JOIN workout_sessions ws ON ws.id = s.session_id
JOIN exercises e ON e.id = s.exercise_id
WHERE s.set_type = 'working' AND s.discarded = 0 AND ws.status IN ('completed','partial')
GROUP BY ws.calendar_date_key, e.primary_muscle;
```

## 2. Migration kuralları ve runner sözleşmesi (§92)

```ts
export interface Migration {
  version: number;                  // 1, 2, 3 … boşluksuz artan
  name: string;                     // '001_initial', '002_add_workout_state', …
  up: (tx: Tx) => Promise<void>;    // idempotent; DOWN yok (ileri-yalnız)
}

export const MIGRATIONS: readonly Migration[] = [m001Initial /* , m002… */];
```

- **İdempotency kuralları:** yalnızca `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE VIEW IF NOT EXISTS`; kolon eklerken `hasColumn(tx, table, col)` kontrolü; veri dönüşümlerinde `WHERE` ile zaten dönüşmüş satırları atla.
- **Değişmezlik:** yayınlanan migration dosyası bir daha değiştirilmez; `checksum` (dosya içeriği SHA-256) `schema_migrations`'ta saklanır ve açılışta doğrulanır; uyuşmazlık `DbIntegrityError`.
- **Sıra:** `PRAGMA user_version` == `MAX(schema_migrations.version)` olmalı; değilse runner onarımı dener (eksik satırı ekler) ve loglar.
- **Yedek:** bekleyen migration varsa `v90.sqlite → v90.bak.v<from>.sqlite` (WAL checkpoint sonrası) kopyalanır; kopya başarısızsa kullanıcıya "Alan yetersiz" ekranı, migration başlamaz.
- **Hata:** `ROLLBACK` → DB kapat → yedeği geri kopyala → `MigrationFailedScreen`. Uygulama eski şemayla **çalışmaz** (kod yeni şemayı bekler); yalnızca "Yedeği dışa aktar" ve "Tekrar dene" sunulur. Veri kaybı yok (R92.6).
- **Test fixture'ları:** `test/fixtures/db/v001.sql` (şema + temsili veri). Her yeni migration eklendiğinde bir önceki sürüm için fixture donduruluyor. Testler: `fresh→latest`, `v(k)→latest ∀k`, `latest→latest` (no-op), `fail-injection@k` (veri değişmedi).
- **Backup migrators:** `core/backup/migrators/00k.ts` — `data.json` için aynı sürüm numaralı saf JSON dönüşümleri; DB migration ile birlikte eklenmesi zorunlu (lint: her `MIGRATIONS[k]` için `BACKUP_MIGRATORS[k]` var mı).

Örnek gelecek migration (şablon, henüz repoda değil):

```ts
export const m002AddWorkoutState: Migration = {
  version: 2, name: '002_add_workout_state',
  async up(tx) {
    if (!(await hasColumn(tx, 'workout_sessions', 'perceived_effort'))) {
      await tx.exec(`ALTER TABLE workout_sessions ADD COLUMN perceived_effort INTEGER CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10)`);
    }
  },
};
```

## 3. TypeScript domain tipleri (özet)

```ts
export type MuscleGroup =
  | 'chest' | 'lats' | 'upperBack' | 'rearDelts' | 'lateralDelts' | 'frontDelts'
  | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs' | 'lowerBack' | 'neck';

export type MovementPattern =
  | 'verticalPull' | 'horizontalPull' | 'verticalPush' | 'horizontalPush' | 'lateralRaise' | 'rearDeltFly'
  | 'elbowFlexion' | 'elbowExtension' | 'kneeDominant' | 'hipHinge' | 'kneeFlexion' | 'kneeExtension'
  | 'calfRaise' | 'trunkFlexion' | 'carry' | 'other';

export type EquipmentTag =
  | 'cableStation' | 'latPulldown' | 'chestSupportedRow' | 'plateLoadedMachine' | 'selectorizedMachine'
  | 'dumbbells' | 'barbells' | 'smithMachine' | 'hackSquat' | 'legPress' | 'legExtension' | 'legCurl'
  | 'pecDeck' | 'preacherBench' | 'adjustableBench' | 'pullupBar' | 'dipStation' | 'assistedPullupMachine'
  | 'resistanceBands' | 'bodyweightOnly';

export type LoadProgressionType =
  | 'externalLoadHigherIsHarder' | 'assistanceLowerIsHarder' | 'bodyweight'
  | 'bodyweightPlusExternalLoad' | 'machineLevel' | 'distanceOrBand';

export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'lowerBack' | 'hip' | 'knee' | 'ankle';

export type ScheduledWorkoutStatus = 'planned' | 'inProgress' | 'completed' | 'partiallyCompleted' | 'skipped' | 'rescheduled';
export type SessionStatus = 'active' | 'completed' | 'partial' | 'cancelled';
export type ProgramStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type CalendarMode = 'strictCalendar' | 'activeDays';
export type PauseReason = 'illness' | 'travel' | 'injury' | 'work' | 'personal' | 'other';
export type Side = 'both' | 'left' | 'right';
export type SetType = 'warmup' | 'working' | 'dropset' | 'backoff';
export type PrType = 'loadPr' | 'repPrAtLoad' | 'estimatedPerformancePr' | 'sessionVolumePr';

export interface Timestamped { occurredAtUtc: string; localDateKey: string; timeZone: string; utcOffsetMinutes: number; }

export interface RawLoad {              // load_progression_type'a göre tek biri anlamlıdır
  loadKg?: number | null; assistanceKg?: number | null; machineLevel?: number | null;
  bandRank?: number | null; distanceCm?: number | null; bodyweightKgSnapshot?: number | null;
}

export interface SetLog {
  id: string; commandId: string; sessionId: string; sessionExerciseId: string; exerciseId: string;
  setIndex: number; setType: SetType; side: Side; raw: RawLoad; reps: number; rir: number | null; rpe?: number | null;
  excludeFromPr: boolean; painFlag: boolean; formBreakdownFlag: boolean; discarded: boolean;
  completedAtUtc: string; localDateKey: string; timeZone: string; note?: string | null;
}

export interface Exposure {             // motorların ortak girdisi (04-domain-engines.md)
  sessionId: string; calendarDateKey: string; exerciseId: string; side: Side;
  workingSets: Array<{ setIndex: number; effectiveLoad: number | null; reps: number; rir: number | null;
                       painFlag: boolean; formBreakdownFlag: boolean; excludeFromPr: boolean }>;
  target: { repMin: number; repMax: number; targetRir: number; plannedWorkingSets: number };
}

export interface Recommendation {
  id: string; kind: RecommendationKind; exerciseId?: string; muscle?: MuscleGroup; sessionExerciseId?: string;
  proposed: { effectiveLoad?: number; loadKg?: number; assistanceKg?: number; reps?: number; sets?: number; kcal?: number };
  rationaleTr: string; evidence: { setLogIds?: string[]; measurementIds?: string[]; metrics: Record<string, number> };
  isEstimate: boolean; createdAtUtc: string; expiresAtUtc?: string;
  decision?: { action: 'accepted' | 'modified' | 'ignored'; userValue?: unknown; decidedAtUtc: string };
}
```

## 4. Zod ve `TableRegistry`

```ts
export const TableRegistry = {
  profiles: ProfileRow, training_profiles: TrainingProfileRow, equipment_profiles: EquipmentProfileRow,
  exercises: ExerciseRow, exercise_relations: ExerciseRelationRow, user_exercise_settings: UserExerciseSettingsRow,
  program_templates: …, workout_templates: …, template_exercises: …, programs: …, program_pauses: …, sequence_events: …,
  scheduled_workouts: …, workout_sessions: …, session_exercises: …, set_logs: …, set_log_revisions: …, rest_timers: …,
  personal_records: …, recommendations: …, plateau_insights: …, muscle_volume_targets: …,
  weight_logs: …, body_measurements: …, measurement_samples: …, progress_photos: …, sleep_logs: …, cardio_logs: …,
  check_ins: …, supplements: …, supplement_logs: …, lab_results: …,
  food_items: …, food_favorites: …, recipes: …, recipe_ingredients: …, saved_meals: …, saved_meal_entries: …,
  meal_logs: …, meal_entries: …, nutrition_targets: …, settings: …, settings_history: …,
} as const satisfies Record<string, z.ZodTypeAny>;
// Test: TableRegistry anahtarları == sqlite_master'daki kullanıcı tabloları (schema_migrations, command_log hariç). Eksik tablo = test hatası → R95.1 garanti.
```

Zod kuralları (R119.4): `cm: z.number().positive().max(300).nullable()`, `kg: z.number().positive().max(400)`, tarih anahtarı `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, UTC `z.string().datetime({ offset: false })`.
