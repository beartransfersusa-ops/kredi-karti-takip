// Ay görünümü tarih seçici — docs/v90/06-ux-flows.md A.10.
//
// Izgaranın kuralları `features/program/calendarGrid.ts` içinde saf biçimde
// durur; burada yalnızca çizim ve dokunma var.
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { monthGrid } from '../../features/program/calendarGrid.ts';
import type { DayCell } from '../../features/program/calendarGrid.ts';
import { addDaysKey, dateTr } from '../../features/format.ts';
import { Badge, Button, Card, Row, Text } from './primitives.tsx';
import { MIN_TAP, radius, space, usePalette } from '../theme.ts';
import { MONTHS_TR, t } from '../i18n/index.ts';

const WEEK_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function DatePickerSheet(p: {
  visible: boolean;
  title: string;
  initialKey: string;
  todayKey: string;
  minKey?: string;
  maxKey?: string;
  preferredWeekdays?: readonly number[];
  pauses?: ReadonlyArray<{ startDateKey: string; endDateKey: string | null }>;
  programEndKey?: string | null;
  busy?: boolean;
  onPick: (key: string) => void;
  onCancel: () => void;
}) {
  const c = usePalette();
  const [selected, setSelected] = useState(p.initialKey);
  const [anchor, setAnchor] = useState(p.initialKey);

  const cells = useMemo(() => monthGrid({
    monthAnchorKey: anchor,
    todayKey: p.todayKey,
    ...(p.minKey ? { minKey: p.minKey } : {}),
    ...(p.maxKey ? { maxKey: p.maxKey } : {}),
    preferredWeekdays: p.preferredWeekdays ?? [],
    pauses: p.pauses ?? [],
    programEndKey: p.programEndKey ?? null,
  }), [anchor, p.todayKey, p.minKey, p.maxKey, p.preferredWeekdays, p.pauses, p.programEndKey]);

  const shiftMonth = useCallback((delta: number) => {
    const [y, m] = anchor.split('-').map(Number) as [number, number];
    const next = new Date(Date.UTC(y, m - 1 + delta, 1));
    setAnchor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`);
  }, [anchor]);

  const selectedCell = cells.find((x) => x.key === selected);
  const [ay, am] = anchor.split('-').map(Number) as [number, number];

  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onCancel}>
      <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md }}>
          <Text variant="title">{p.title}</Text>

          <Row style={{ justifyContent: 'space-between' }}>
            <Button label="‹" kind="ghost" onPress={() => shiftMonth(-1)} />
            <Text variant="heading">{`${MONTHS_TR[am - 1]} ${ay}`}</Text>
            <Button label="›" kind="ghost" onPress={() => shiftMonth(1)} />
          </Row>

          <Row gap={0}>
            {WEEK_HEADERS.map((h) => (
              <View key={h} style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="caption" color="faint">{h}</Text>
              </View>
            ))}
          </Row>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((cell) => (
              <DayButton
                key={cell.key}
                cell={cell}
                selected={cell.key === selected}
                onPress={() => setSelected(cell.key)}
              />
            ))}
          </View>

          <Card>
            <Text variant="caption" color="muted">
              {t('reschedule.hint', { date: dateTr(selected, p.todayKey) })}
            </Text>
            <Row wrap>
              {selectedCell?.preferred ? <Badge tone="primary" label={t('reschedule.preferredDay')} /> : null}
              {selectedCell?.paused ? <Badge tone="warning" label={t('reschedule.pausedDay')} /> : null}
              {selectedCell?.afterEnd ? <Badge tone="warning" label={t('reschedule.afterEnd')} /> : null}
            </Row>
          </Card>

          <Row style={{ justifyContent: 'flex-end' }}>
            <Button label={t('reschedule.cancel')} kind="ghost" onPress={p.onCancel} disabled={p.busy} />
            <Button
              label={t('reschedule.confirm')} kind="primary" busy={p.busy}
              disabled={!selectedCell?.selectable}
              onPress={() => p.onPick(selected)}
            />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

function DayButton({ cell, selected, onPress }: { cell: DayCell; selected: boolean; onPress: () => void }) {
  const c = usePalette();
  const bg = selected ? c.primary : cell.isToday ? c.primarySoft : 'transparent';
  const fg = selected ? c.onPrimary : cell.inMonth ? c.text : c.textFaint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !cell.selectable }}
      accessibilityLabel={`${cell.dayOfMonth}`}
      disabled={!cell.selectable}
      onPress={onPress}
      style={{
        width: `${100 / 7}%`, height: MIN_TAP, alignItems: 'center', justifyContent: 'center',
        opacity: cell.selectable ? 1 : 0.3,
      }}
    >
      <View style={{
        width: MIN_TAP - 8, height: MIN_TAP - 8, borderRadius: radius.pill,
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
        borderWidth: cell.preferred && !selected ? 1 : 0, borderColor: c.primary,
      }}>
        <Text style={{ color: fg }}>{String(cell.dayOfMonth)}</Text>
      </View>
    </Pressable>
  );
}

export { addDaysKey };
