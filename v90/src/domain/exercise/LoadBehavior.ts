// Effective load normalizasyonu — docs/v90/04-domain-engines.md §3, ADR-008.
//
// Sözleşme: effectiveLoad her zaman "daha büyük = daha zor" ölçeğindedir.
// Motorlar (progression, plateau, PR, hacim) ham alanları ASLA görmez; böylece
// assisted hareketlerde ters yorum yapısal olarak imkânsızdır (R101.1–R101.4).

import type { Exercise, LoadProgressionType, RawLoad } from '../types.ts';

export const BODYWEIGHT_DEPENDENT: ReadonlySet<LoadProgressionType> = new Set<LoadProgressionType>([
  'assistanceLowerIsHarder', 'bodyweight', 'bodyweightPlusExternalLoad',
]);

type LoadKind = Pick<Exercise, 'loadProgressionType'>;

export function effectiveLoad(raw: RawLoad, ex: LoadKind): number | null {
  switch (ex.loadProgressionType) {
    case 'externalLoadHigherIsHarder':
      return raw.loadKg ?? null;
    case 'assistanceLowerIsHarder': {
      if (raw.assistanceKg == null) return null;
      return raw.bodyweightKgSnapshot != null
        ? round2(raw.bodyweightKgSnapshot - raw.assistanceKg)   // gerçek kaldırılan yük
        : -raw.assistanceKg;                                     // ölçek yok; sıralama korunur
    }
    case 'bodyweight':
      return raw.bodyweightKgSnapshot ?? null;
    case 'bodyweightPlusExternalLoad':
      if (raw.bodyweightKgSnapshot == null && raw.loadKg == null) return null;
      return round2((raw.bodyweightKgSnapshot ?? 0) + (raw.loadKg ?? 0));
    case 'machineLevel':
      return raw.machineLevel ?? null;
    case 'distanceOrBand':
      return raw.bandRank ?? raw.distanceCm ?? null;
  }
}

/**
 * İki set aynı ölçekte mi? Bodyweight'e bağlı türlerde biri bodyweight biliyor
 * diğeri bilmiyorsa karşılaştırma anlamsızdır; motor sonuç üretmez (R123.1).
 */
export function comparable(a: RawLoad, b: RawLoad, ex: LoadKind): boolean {
  if (!BODYWEIGHT_DEPENDENT.has(ex.loadProgressionType)) return true;
  return (a.bodyweightKgSnapshot == null) === (b.bodyweightKgSnapshot == null);
}

/** Normalize hedefi kullanıcıya gösterilecek gerçek alana çevirir (R101.3). */
export function toRaw(nextEffective: number, ex: LoadKind, current: RawLoad): RawLoad {
  switch (ex.loadProgressionType) {
    case 'externalLoadHigherIsHarder':
      return { ...current, loadKg: round2(nextEffective) };
    case 'assistanceLowerIsHarder': {
      const bw = current.bodyweightKgSnapshot;
      const assist = bw != null ? bw - nextEffective : -nextEffective;
      return { ...current, assistanceKg: Math.max(0, round2(assist)) };
    }
    case 'bodyweight':
      return { ...current };                       // yük değişmez; §4 tekrar önerir
    case 'bodyweightPlusExternalLoad':
      return { ...current, loadKg: Math.max(0, round2(nextEffective - (current.bodyweightKgSnapshot ?? 0))) };
    case 'machineLevel':
      return { ...current, machineLevel: Math.round(nextEffective) };
    case 'distanceOrBand':
      return current.bandRank != null
        ? { ...current, bandRank: Math.round(nextEffective) }
        : { ...current, distanceCm: round2(nextEffective) };
  }
}

/** Yardım sıfıra indiyse hareket fiilen bodyweight'e döner (§3.3). */
export function assistanceExhausted(raw: RawLoad, ex: LoadKind): boolean {
  return ex.loadProgressionType === 'assistanceLowerIsHarder' && (raw.assistanceKg ?? 1) <= 0;
}

export const round2 = (x: number): number => Math.round(x * 100) / 100;
