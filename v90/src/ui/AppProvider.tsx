// Uygulama bileşimi ve veri erişimi — docs/v90/06-ux-flows.md A.0, B.16.
//
// İki kural bu dosyanın tamamını belirler:
//   • DB tek doğruluk kaynağıdır; optimistic update YOKTUR (R90.7). Bir komut
//     yazdıktan sonra ekran yeniden okur, tahmin etmez.
//   • Hiçbir akış beyaz ekranla bitmez (R117.1): bootstrap'ın her hata adımı
//     kendi Türkçe ekranına düşer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { bootstrap, BootstrapError } from '../bootstrap/container.ts';
import type { Services } from '../bootstrap/container.ts';
import { expoSha256 } from '../platform/hash.ts';
import { DeviceClock } from '../platform/clock.ts';
import { PlatformFileStore, databasePath } from '../platform/files.ts';
import { PlatformBlobStore, photosDir } from '../platform/blobs.ts';
import { expoSha256Bytes } from '../platform/hash.ts';
import { newId } from '../platform/id.ts';
import { PlatformNotificationScheduler } from '../platform/notifications.ts';
import { makeProvider } from '../platform/db.ts';
import { buildInfo } from '../platform/build.ts';
import { SEED_BUNDLE } from '../platform/seedBundle.ts';

export type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; services: Services }
  | { phase: 'failed'; error: BootstrapError };

interface AppContextValue {
  services: Services;
  /** Herhangi bir yazma sonrası artar; açık sorgular yeniden okur. */
  revision: number;
  invalidate: () => void;
  /**
   * Bootstrap'ı baştan çalıştırır. Yedek içe aktarma DB DOSYASINI değiştirir,
   * bu yüzden tazeleme yetmez: tüm servisler yeniden kurulmalıdır (B.8 adım 6).
   */
  restart: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useServices(): Services { return useAppContext().services; }

export function useAppContext(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider dışında kullanıldı');
  return v;
}

export function AppProvider(p: {
  children: React.ReactNode;
  renderLoading: () => React.ReactNode;
  renderError: (e: BootstrapError, retry: () => void) => React.ReactNode;
}) {
  const [state, setState] = useState<BootState>({ phase: 'loading' });
  const [revision, setRevision] = useState(0);
  const attempt = useRef(0);

  const run = useCallback(() => {
    const mine = ++attempt.current;
    setState({ phase: 'loading' });
    bootstrap({
      clock: new DeviceClock(),
      files: new PlatformFileStore(),
      hash: expoSha256,
      seed: SEED_BUNDLE,
      build: buildInfo(),
      notifications: new PlatformNotificationScheduler(),
      dbPath: databasePath(),
      // Sağlayıcı platformdan gelir: yerelde SQLCipher, web'de sql.js + AES-GCM görüntü.
      makeProvider,
      // Açılışta yarıda kalmış fotoğraf silmeleri tamamlanır (R116.4).
      photos: {
        blobs: new PlatformBlobStore(),
        photosDir: photosDir(),
        hashBytes: expoSha256Bytes,
        newId,
      },
    }).then(
      (services) => { if (mine === attempt.current) setState({ phase: 'ready', services }); },
      (e: unknown) => {
        if (mine !== attempt.current) return;
        setState({
          phase: 'failed',
          error: e instanceof BootstrapError ? e : new BootstrapError('open', String(e), e),
        });
      },
    );
  }, []);

  useEffect(run, [run]);

  const value = useMemo<AppContextValue | null>(
    () => (state.phase === 'ready'
      ? {
        services: state.services,
        revision,
        invalidate: () => setRevision((v) => v + 1),
        restart: run,
      }
      : null),
    [state, revision, run],
  );

  if (state.phase === 'loading') return <>{p.renderLoading()}</>;
  if (state.phase === 'failed') return <>{p.renderError(state.error, run)}</>;
  return <Ctx.Provider value={value!}>{p.children}</Ctx.Provider>;
}

export interface QueryState<T> {
  data: T | null;
  error: Error | null;
  /** Yalnızca İLK okuma; tazelemede skeleton gösterilmez (A.0). */
  loading: boolean;
  reload: () => void;
}

/**
 * DB okuması. `revision` değiştiğinde ve uygulama ön plana döndüğünde
 * (AppState → active, R112.5) yeniden koşar.
 */
export function useDbQuery<T>(fn: (s: Services) => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const { services, revision } = useAppContext();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(0);
  const alive = useRef(true);
  const first = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    fn(services).then(
      (v) => { if (!cancelled && alive.current) { setData(v); setError(null); setLoading(false); first.current = false; } },
      (e: unknown) => { if (!cancelled && alive.current) { setError(e as Error); setLoading(false); } },
    );
    return () => { cancelled = true; };
    // fn her render'da yeni referans olur; bağımlılık listesini çağıran verir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, revision, local, ...deps]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setLocal((v) => v + 1);
    });
    return () => sub.remove();
  }, []);

  return { data, error, loading: loading && first.current, reload: () => setLocal((v) => v + 1) };
}

/**
 * Komut çalıştırıcı: yazar, sonra DB'yi yeniden okutur.
 * Hata `error` olarak döner; çağıran satır içi hata çubuğu gösterir (B.16.4).
 * Aynı `commandId` ile tekrar denemek güvenlidir (`command_log`).
 */
export function useCommand<A extends unknown[]>(
  fn: (s: Services, ...args: A) => Promise<unknown>,
): { run: (...args: A) => Promise<boolean>; busy: boolean; error: Error | null; clear: () => void } {
  const { services, invalidate } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async (...args: A) => {
    setBusy(true);
    setError(null);
    try {
      await fn(services, ...args);
      invalidate();
      return true;
    } catch (e) {
      setError(e as Error);
      return false;
    } finally {
      setBusy(false);
    }
  }, [fn, services, invalidate]);

  return { run, busy, error, clear: () => setError(null) };
}
