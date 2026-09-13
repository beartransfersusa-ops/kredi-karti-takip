// Türkçe metin erişimi — docs/v90/06-ux-flows.md.
//
// Sözlük ÜRETİLİR (scripts/extract-i18n.py); burada yalnızca yerine koyma var.
// `TrParams` sayesinde eksik ya da fazla yer tutucu DERLEME hatasıdır:
//   t('home.day')                 → hata, {X} eksik
//   t('home.day', { X: 12 })      → "Day 12 / 90"
import { tr } from './tr.generated.ts';
import type { TrKey, TrParams } from './tr.generated.ts';

export { tr };
export type { TrKey, TrParams };

type ParamsOf<K extends TrKey> = TrParams[K];

/** Yer tutucusu olmayan anahtarlar ikinci argüman almaz. */
export function t<K extends TrKey>(
  ...args: ParamsOf<K> extends undefined ? [key: K] : [key: K, params: ParamsOf<K>]
): string {
  const [key, params] = args;
  const text: string = tr[key];
  if (params === undefined) return text;
  const p = params as Record<string, string | number>;
  return text.replace(/\{([^{}\s]+)\}/g, (whole, name: string) =>
    // Sözlükte olup burada verilmeyen yer tutucu olamaz (tip denetimi);
    // yine de metin bozulmasın diye ham hâli bırakılır.
    Object.prototype.hasOwnProperty.call(p, name) ? String(p[name]) : whole);
}

/** Türkçe gün adları — Intl'e bağlı kalmadan deterministik çıktı. */
export const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;
export const WEEKDAYS_SHORT_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
export const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
