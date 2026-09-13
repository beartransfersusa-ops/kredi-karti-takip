// Öneri kartı modeli — docs/v90/06-ux-flows.md A.7 (R121, R122).
//
// Motor hiçbir şeyi otomatik uygulamaz; kart bir `recommendations` satırının
// doğrudan görünümüdür ve kullanıcı Kabul / Değiştir / Yok say ile kapatır.
// Karar GEÇMİŞTE saklanır: sonraki öneriler bunu girdi alır (02 §9.6).
import type { RawLoad, RecommendationKind } from '../../domain/types.ts';

export interface RecommendationRow {
  id: string;
  kind: string;
  exercise_id: string | null;
  muscle: string | null;
  session_exercise_id: string | null;
  proposed_json: string;
  rationale_tr: string;
  evidence_json: string;
  is_estimate: number;
  created_at_utc: string;
  local_date_key: string;
  expires_at_utc: string | null;
  decision_action: string | null;
  decision_value_json: string | null;
  decided_at_utc: string | null;
}

export interface Proposed {
  effectiveLoad?: number;
  reps?: number;
  sets?: number;
  kcal?: number;
  reason?: string;
  raw?: RawLoad;
}

export interface Evidence {
  setLogIds?: string[];
  metrics?: Record<string, string | number>;
  [k: string]: unknown;
}

export type Decision = 'accepted' | 'modified' | 'ignored';

export interface RecommendationCard {
  id: string;
  kind: RecommendationKind;
  exerciseId: string | null;
  proposed: Proposed;
  rationaleTr: string;
  /** "Neden önerildi?" akordeonundaki kanıt çipleri (R122.3). */
  evidenceChips: string[];
  setLogIds: string[];
  isEstimate: boolean;
  decision: Decision | null;
  decisionValue: number | null;
  /** Karar verilmiş kart daraltılır. */
  collapsed: boolean;
}

/** Süresi dolmuş öneri GÖSTERİLMEZ; `decision_action` NULL kalır (A.7). */
export function isVisible(row: RecommendationRow, nowUtc: Date): boolean {
  if (row.decision_action !== null) return true;      // karar verilmiş kart daraltılmış gösterilir
  if (!row.expires_at_utc) return true;
  return Date.parse(row.expires_at_utc) > nowUtc.getTime();
}

export function toCard(row: RecommendationRow): RecommendationCard {
  const proposed = safeParse<Proposed>(row.proposed_json, {});
  const evidence = safeParse<Evidence>(row.evidence_json, {});
  const decision = (row.decision_action as Decision | null) ?? null;
  const decisionValue = row.decision_value_json
    ? extractValue(safeParse<Proposed | number>(row.decision_value_json, {}))
    : null;

  return {
    id: row.id,
    kind: row.kind as RecommendationKind,
    exerciseId: row.exercise_id,
    proposed,
    rationaleTr: row.rationale_tr,
    evidenceChips: evidenceChips(evidence),
    setLogIds: evidence.setLogIds ?? [],
    isEstimate: row.is_estimate === 1,
    decision,
    decisionValue,
    collapsed: decision !== null,
  };
}

/** `evidence_json.metrics` → "Son 3 set: 12 · 12 · 12" gibi okunur çipler. */
export function evidenceChips(evidence: Evidence): string[] {
  const metrics = evidence.metrics;
  if (!metrics) return [];
  return Object.entries(metrics).map(([key, value]) => `${METRIC_LABEL[key] ?? key}: ${value}`);
}

const METRIC_LABEL: Record<string, string> = {
  lastReps: 'Son set tekrarları',
  lastRir: 'Son set RIR',
  incrementKg: 'Artış adımı (kg)',
  currentLoad: 'Mevcut yük (kg)',
  targetReps: 'Hedef tekrar',
  exposures: 'İncelenen antrenman',
  weeklySets: 'Haftalık set',
};

/**
 * Karttaki tek sayısal değer — "Değiştir" stepper'ının başlangıcı ve
 * "Kabul edildi · 82.5 kg" metnindeki değer.
 */
export function primaryValue(proposed: Proposed): number | null {
  if (proposed.raw?.assistanceKg !== undefined && proposed.raw.assistanceKg !== null) {
    return proposed.raw.assistanceKg;
  }
  if (proposed.effectiveLoad !== undefined) return proposed.effectiveLoad;
  if (proposed.reps !== undefined) return proposed.reps;
  if (proposed.sets !== undefined) return proposed.sets;
  return null;
}

/** Kartın birim etiketi; tekrar/set önerilerinde "kg" yazılmaz. */
export function unitOf(kind: RecommendationKind, proposed: Proposed): 'kg' | 'tekrar' | 'set' | null {
  if (kind === 'repIncrease' || proposed.reps !== undefined) return 'tekrar';
  if (kind === 'volumeIncrease' || kind === 'volumeHold' || proposed.sets !== undefined) return 'set';
  if (primaryValue(proposed) === null) return null;
  return 'kg';
}

/**
 * Prefill'e yansıyacak değer (02 §7.3 kaynak 3).
 *
 * Yalnızca `accepted`/`modified` kararlar prefill'i etkiler; `ignored` olan
 * öneri prefill'i kaynak 2'ye (son antrenman) bırakır (A.7 adım 5).
 */
export function prefillValue(card: RecommendationCard): { value: number; source: 'recommended' | 'userValue' } | null {
  if (card.decision === 'accepted') {
    const v = card.decisionValue ?? primaryValue(card.proposed);
    return v === null ? null : { value: v, source: 'recommended' };
  }
  if (card.decision === 'modified' && card.decisionValue !== null) {
    return { value: card.decisionValue, source: 'userValue' };
  }
  return null;
}

function extractValue(v: Proposed | number): number | null {
  if (typeof v === 'number') return v;
  return primaryValue(v);
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}
