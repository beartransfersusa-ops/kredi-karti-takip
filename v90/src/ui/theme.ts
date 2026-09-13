// Tasarım belirteçleri — docs/v90/06-ux-flows.md A.0/B.0.
//
// Uygulama `userInterfaceStyle: 'automatic'`; iki palet de tanımlıdır ve
// renk yalnızca belirteçler üzerinden kullanılır (ekranlarda ham hex yok).
import { useColorScheme } from 'react-native';
import type { TextStyle } from 'react-native';

export interface Palette {
  bg: string; surface: string; surfaceAlt: string; border: string;
  text: string; textMuted: string; textFaint: string;
  primary: string; onPrimary: string; primarySoft: string;
  danger: string; dangerSoft: string; warning: string; warningSoft: string;
  success: string; successSoft: string;
  overlay: string;
}

const light: Palette = {
  bg: '#F6F6F4', surface: '#FFFFFF', surfaceAlt: '#F0F0EE', border: '#E2E2DE',
  text: '#16150F', textMuted: '#5C5A50', textFaint: '#8A887C',
  primary: '#1F6F4A', onPrimary: '#FFFFFF', primarySoft: '#E3F1E9',
  danger: '#A8321F', dangerSoft: '#FBE7E3', warning: '#8A5A00', warningSoft: '#FBF0DC',
  success: '#1F6F4A', successSoft: '#E3F1E9',
  overlay: 'rgba(10,10,8,0.45)',
};

const dark: Palette = {
  bg: '#111310', surface: '#1A1D19', surfaceAlt: '#222620', border: '#31362E',
  text: '#F2F3EE', textMuted: '#A9AEA2', textFaint: '#7C8177',
  primary: '#6FD39B', onPrimary: '#0D1F16', primarySoft: '#1B2E23',
  danger: '#F0968A', dangerSoft: '#33201D', warning: '#E3B765', warningSoft: '#33291A',
  success: '#6FD39B', successSoft: '#1B2E23',
  overlay: 'rgba(0,0,0,0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  // Set tablosundaki sayılar: hizalı kalsın diye tabular.
  // Set tablosundaki rakamlar sabit genişlikte: 8 ile 11 arasında zıplamasın.
  numeric: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Dokunma hedefi alt sınırı (iOS HIG / Material). Antrenmanda terli parmak. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TAP = 44;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const palettes = { light, dark };
