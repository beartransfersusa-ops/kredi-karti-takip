// Antrenman sırası — docs/v90/04-domain-engines.md §1, 02 §6.3, ADR-001.
//
// R88.6: sıra YALNIZCA üç nedenle ilerler — tamamlanma, açık atlama, kısmi
// antrenmanın "bitmiş say" kararı. Kaçırılan antrenman sırayı ilerletmez;
// bu, "sessiz atlama yok" güvencesinin uygulama karşılığıdır.

import type { SequenceAdvanceCause, SequenceEventCause } from '../types.ts';

export interface SequenceState {
  trainingSequenceIndex: number;
  sequenceWraps: number;
}

export interface SequenceAdvanceResult extends SequenceState {
  fromIndex: number;
  cause: SequenceEventCause;
  wrapped: boolean;
  /** Lineer programda şablonlar tükendi (nöbetçi değer). */
  isExhausted: boolean;
}

export class InvalidSequenceCauseError extends Error {
  constructor(cause: string) {
    super(`sırayı ilerletmek için geçersiz neden: ${cause}`);
    this.name = 'InvalidSequenceCauseError';
  }
}

const ADVANCE_CAUSES: ReadonlySet<string> = new Set<SequenceAdvanceCause>([
  'completed', 'skipped', 'partialCountedDone',
]);

export function advanceSequence(
  state: SequenceState,
  cause: SequenceAdvanceCause,
  templateCount: number,
  isCyclic: boolean,
): SequenceAdvanceResult {
  if (!ADVANCE_CAUSES.has(cause)) throw new InvalidSequenceCauseError(cause);
  if (templateCount <= 0) throw new Error('şablon listesi boş');

  const from = state.trainingSequenceIndex;
  const next = from + 1;

  if (next < templateCount) {
    return { trainingSequenceIndex: next, sequenceWraps: state.sequenceWraps, fromIndex: from, cause, wrapped: false, isExhausted: false };
  }
  if (isCyclic) {
    return { trainingSequenceIndex: 0, sequenceWraps: state.sequenceWraps + 1, fromIndex: from, cause, wrapped: true, isExhausted: false };
  }
  // Lineer program: indeks nöbetçi değerde kalır, program tamamlama akışı tetiklenir.
  return { trainingSequenceIndex: templateCount, sequenceWraps: state.sequenceWraps, fromIndex: from, cause, wrapped: false, isExhausted: true };
}

/**
 * Manuel düzeltme (02 §6.5) — advanceSequence'ten GEÇMEZ, yalnızca kullanıcının
 * açık ve onaylı eylemiyle çağrılır. R88.6'nın tek, kullanıcı-açık istisnasıdır.
 */
export function manualAdjust(state: SequenceState, toIndex: number, templateCount: number): SequenceAdvanceResult {
  if (toIndex < 0 || toIndex >= templateCount) throw new Error(`indeks aralık dışı: ${toIndex}`);
  return {
    trainingSequenceIndex: toIndex, sequenceWraps: state.sequenceWraps,
    fromIndex: state.trainingSequenceIndex, cause: 'manualAdjust', wrapped: false, isExhausted: false,
  };
}
