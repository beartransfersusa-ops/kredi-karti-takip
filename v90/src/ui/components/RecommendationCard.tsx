// Öneri kartı — docs/v90/06-ux-flows.md A.7 (R121, R122).
//
// Her öneri GEREKÇESİYLE gelir ve üç kararla kapanır. Hiçbir öneri otomatik
// uygulanmaz (R104.7); "Kabul" bile yalnızca prefill'i değiştirir, seti
// kullanıcı loglar.
import { useState } from 'react';
import { View } from 'react-native';
import { primaryValue, unitOf } from '../../features/active-workout/recommendation.ts';
import type { RecommendationCard as CardModel } from '../../features/active-workout/recommendation.ts';
import { num } from '../../features/format.ts';
import { Badge, Button, Card, Divider, ErrorBar, NumericStepper, Row, Text } from './primitives.tsx';
import { space } from '../theme.ts';
import { t, tr } from '../i18n/index.ts';

const KIND_LABEL: Record<string, string> = {
  loadIncrease: tr['reco.kind.loadIncrease'],
  holdLoad: tr['reco.kind.holdLoad'],
  loadDecrease: tr['reco.kind.loadDecrease'],
  repIncrease: tr['reco.kind.repIncrease'],
  deload: tr['reco.kind.deload'],
  substitution: tr['reco.kind.substitution'],
  volumeHold: tr['reco.kind.volumeHold'],
  nutritionHold: tr['reco.kind.nutritionHold'],
};

export function RecommendationCardView(p: {
  card: CardModel;
  /** "Değiştir" stepper'ının adımı — `IncrementResolver.forExercise`. */
  step?: number;
  busy?: boolean;
  error?: Error | null;
  onDecide: (decision: 'accepted' | 'modified' | 'ignored', userValue?: number) => void;
  onRetry?: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const proposedValue = primaryValue(p.card.proposed);
  const [draft, setDraft] = useState<number | null>(proposedValue);
  const unit = unitOf(p.card.kind, p.card.proposed);

  // Karar verilmiş kart DARALTILIR (A.7 "Normal · karar verildi").
  if (p.card.collapsed) {
    return (
      <Card>
        <Row wrap>
          <Text variant="caption" color="muted">{decidedLabel(p.card, unit)}</Text>
          {p.card.decision === 'modified' ? <Badge label={t('reco.userValueBadge')} /> : null}
        </Row>
      </Card>
    );
  }

  return (
    <Card tone="warning">
      <Row wrap>
        <Text variant="heading" style={{ flex: 1 }}>
          {KIND_LABEL[p.card.kind] ?? p.card.kind}
        </Text>
        {/* Tahmin olan her değer rozetle işaretlenir (R123.4). */}
        {p.card.isEstimate ? <Badge tone="estimate" label={t('reco.estimateBadge')} /> : null}
      </Row>

      <Text>{proposedLine(p.card)}</Text>

      {/* Gerekçe VARSAYILAN OLARAK KAPALI ama her zaman erişilebilir (R122.1). */}
      <Button label={t('reco.why')} kind="ghost" onPress={() => setShowWhy((v) => !v)} />
      {showWhy ? (
        <View style={{ gap: space.xs }}>
          <Text variant="caption" color="muted">{p.card.rationaleTr}</Text>
          {p.card.evidenceChips.length > 0 ? (
            <Row wrap>
              {p.card.evidenceChips.map((chip) => <Badge key={chip} label={chip} />)}
            </Row>
          ) : null}
          {p.card.setLogIds.length > 0 ? (
            <Text variant="caption" color="faint">
              {`Kanıt: ${p.card.setLogIds.length} set kaydı`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {p.error ? <ErrorBar details={p.error.message} {...(p.onRetry ? { onRetry: p.onRetry } : {})} /> : null}

      {editing ? (
        <View style={{ gap: space.sm }}>
          <Divider />
          <NumericStepper
            label={unit === 'kg' ? tr['active.load'] : unit === 'tekrar' ? tr['active.reps'] : 'Set'}
            value={draft}
            onChange={setDraft}
            step={p.step ?? (unit === 'kg' ? 2.5 : 1)}
            decimals={unit === 'kg' ? 1 : 0}
            min={0}
          />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setEditing(false)} />
            <Button
              label={t('reco.modify.save')} kind="primary" busy={p.busy}
              disabled={draft === null}
              onPress={() => { if (draft !== null) p.onDecide('modified', draft); }}
            />
          </Row>
        </View>
      ) : (
        <Row wrap>
          <Button label={t('reco.accept')} kind="primary" busy={p.busy}
            onPress={() => p.onDecide('accepted')} />
          <Button label={t('reco.modify')} disabled={p.busy || proposedValue === null}
            onPress={() => { setDraft(proposedValue); setEditing(true); }} />
          <Button label={t('reco.ignore')} kind="ghost" disabled={p.busy}
            onPress={() => p.onDecide('ignored')} />
        </Row>
      )}
    </Card>
  );
}

/** Önerilen değerin cümlesi; tür başına farklı (R121.2). */
function proposedLine(card: CardModel): string {
  const { proposed, kind } = card;
  const assistance = proposed.raw?.assistanceKg;
  if (assistance !== undefined && assistance !== null) {
    // Yardımlı harekette ilerleme YARDIMI AZALTMAKTIR (R101.3, AT-09).
    return t('reco.proposed.assistance', { assistanceKg: num(assistance, 1) });
  }
  if (kind === 'repIncrease' || proposed.reps !== undefined) {
    return t('reco.proposed.reps', { reps: proposed.reps ?? '—' });
  }
  if (proposed.effectiveLoad !== undefined) {
    return t('reco.proposed.load', { load: num(proposed.effectiveLoad, 1) });
  }
  if (proposed.sets !== undefined) {
    return t('reco.kind.volumeIncrease', { delta: proposed.sets });
  }
  return card.rationaleTr;
}

function decidedLabel(card: CardModel, unit: string | null): string {
  const value = card.decisionValue;
  const shown = value === null ? '—' : `${num(value, 1)}${unit ? ` ${unit}` : ''}`;
  if (card.decision === 'accepted') return t('reco.decided.accepted', { value: shown });
  if (card.decision === 'modified') return t('reco.decided.modified', { value: shown });
  return t('reco.decided.ignored');
}
