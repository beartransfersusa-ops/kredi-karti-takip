// Ölçüm kalitesi — docs/v90/04-domain-engines.md §11.
// Tüm aritmetik onda-cm (tenths) tam sayıları üzerinde yapılır: kayan nokta
// yüzünden eşik karşılaştırması kaymaz.

export type Aggregation = 'single' | 'mean' | 'median';
export type QualityStatus = 'single' | 'pairWithinThreshold' | 'thirdRecommended' | 'triple';

export const SPREAD_ABS_MIN_CM = 0.8;    // R97.3 mutlak taban
export const SPREAD_REL = 0.015;         // %1,5 — referans: iki örneğin ortalaması

export interface QualityAssessment {
  status: QualityStatus;
  aggregation: Aggregation;
  finalValueCm: number;
  spreadCm: number | null;
  thresholdCm: number | null;
  /** Kullanıcı öneriye rağmen kaydedebilir (R97.4); UI ikincil eylem sunar. */
  recommendThird: boolean;
}

const toTenths = (cm: number) => Math.round(cm * 10);
const fromTenths = (t: number) => t / 10;

export function evaluate(samplesCm: readonly number[]): QualityAssessment {
  if (samplesCm.length < 1 || samplesCm.length > 3) {
    throw new Error('ölçüm başına 1–3 örnek olmalı');
  }
  if (samplesCm.some((v) => !(v > 0) || v >= 300)) {
    throw new Error('ölçüm 0 < v < 300 cm aralığında olmalı (R119.3)');
  }
  const t = samplesCm.map(toTenths);

  if (t.length === 1) {
    return { status: 'single', aggregation: 'single', finalValueCm: fromTenths(t[0]!),
      spreadCm: null, thresholdCm: null, recommendThird: false };
  }

  if (t.length === 2) {
    const meanT = (t[0]! + t[1]!) / 2;
    const thresholdT = Math.max(SPREAD_ABS_MIN_CM * 10, SPREAD_REL * meanT);
    const diffT = Math.abs(t[0]! - t[1]!);
    const divergent = diffT > thresholdT;                 // eşitlik = eşik AŞILMADI
    return {
      status: divergent ? 'thirdRecommended' : 'pairWithinThreshold',
      aggregation: 'mean',
      finalValueCm: fromTenths(Math.round(meanT)),        // .5 → yukarı
      spreadCm: fromTenths(diffT),
      thresholdCm: fromTenths(Math.round(thresholdT * 10) / 10),
      recommendThird: divergent,
    };
  }

  const sorted = [...t].sort((a, b) => a - b);
  return {
    status: 'triple', aggregation: 'median', finalValueCm: fromTenths(sorted[1]!),
    spreadCm: fromTenths(sorted[2]! - sorted[0]!), thresholdCm: null, recommendThird: false,
  };
}

/** Sol/sağ ayrı girildiyse birleşik görünüm (§11 B vektörleri). */
export function deriveBicepsView(sides: { leftCm?: number | null; rightCm?: number | null; storedCm?: number | null }):
  { combinedCm: number; source: 'stored' | 'meanOfSides' | 'singleSide' } | null {
  const { leftCm, rightCm, storedCm } = sides;
  if (leftCm != null && rightCm != null) {
    return { combinedCm: fromTenths(Math.round((toTenths(leftCm) + toTenths(rightCm)) / 2)), source: 'meanOfSides' };
  }
  if (storedCm != null) return { combinedCm: storedCm, source: 'stored' };
  const one = leftCm ?? rightCm;
  return one != null ? { combinedCm: one, source: 'singleSide' } : null;   // uydurma ortalama yok
}
