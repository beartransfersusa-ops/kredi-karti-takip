// Progress Photos — docs/v90/06-ux-flows.md B.14 (R116, R94.4–R94.6).
//
// Bu ekran GİZLİLİK HASSAS bir görünümdür:
//   • Fotoğraflar yalnızca uygulamanın özel alanında; galeriye YAZILMAZ.
//   • Cloud sync YOK — ne anahtar, ne buton, ne "yakında" metni (R116.3).
//   • Android'de ekran görüntüsü engelleme AYARA BAĞLI; iOS'ta VAAT EDİLMEZ,
//     yalnızca ne olduğu yazılır (R94.6, R116.5).
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Image, Platform, View } from 'react-native';
import { File } from 'expo-file-system';
import { newId } from '../../src/platform/id.ts';
import { expoSha256Bytes } from '../../src/platform/hash.ts';
import { PlatformBlobStore, photosDir } from '../../src/platform/blobs.ts';
import { settings } from '../../src/core/db/repositories.ts';
import {
  POSES, finishDeletion, groupByDate, listPhotos, markForDeletion, savePhoto,
} from '../../src/features/photos/photoStore.ts';
import type { PhotoEnv, PhotoRow, Pose } from '../../src/features/photos/photoStore.ts';
import { dateTr, weekdayTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { radius, space, usePalette } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

const POSE_LABEL: Record<Pose, string> = {
  front: tr['photos.pose.front'],
  back: tr['photos.pose.back'],
  sideLeft: tr['photos.pose.sideLeft'],
  sideRight: tr['photos.pose.sideRight'],
  frontFlexed: tr['photos.pose.frontFlexed'],
  backFlexed: tr['photos.pose.backFlexed'],
  other: tr['photos.pose.other'],
};

const env = (newIdFn: () => string): PhotoEnv => ({
  blobs: new PlatformBlobStore(),
  photosDir: photosDir(),
  hashBytes: expoSha256Bytes,
  newId: newIdFn,
});

const photoUri = (p: PhotoRow): string => `${photosDir()}/${p.file_name}`;

export default function PhotosRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Photos /></ErrorBoundary>;
}

function Photos() {
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<PhotoRow | null>(null);
  const [compare, setCompare] = useState<PhotoRow[]>([]);
  const [deleting, setDeleting] = useState<PhotoRow | null>(null);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    photos: await listPhotos(tx),
    flagSecure: (await settings.get<boolean>(tx, 'privacy.androidFlagSecure')) ?? false,
    todayKey: s.clock.todayKey(),
  })), []));

  const flagSecure = q.data?.flagSecure ?? false;

  // Android'de ayar açıksa ekran görüntüsü engellenir; çıkışta serbest bırakılır.
  // iOS'ta bu çağrı hiç yapılmaz: tutulamayacak söz verilmez (R94.6).
  useEffect(() => {
    if (Platform.OS !== 'android' || !flagSecure) return;
    let active = true;
    void (async () => {
      const SC = await import('expo-screen-capture');
      if (active) await SC.preventScreenCaptureAsync('photos');
    })();
    return () => {
      active = false;
      void import('expo-screen-capture').then((SC) => SC.allowScreenCaptureAsync('photos'));
    };
  }, [flagSecure]);

  const remove = useCommand(async (s, photo: PhotoRow) => {
    // (a) işaretle → (b) dosya → (c) satır. Arada kesinti olursa açılışta
    // OrphanSweeper tamamlar; fotoğraf kullanıcı için zaten silinmiştir.
    await s.db.withTransaction((tx) => markForDeletion(tx, photo.id));
    await s.db.withTransaction((tx) => finishDeletion(tx, env(newId), photo));
  });

  if (q.loading) {
    return <Screen><Skeleton height={24} width="45%" /><Card><Skeleton height={160} /></Card></Screen>;
  }
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;

  const groups = groupByDate(q.data.photos);
  const todayKey = q.data.todayKey;

  return (
    <Screen>
      <Text variant="title">{t('photos.title')}</Text>

      <Card>
        {/* Gizlilik notu: ne yapıldığı ve ne YAPILMADIĞI. */}
        <Text variant="caption" color="muted">{t('photos.privacyNote')}</Text>
        {Platform.OS === 'ios' ? (
          <Text variant="caption" color="faint">{t('photos.iosScreenshotNote')}</Text>
        ) : flagSecure ? (
          <Row><Badge tone="primary" label={t('photos.androidSecureActive')} /></Row>
        ) : null}
      </Card>

      {remove.error ? <ErrorBar details={remove.error.message} /> : null}

      <Button label={t('photos.add')} kind="primary" onPress={() => setAdding(true)} />

      {adding ? (
        <AddPhoto
          todayKey={todayKey}
          onDone={() => { setAdding(false); q.reload(); }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {compare.length === 2 ? <CompareView photos={compare} onClose={() => setCompare([])} /> : null}

      {groups.length === 0 && !adding ? (
        <Card><Text color="muted">{t('photos.empty')}</Text></Card>
      ) : null}

      {groups.map((g) => (
        <View key={g.dateKey} style={{ gap: space.sm }}>
          <Text variant="label" color="muted">
            {`${weekdayTr(g.dateKey)}, ${dateTr(g.dateKey, todayKey)}`}
          </Text>
          <Row wrap gap={space.sm}>
            {g.photos.map((p) => (
              <PhotoTile
                key={p.id}
                photo={p}
                selected={compare.some((cmp) => cmp.id === p.id)}
                onOpen={() => setViewing(p)}
                onToggleCompare={() => setCompare((list) =>
                  list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id)
                    : list.length < 2 ? [...list, p] : [list[1]!, p])}
              />
            ))}
          </Row>
          <Divider />
        </View>
      ))}

      {viewing ? (
        <Viewer
          photo={viewing}
          onClose={() => setViewing(null)}
          onDelete={() => { setDeleting(viewing); setViewing(null); }}
        />
      ) : null}

      <ConfirmDialog
        visible={deleting !== null}
        title={t('photos.delete')}
        body={t('photos.delete.confirm')}
        confirmLabel={t('photos.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        busy={remove.busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting && await remove.run(deleting)) { setDeleting(null); q.reload(); }
        }}
      />

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

function PhotoTile(p: {
  photo: PhotoRow; selected: boolean; onOpen: () => void; onToggleCompare: () => void;
}) {
  const c = usePalette();
  const [missing, setMissing] = useState(false);

  if (missing) {
    // Orphan satır: dosya yok. SATIR OTOMATİK SİLİNMEZ; kullanıcı karar verir.
    return (
      <Card style={{ width: 150 }}>
        <Text variant="caption" color="danger">{t('photos.fileMissing')}</Text>
        <Badge label={POSE_LABEL[p.photo.pose]} />
        <Text variant="caption" color="faint">{t('photos.removeRecord')}</Text>
      </Card>
    );
  }

  return (
    <View style={{ width: 150, gap: space.xs }}>
      <Image
        source={{ uri: photoUri(p.photo) }}
        onError={() => setMissing(true)}
        accessibilityLabel={POSE_LABEL[p.photo.pose]}
        style={{
          width: 150, height: 200, borderRadius: radius.md, backgroundColor: c.surfaceAlt,
          borderWidth: p.selected ? 3 : 0, borderColor: c.primary,
        }}
      />
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={POSE_LABEL[p.photo.pose]} />
        <Button label="Aç" kind="ghost" onPress={p.onOpen} />
      </Row>
      <Button
        label={p.selected ? 'Seçimi kaldır' : t('photos.compare')}
        kind="ghost" onPress={p.onToggleCompare}
      />
    </View>
  );
}

function Viewer(p: { photo: PhotoRow; onClose: () => void; onDelete: () => void }) {
  const c = usePalette();
  return (
    <Card>
      <Image
        source={{ uri: photoUri(p.photo) }}
        style={{ width: '100%', height: 420, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}
        resizeMode="contain"
      />
      <Row wrap>
        <Badge label={POSE_LABEL[p.photo.pose]} />
        <Badge label={`${(p.photo.bytes / 1024).toFixed(0)} KB`} />
      </Row>
      {p.photo.note ? <Text variant="caption" color="muted">{p.photo.note}</Text> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button label={t('common.cancel')} kind="ghost" onPress={p.onClose} />
        <Button label={t('photos.delete')} kind="destructive" onPress={p.onDelete} />
      </Row>
    </Card>
  );
}

function CompareView({ photos, onClose }: { photos: PhotoRow[]; onClose: () => void }) {
  const c = usePalette();
  return (
    <Card>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        {photos.map((p) => (
          <View key={p.id} style={{ flex: 1, gap: space.xs }}>
            <Image
              source={{ uri: photoUri(p) }}
              style={{ width: '100%', height: 280, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}
              resizeMode="contain"
            />
            <Text variant="caption" color="muted">{dateTr(p.local_date_key)}</Text>
            <Badge label={POSE_LABEL[p.pose]} />
          </View>
        ))}
      </Row>
      <Button label={t('common.cancel')} kind="ghost" onPress={onClose} />
    </Card>
  );
}

/** Ekleme akışı: kaynak → poz → kaydet (B.14 adım 1–3). */
function AddPhoto(p: { todayKey: string; onDone: () => void; onCancel: () => void }) {
  const [pose, setPose] = useState<Pose>('front');
  const [picked, setPicked] = useState<{ uri: string; width?: number; height?: number } | null>(null);

  const pick = useCommand(async (_s, source: 'camera' | 'library') => {
    const Picker = await import('expo-image-picker');
    const permission = source === 'camera'
      ? await Picker.requestCameraPermissionsAsync()
      : await Picker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('İzin verilmedi. Cihaz ayarlarından izin verebilirsin.');

    const result = source === 'camera'
      ? await Picker.launchCameraAsync({ quality: 0.9, exif: false })
      : await Picker.launchImageLibraryAsync({ quality: 0.9, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setPicked({
      uri: a.uri,
      ...(a.width ? { width: a.width } : {}),
      ...(a.height ? { height: a.height } : {}),
    });
  });

  const save = useCommand(async (s) => {
    if (!picked) return;
    const file = new File(picked.uri);
    const bytes = await file.bytes();
    const extension = file.extension.replace(/^\./, '') || 'jpg';

    await s.db.withTransaction((tx) => savePhoto(tx, s.clock, env(newId), {
      bytes,
      extension,
      pose,
      localDateKey: p.todayKey,
      ...(picked.width !== undefined ? { width: picked.width } : {}),
      ...(picked.height !== undefined ? { height: picked.height } : {}),
    }));

    /*
     * Kamera ve picker GEÇİCİ kopyaları temizlenir. Galerideki ORİJİNAL
     * dosyaya dokunulmaz (R116.2): ImagePicker iOS/Android'de seçilen
     * görselin cache kopyasını verir, orijinalin kendisini değil.
     */
    try { if (file.exists) file.delete(); } catch { /* zaten gitmiş olabilir */ }
  });

  return (
    <Card>
      <Text variant="heading">{t('photos.add')}</Text>

      {!picked ? (
        <Row wrap>
          <Button label={t('photos.source.camera')} busy={pick.busy}
            onPress={() => void pick.run('camera')} />
          <Button label={t('photos.source.library')} busy={pick.busy}
            onPress={() => void pick.run('library')} />
          <Button label={t('common.cancel')} kind="ghost" onPress={p.onCancel} />
        </Row>
      ) : (
        <>
          <Image source={{ uri: picked.uri }}
            style={{ width: '100%', height: 260, borderRadius: radius.md }} resizeMode="contain" />
          <Text variant="label" color="muted">Poz</Text>
          <Row wrap>
            {POSES.map((ps) => (
              <Button key={ps} label={POSE_LABEL[ps]}
                kind={pose === ps ? 'primary' : 'secondary'} onPress={() => setPose(ps)} />
            ))}
          </Row>
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setPicked(null)} />
            <Button label={t('common.save')} kind="primary" busy={save.busy}
              onPress={async () => { if (await save.run()) p.onDone(); }} />
          </Row>
        </>
      )}

      {pick.error ? <ErrorBar message={pick.error.message} /> : null}
      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run()} /> : null}
    </Card>
  );
}
