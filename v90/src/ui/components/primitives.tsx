// Temel bileşenler — docs/v90/06-ux-flows.md A.0 (durum modeli, hata görünümü).
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText,
  View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { HIT_SLOP, MIN_TAP, radius, space, type, usePalette } from '../theme.ts';
import type { TypeVariant } from '../theme.ts';
import { t } from '../i18n/index.ts';

type Variant = TypeVariant;

export function Text(p: {
  children: React.ReactNode;
  variant?: Variant;
  color?: 'text' | 'muted' | 'faint' | 'danger' | 'warning' | 'primary';
  style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const c = usePalette();
  const tone = {
    text: c.text, muted: c.textMuted, faint: c.textFaint,
    danger: c.danger, warning: c.warning, primary: c.primary,
  };
  return (
    <RNText
      numberOfLines={p.numberOfLines}
      style={[type[p.variant ?? 'body'], { color: tone[p.color ?? 'text'] }, p.style]}
    >
      {p.children}
    </RNText>
  );
}

export function Card(p: { children: React.ReactNode; tone?: 'default' | 'warning' | 'danger'; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const bg = p.tone === 'warning' ? c.warningSoft : p.tone === 'danger' ? c.dangerSoft : c.surface;
  return (
    <View style={[{
      backgroundColor: bg, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg, padding: space.lg, gap: space.md,
    }, p.style]}>
      {p.children}
    </View>
  );
}

export type ButtonKind = 'primary' | 'secondary' | 'destructive' | 'ghost';

export function Button(p: {
  label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean;
  busy?: boolean; style?: StyleProp<ViewStyle>; accessibilityHint?: string;
}) {
  const c = usePalette();
  const kind = p.kind ?? 'secondary';
  const off = p.disabled || p.busy;
  const bg = kind === 'primary' ? c.primary : kind === 'destructive' ? c.dangerSoft
    : kind === 'ghost' ? 'transparent' : c.surfaceAlt;
  const fg = kind === 'primary' ? c.onPrimary : kind === 'destructive' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!p.busy }}
      accessibilityHint={p.accessibilityHint}
      disabled={off}
      onPress={p.onPress}
      style={({ pressed }) => [{
        minHeight: MIN_TAP, paddingHorizontal: space.lg, paddingVertical: space.md,
        borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
        opacity: off ? 0.45 : pressed ? 0.75 : 1,
        borderWidth: kind === 'ghost' ? 0 : StyleSheet.hairlineWidth,
        borderColor: kind === 'destructive' ? c.danger : c.border,
        flexDirection: 'row', gap: space.sm,
      }, p.style]}
    >
      {p.busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <RNText style={[type.heading, { color: fg }]}>{p.label}</RNText>
    </Pressable>
  );
}

export function Badge(p: { label: string; tone?: 'neutral' | 'estimate' | 'primary' | 'warning' }) {
  const c = usePalette();
  const map = {
    neutral: [c.surfaceAlt, c.textMuted],
    // "tahmin" rozeti (R123.4) — kesinlik iddiası taşımayan her değerde.
    estimate: [c.warningSoft, c.warning],
    primary: [c.primarySoft, c.primary],
    warning: [c.warningSoft, c.warning],
  } as const;
  const [bg, fg] = map[p.tone ?? 'neutral'];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
      <RNText style={[type.caption, { color: fg, fontWeight: '600' }]}>{p.label}</RNText>
    </View>
  );
}

export function Row(p: { children: React.ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: p.gap ?? space.sm,
      flexWrap: p.wrap ? 'wrap' : 'nowrap',
    }, p.style]}>
      {p.children}
    </View>
  );
}

/**
 * Satır içi yazma hatası (A.0): "Kaydedilemedi. Boş alanı kontrol et." +
 * Yeniden dene. Aynı `command_id` ile tekrar denenir, bu yüzden çift kayıt
 * riski yoktur.
 */
export function ErrorBar(p: { message?: string; onRetry?: () => void; details?: string }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <Text color="danger">{p.message ?? t('error.dbWrite')}</Text>
      <Row>
        {p.onRetry ? <Button label={t('common.retry')} onPress={p.onRetry} kind="secondary" /> : null}
        {p.details
          ? <Button label={open ? 'Ayrıntıları gizle' : t('common.details')} kind="ghost" onPress={() => setOpen((v) => !v)} />
          : null}
      </Row>
      {open && p.details ? <Text variant="caption" color="muted">{p.details}</Text> : null}
    </View>
  );
}

/** İlk `hydrate` sırasında; kullanıcı eylemleri ASLA spinner ile bloklanmaz. */
export function Skeleton(p: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const c = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: p.height ?? 16, width: p.width ?? '100%',
        backgroundColor: c.surfaceAlt, borderRadius: p.radius ?? radius.sm,
      }}
    />
  );
}

export function Divider() {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function Screen(p: { children: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const inner = (
    <View style={[{ padding: space.lg, gap: space.lg }, p.style]}>{p.children}</View>
  );
  if (p.scroll === false) return <View style={{ flex: 1, backgroundColor: c.bg }}>{inner}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  );
}

export function Segmented<T extends string>(p: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T; onChange: (v: T) => void; disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md,
      padding: 2, opacity: p.disabled ? 0.45 : 1,
    }}>
      {p.options.map((o) => {
        const on = o.value === p.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !!p.disabled }}
            disabled={p.disabled}
            onPress={() => p.onChange(o.value)}
            style={{
              flex: 1, minHeight: MIN_TAP - 8, alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.sm, backgroundColor: on ? c.surface : 'transparent',
            }}
          >
            <RNText style={[type.label, { color: on ? c.text : c.textMuted }]}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Sayı girişi — `[−step] 80 [+step]` (A.3 adım 2).
 * Basılı tutunca hızlanır; `null` "bilinmiyor" demektir ve 0'a dönüştürülmez
 * (R119.3).
 */
export function NumericStepper(p: {
  value: number | null; onChange: (v: number) => void; step: number;
  min?: number; max?: number; label: string; hint?: string;
  decimals?: number; disabled?: boolean;
}) {
  const c = usePalette();
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = useRef(0);
  useEffect(() => () => { if (hold.current) clearInterval(hold.current); }, []);

  const clamp = (v: number) => Math.min(p.max ?? Number.MAX_SAFE_INTEGER, Math.max(p.min ?? 0, v));
  const bump = (dir: 1 | -1) => {
    const base = p.value ?? p.min ?? 0;
    const next = clamp(round(base + dir * p.step, p.decimals ?? 2));
    if (next !== p.value) p.onChange(next);
  };
  const startHold = (dir: 1 | -1) => {
    bump(dir);
    speed.current = 0;
    hold.current = setInterval(() => {
      speed.current += 1;
      // İlk saniye normal, sonra hızlanır: uzun mesafeyi de parmakla al.
      for (let i = 0; i < (speed.current > 8 ? 5 : speed.current > 4 ? 2 : 1); i++) bump(dir);
    }, 120);
  };
  const endHold = () => { if (hold.current) { clearInterval(hold.current); hold.current = null; } };

  const shown = p.value === null ? '—' : format(p.value, p.decimals ?? 1);
  return (
    <View style={{ gap: space.xs, opacity: p.disabled ? 0.45 : 1 }}>
      <Text variant="label" color="muted">{p.label}</Text>
      <Row gap={space.md}>
        <StepButton sign="−" onPressIn={() => startHold(-1)} onPressOut={endHold} disabled={p.disabled} label={`${p.label} azalt`} />
        <RNText
          accessibilityLabel={`${p.label}: ${shown}`}
          style={[type.numeric, { color: c.text, flex: 1, textAlign: 'center' }]}
        >
          {shown}
        </RNText>
        <StepButton sign="+" onPressIn={() => startHold(1)} onPressOut={endHold} disabled={p.disabled} label={`${p.label} artır`} />
      </Row>
      {p.hint ? <Text variant="caption" color="faint">{p.hint}</Text> : null}
    </View>
  );
}

function StepButton(p: {
  sign: string; onPressIn: () => void; onPressOut: () => void; disabled?: boolean; label: string;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={p.label}
      hitSlop={HIT_SLOP} disabled={p.disabled}
      onPressIn={p.onPressIn} onPressOut={p.onPressOut}
      style={({ pressed }) => ({
        width: MIN_TAP + 8, height: MIN_TAP + 8, borderRadius: radius.md,
        backgroundColor: pressed ? c.primarySoft : c.surfaceAlt,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
      })}
    >
      <RNText style={[type.title, { color: c.text }]}>{p.sign}</RNText>
    </Pressable>
  );
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const format = (v: number, d: number) => (Number.isInteger(v) ? String(v) : v.toFixed(d));
