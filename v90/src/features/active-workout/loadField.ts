// Yük alanının biçimi — docs/v90/06-ux-flows.md A.3, R101.
//
// `exercises.load_progression_type` hangi alanın gösterileceğini, hangi
// kolona yazılacağını ve "+" tuşunun ne anlama geldiğini belirler. En kritik
// satır `assistanceLowerIsHarder`: orada "+" YARDIMI ARTIRIR, yani hareketi
// KOLAYLAŞTIRIR; ilerleme önerisi ise yardımı azaltır (R101.3). Bu ayrım tek
// yerde tanımlıdır ki ekranlar ters çeviremesin (AT-09).

import type { Exercise, LoadProgressionType, RawLoad } from '../../domain/types.ts';

export type LoadFieldKind = 'load' | 'assistance' | 'none' | 'machineLevel' | 'band' | 'distance';

export interface LoadField {
  kind: LoadFieldKind;
  /** i18n anahtarı; 'none' için alan gösterilmez. */
  labelKey: 'active.load' | 'active.assistance' | 'active.machineLevel' | 'active.band' | null;
  hintKey: 'active.assistance.hint' | null;
  /** `RawLoad` içindeki alan adı — set yazılırken kullanılır. */
  rawKey: keyof RawLoad | null;
  step: number;
  decimals: number;
  /** "+" tuşu hareketi zorlaştırır mı? assistanceLowerIsHarder'da false. */
  plusMeansHarder: boolean;
  /** Kıyas yalnızca tekrar üzerinden mi yapılır? */
  repsOnly: boolean;
  /** Kullanıcının vücut ağırlığı yüke dahil mi? */
  usesBodyweight: boolean;
}

const FIELDS: Record<LoadProgressionType, Omit<LoadField, 'step' | 'decimals'>> = {
  externalLoadHigherIsHarder: {
    kind: 'load', labelKey: 'active.load', hintKey: null, rawKey: 'loadKg',
    plusMeansHarder: true, repsOnly: false, usesBodyweight: false,
  },
  assistanceLowerIsHarder: {
    kind: 'assistance', labelKey: 'active.assistance', hintKey: 'active.assistance.hint',
    rawKey: 'assistanceKg',
    // "+" yardımı artırır → hareket KOLAYLAŞIR.
    plusMeansHarder: false, repsOnly: false, usesBodyweight: true,
  },
  bodyweight: {
    kind: 'none', labelKey: null, hintKey: null, rawKey: null,
    plusMeansHarder: true, repsOnly: true, usesBodyweight: true,
  },
  bodyweightPlusExternalLoad: {
    kind: 'load', labelKey: 'active.load', hintKey: null, rawKey: 'loadKg',
    plusMeansHarder: true, repsOnly: false, usesBodyweight: true,
  },
  machineLevel: {
    kind: 'machineLevel', labelKey: 'active.machineLevel', hintKey: null, rawKey: 'machineLevel',
    plusMeansHarder: true, repsOnly: false, usesBodyweight: false,
  },
  distanceOrBand: {
    kind: 'band', labelKey: 'active.band', hintKey: null, rawKey: 'bandRank',
    plusMeansHarder: true, repsOnly: false, usesBodyweight: false,
  },
};

/**
 * Adım büyüklüğü hareketin kendi artışından gelir (R100.1); makine seviyesi
 * ve band sıralaması her zaman 1'dir — ara değer yoktur.
 */
export function loadField(ex: Exercise): LoadField {
  const shape = FIELDS[ex.loadProgressionType];
  const discrete = shape.kind === 'machineLevel' || shape.kind === 'band';
  return {
    ...shape,
    step: discrete ? 1 : (ex.defaultIncrementKg ?? 2.5),
    decimals: discrete ? 0 : 2,
  };
}

/** Stepper değerini `RawLoad`'a çevirir; alan yoksa boş yük döner. */
export function toRawLoad(field: LoadField, value: number | null, bodyweightKg: number | null): RawLoad {
  const raw: RawLoad = {};
  if (field.rawKey && value !== null) {
    (raw as Record<string, number>)[field.rawKey] = value;
  }
  // Vücut ağırlığı bilinmiyorsa NULL kalır; 0 YAZILMAZ (R119.3).
  if (field.usesBodyweight && bodyweightKg !== null) raw.bodyweightKgSnapshot = bodyweightKg;
  return raw;
}

/** `RawLoad`'dan stepper değerini okur. */
export function fromRawLoad(field: LoadField, raw: RawLoad | null): number | null {
  if (!raw || !field.rawKey) return null;
  const v = (raw as Record<string, unknown>)[field.rawKey];
  return typeof v === 'number' ? v : null;
}
