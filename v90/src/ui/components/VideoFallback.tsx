// Egzersiz videosu ve fallback — docs/v90/06-ux-flows.md B.15 (§114, AT-17).
//
// Video KALDIRILMIŞ, ağ YOK ya da manifest'te kayıt YOK: hareket sayfası
// ÇÖKMEZ (R114.3). Teknik ipuçları ve kaynak bağlantısı her koşulda çalışır
// (R114.4). Video indirilip yeniden host edilmez; yalnızca resmi bağlantı
// (R114.5). Ağ kullanımı bu bileşenle sınırlıdır (02 §2.2).
//
// Gömülü player BİLİNÇLİ olarak bağlı değil: manifest boş dağıtılıyor
// (R114.1 — doğrulanmamış videoId eklenmez). İlk küratörlü giriş eklendiğinde
// `available` dalına react-native-youtube-iframe bağlanır; 8 s zaman aşımı
// (PLAYER_TIMEOUT_MS) ve onError → `unavailable` akışı buradaki durum
// makinesiyle hazır.
import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { sourceLink, thumbnailUrl } from '../../features/video/videoManifest.ts';
import type { VideoState } from '../../features/video/videoManifest.ts';
import { dateTr } from '../../features/format.ts';
import { Badge, Button, Card, Row, Text } from './primitives.tsx';
import { radius, space, usePalette } from '../theme.ts';
import { t } from '../i18n/index.ts';

export function ExerciseVideo(p: { state: VideoState; cues: readonly string[]; todayKey: string; onRetry?: () => void }) {
  const c = usePalette();
  const [thumbFailed, setThumbFailed] = useState(false);
  const { state } = p;
  const entry = state.kind === 'none' ? null : state.entry;

  return (
    <Card>
      {state.kind === 'none' ? (
        <Row><Badge label={t('video.none')} /></Row>
      ) : (
        <>
          {/* Thumbnail YouTube CDN'inden; yüklenemezse gri kutu (B.15 tablosu). */}
          {thumbFailed ? (
            <View style={{ height: 160, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} />
          ) : (
            <Image source={{ uri: thumbnailUrl(state.entry) }} onError={() => setThumbFailed(true)}
              style={{ width: '100%', height: 160, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} resizeMode="cover" />
          )}
          {state.kind === 'offline' ? <Text variant="caption" color="muted">{t('video.offline')}</Text> : null}
          {state.kind === 'unavailable' ? (
            <View style={{ gap: space.xs }}>
              <Text variant="heading">{t('video.unavailable.title')}</Text>
              <Text variant="caption" color="muted">{t('video.unavailable.body')}</Text>
              {p.onRetry ? <Button label={t('video.retry')} kind="ghost" onPress={p.onRetry} /> : null}
            </View>
          ) : null}
        </>
      )}

      {/* Teknik ipuçları her durumda (R114.4) — kaynak `exercises.cues_json`. */}
      <Text variant="label" color="muted">{t('video.cues.title')}</Text>
      {p.cues.map((cue, i) => <Text key={i}>{`${i + 1}. ${cue}`}</Text>)}

      {entry ? (
        <View style={{ gap: space.xs }}>
          <Text variant="caption" color="faint">{t('video.channel', { channelName: entry.channelName })}</Text>
          <Text variant="caption" color="faint">{t('video.lastVerified', { date: dateTr(entry.lastVerifiedAt.slice(0, 10), p.todayKey) })}</Text>
          {/* "Kaynağa git" harici tarayıcıda: hiçbir şey yeniden host edilmez (R114.5). */}
          <Button label={t('video.goToSource')} kind="ghost" onPress={() => void Linking.openURL(sourceLink(entry))} />
        </View>
      ) : null}
    </Card>
  );
}
