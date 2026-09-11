// V90 paylaşılan domain tipleri — docs/v90/03-data-model.md §3.
// Tek kaynak: bu dosya. SQL enum CHECK'leri ile birebir aynı değerleri taşır.

export type MuscleGroup =
  | 'chest' | 'lats' | 'upperBack' | 'rearDelts' | 'lateralDelts' | 'frontDelts'
  | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes'
  | 'calves' | 'abs' | 'lowerBack' | 'neck';

export type MovementPattern =
  | 'verticalPull' | 'horizontalPull' | 'verticalPush' | 'horizontalPush'
  | 'lateralRaise' | 'rearDeltFly' | 'elbowFlexion' | 'elbowExtension'
  | 'kneeDominant' | 'hipHinge' | 'kneeFlexion' | 'kneeExtension'
  | 'calfRaise' | 'trunkFlexion' | 'carry' | 'other';

export type EquipmentTag =
  | 'cableStation' | 'latPulldown' | 'chestSupportedRow' | 'plateLoadedMachine'
  | 'selectorizedMachine' | 'dumbbells' | 'barbells' | 'smithMachine' | 'hackSquat'
  | 'legPress' | 'legExtension' | 'legCurl' | 'pecDeck' | 'preacherBench'
  | 'adjustableBench' | 'pullupBar' | 'dipStation' | 'assistedPullupMachine'
  | 'resistanceBands' | 'bodyweightOnly';

export type LoadProgressionType =
  | 'externalLoadHigherIsHarder' | 'assistanceLowerIsHarder' | 'bodyweight'
  | 'bodyweightPlusExternalLoad' | 'machineLevel' | 'distanceOrBand';

export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'lowerBack' | 'hip' | 'knee' | 'ankle';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type ScheduledWorkoutStatus =
  | 'planned' | 'inProgress' | 'completed' | 'partiallyCompleted' | 'skipped' | 'rescheduled';
export type SessionStatus = 'active' | 'completed' | 'partial' | 'cancelled';
export type ProgramStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type CalendarMode = 'strictCalendar' | 'activeDays';
export type PauseReason = 'illness' | 'travel' | 'injury' | 'work' | 'personal' | 'other';
export type Side = 'both' | 'left' | 'right';
export type SetType = 'warmup' | 'working' | 'dropset' | 'backoff';
export type PrType = 'loadPr' | 'repPrAtLoad' | 'estimatedPerformancePr' | 'sessionVolumePr';
export type SequenceAdvanceCause = 'completed' | 'skipped' | 'partialCountedDone';
export type SequenceEventCause = SequenceAdvanceCause | 'manualAdjust';

/** 'YYYY-MM-DD' — kaydın ait olduğu yerel gün (02 §5.1). */
export type DateKey = string;

export interface Timestamped {
  occurredAtUtc: string;
  localDateKey: DateKey;
  timeZone: string;
  utcOffsetMinutes?: number;
}

/** loadProgressionType'a göre yalnızca biri anlamlıdır (03 §3). */
export interface RawLoad {
  loadKg?: number | null;
  assistanceKg?: number | null;
  machineLevel?: number | null;
  bandRank?: number | null;
  distanceCm?: number | null;
  bodyweightKgSnapshot?: number | null;
}

export interface Exercise {
  id: string;
  name: string;
  nameTr: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementPattern;
  equipment: EquipmentTag[];
  lengthenedBias: 0 | 1 | 2 | 3;
  skillLevel: SkillLevel;
  jointStressProfile: Partial<Record<Joint, 0 | 1 | 2 | 3>>;
  loadProgressionType: LoadProgressionType;
  isUnilateral: boolean;
  volumeMultiplier: 1;
  defaultIncrementKg?: number | null;
  availableLoadsKg?: number[] | null;
  cues: string[];
}

export interface ExerciseRelation {
  exerciseId: string;
  relatedExerciseId: string;
  relation: 'variant' | 'substitute';
  priority: number;
}

export interface WorkingSetRef {
  setLogId: string;
  setIndex: number;
  effectiveLoad: number | null;
  reps: number;
  rir: number | null;
  painFlag: boolean;
  formBreakdownFlag: boolean;
  excludeFromPr: boolean;
}

export interface ExposureTarget {
  repMin: number;
  repMax: number;
  targetRir: number;
  plannedWorkingSets: number;
}

/** Bir oturumda bir hareketin working setleri (03 §3). */
export interface Exposure {
  sessionId: string;
  calendarDateKey: DateKey;
  exerciseId: string;
  side: Side;
  workingSets: WorkingSetRef[];
  target: ExposureTarget;
  /** Karşılaştırılabilirlik için: bodyweight'e bağlı türlerde ölçek bilgisi (§3.2.1). */
  bodyweightKnown?: boolean;
}

export type RecommendationKind =
  | 'loadIncrease' | 'holdLoad' | 'loadDecrease' | 'repIncrease' | 'deload'
  | 'volumeIncrease' | 'volumeHold' | 'nutritionHold' | 'nutritionAdjust'
  | 'substitution' | 'plateauReview';

export interface RecommendationEvidence {
  setLogIds?: string[];
  measurementIds?: string[];
  checkInIds?: string[];
  sleepLogIds?: string[];
  metrics: Record<string, number>;
}

export interface Recommendation {
  kind: RecommendationKind;
  exerciseId?: string;
  muscle?: MuscleGroup;
  side?: Side;
  proposed: {
    effectiveLoad?: number;
    reps?: number;
    sets?: number;
    kcal?: number;
    reason?: string;
    raw?: RawLoad;
  };
  rationaleTr: string;
  evidence: RecommendationEvidence;
  isEstimate: boolean;
}

export interface RecommendationDecision {
  action: 'accepted' | 'modified' | 'ignored';
  proposedValue?: number;
  userValue?: number;
  decidedAtUtc: string;
}
