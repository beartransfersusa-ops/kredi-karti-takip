// Render hatası yakalayıcı — docs/v90/06-ux-flows.md B.16.5 (R117.1).
//
// İki seviye: ekran düzeyi (tab bar çalışır kalır) ve kök (yalnızca metin ve
// iki buton; DB/ağ/tema bağımlılığı yok). Aktif antrenman ekranında tetiklense
// bile veri kaybı yoktur — her şey zaten DB'dedir (R90).
import { Component } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { tr } from '../i18n/index.ts';

interface Props { children: React.ReactNode; onReload?: () => void; onHome?: () => void; root?: boolean }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  override componentDidCatch(error: Error) {
    // Crash reporting YOK (R118.3). Hata yalnızca geliştirme konsoluna gider;
    // hiçbir ölçüm/lab/fotoğraf verisi dışarı çıkmaz (R118.1).
    if (__DEV__) console.error('[V90] ErrorBoundary', error);
  }

  #reset = () => {
    this.setState({ error: null });
    this.props.onReload?.();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Kök seviyede tema bile okunmaz: perde her koşulda render edilebilmeli.
    return (
      <View style={{
        flex: 1, padding: 24, gap: 16, justifyContent: 'center',
        backgroundColor: this.props.root ? '#111310' : 'transparent',
      }}>
        <RNText style={{ fontSize: 22, fontWeight: '700', color: this.props.root ? '#F2F3EE' : '#16150F' }}>
          {tr['error.boundary.title']}
        </RNText>
        <RNText style={{ fontSize: 13, color: this.props.root ? '#A9AEA2' : '#5C5A50' }}>
          {String(error.message).slice(0, 300)}
        </RNText>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PlainButton label={tr['error.boundary.reload']} onPress={this.#reset} dark={!!this.props.root} />
          {this.props.onHome
            ? <PlainButton label={tr['error.boundary.home']} onPress={this.props.onHome} dark={!!this.props.root} />
            : null}
        </View>
      </View>
    );
  }
}

function PlainButton(p: { label: string; onPress: () => void; dark: boolean }) {
  return (
    <Pressable
      accessibilityRole="button" onPress={p.onPress}
      style={{
        minHeight: 44, paddingHorizontal: 16, justifyContent: 'center',
        borderRadius: 12, backgroundColor: p.dark ? '#222620' : '#F0F0EE',
      }}
    >
      <RNText style={{ fontSize: 15, fontWeight: '600', color: p.dark ? '#F2F3EE' : '#16150F' }}>{p.label}</RNText>
    </Pressable>
  );
}
