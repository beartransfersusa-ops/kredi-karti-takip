// Onay diyaloğu — docs/v90/06-ux-flows.md A.2, A.5 (yıkıcı eylemler).
//
// Yıkıcı eylem ASLA tek dokunuşla olmaz: "Gerçekten atla" ve "Antrenmanı
// İptal Et" gövde metniyle birlikte sonucunu açıkça söyler.
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, Row, Text } from './primitives.tsx';
import { space, usePalette } from '../theme.ts';

export function ConfirmDialog(p: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = usePalette();
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={p.onCancel}>
      <Pressable
        accessibilityLabel={p.cancelLabel}
        onPress={p.busy ? undefined : p.onCancel}
        style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: space.lg }}
      >
        {/* İç alana dokunmak diyaloğu kapatmaz. */}
        <Pressable onPress={() => {}}>
          <Card>
            <Text variant="title">{p.title}</Text>
            <Text color="muted">{p.body}</Text>
            <Row wrap style={{ justifyContent: 'flex-end' }}>
              <Button label={p.cancelLabel} kind="ghost" onPress={p.onCancel} disabled={p.busy} />
              <Button
                label={p.confirmLabel}
                kind={p.destructive ? 'destructive' : 'primary'}
                busy={p.busy}
                onPress={p.onConfirm}
              />
            </Row>
          </Card>
        </Pressable>
      </Pressable>
      <View />
    </Modal>
  );
}
