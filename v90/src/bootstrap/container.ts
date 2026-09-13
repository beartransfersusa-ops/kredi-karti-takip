// Uygulama bileşimi — docs/v90/02-architecture.md §2, §12; 06-ux-flows.md A.1/B.16.
//
// Bootstrap sırası (B.16.1, B.16.2 hata ekranları bu adımlara karşılık gelir):
//   1. Build koruması  — production'da şifresiz DB veya Expo Go yasak (R93.7)
//   2. DB aç           — hata: DbOpenError ekranı
//   3. Migration       — hata: MigrationFailed / DiskSpace ekranı
//   4. Seed            — katalog ve program şablonu (idempotent)
//   5. Servisler       — saf domain + Tx portu
//
// Container React'e bağımlı DEĞİLDİR: aynı bileşim Node testlerinde de kurulur.

import type { Clock } from '../core/clock/dateKey.ts';
import { CatalogCache } from '../core/db/catalog.ts';
import { MigrationRunner } from '../core/db/MigrationRunner.ts';
import { installSeed } from '../core/db/seed.ts';
import type { SeedBundle, SeedResult } from '../core/db/seed.ts';
import { assertEncryptedProviderInProduction, warnIfUnencrypted } from '../core/db/buildGuard.ts';
import type { BuildInfo } from '../core/db/buildGuard.ts';
import { InsufficientSpaceError, MigrationFailedError } from '../core/db/errors.ts';
import type { Db, DatabaseProvider, FileStore } from '../core/db/types.ts';
import type { Hasher } from '../core/db/hash.ts';
import { PauseService, Scheduler } from '../domain/program/Scheduler.ts';
import { ActiveSessionService } from '../domain/workout/ActiveSessionService.ts';
import { RestTimerService } from '../domain/workout/RestTimerService.ts';
import type { NotificationScheduler } from '../domain/workout/RestTimerService.ts';
import { preferredWorkoutDays } from '../features/profile/profileQuery.ts';
import { sweepOrphans } from '../features/photos/photoStore.ts';
import type { PhotoEnv, SweepResult } from '../features/photos/photoStore.ts';

export interface Services {
  db: Db;
  clock: Clock;
  files: FileStore;
  catalog: CatalogCache;
  scheduler: Scheduler;
  pauseService: PauseService;
  session: ActiveSessionService;
  restTimers: RestTimerService;
  seed: SeedResult;
  /** Açılışta yapılan fotoğraf temizliği (02 §13.2); yoksa null. */
  photoSweep: SweepResult | null;
  isEncrypted: boolean;
  /** Canlı veritabanı dosyasının yolu (yedekleme dosya değişimi için). */
  dbPath: string;
  /**
   * Yedek içe aktarma için (02 §12.3): verilen yolda AYRI bir DB açıp
   * migration'ları çalıştırır. Staging burada oluşturulur; canlı dosyaya
   * yalnızca en sonda, tek bir yeniden adlandırmayla dokunulur.
   */
  openMigrated: (path: string) => Promise<Db>;
  closeLive: () => Promise<void>;
  reopenLive: () => Promise<Db>;
  close: () => Promise<void>;
}

export interface BootstrapOptions {
  clock: Clock;
  files: FileStore;
  hash: Hasher;
  seed: SeedBundle;
  build: BuildInfo;
  notifications?: NotificationScheduler;
  /**
   * Fotoğraf deposu. Verilirse açılışta `OrphanSweeper` çalışır: yarıda kalmış
   * silmeler tamamlanır, sahipsiz dosyalar toplanır (R116.4).
   */
  photos?: PhotoEnv;
  /**
   * Testler kendi sağlayıcılarını enjekte eder. Uygulama ise `makeProvider`
   * verir (src/platform/db.ts): yerelde SQLCipher, web'de sql.js + şifreli
   * görüntü. Bu dosya hiçbir sağlayıcıyı import ETMEZ: bundle'a hangi
   * sürücünün gireceğine platform dosyası karar verir (R93.7; `node:sqlite`
   * buraya hiç gelmez).
   */
  provider?: DatabaseProvider;
  dbPath?: string;
  /** Canlı ve staging (yedek içe aktarma) sağlayıcı üreticisi. */
  makeProvider?: (path: string) => DatabaseProvider;
  log?: (m: string) => void;
}

/** Bootstrap'ın hangi adımda durduğunu ekranlara taşıyan hata. */
export class BootstrapError extends Error {
  readonly step: 'build' | 'open' | 'migrate' | 'diskSpace' | 'seed';
  override readonly cause?: unknown;
  constructor(step: BootstrapError['step'], message: string, cause?: unknown) {
    super(message);
    this.name = 'BootstrapError';
    this.step = step;
    this.cause = cause;
  }
}

export async function bootstrap(o: BootstrapOptions): Promise<Services> {
  // 1 — build koruması, DB'ye dokunmadan önce.
  const provider = o.provider ?? defaultProvider(o);
  try {
    assertEncryptedProviderInProduction(provider, o.build);
  } catch (e) {
    throw new BootstrapError('build', (e as Error).message, e);
  }
  warnIfUnencrypted(provider, o.build, o.log);

  // 2–3 — aç ve migrate et. MigrationRunner ikisini birlikte yapar; yedeği
  // migration'dan ÖNCE alır, hata hâlinde geri yükler (R92.6).
  const runMigrated = (p: DatabaseProvider) => new MigrationRunner({
    provider: p, files: o.files, clock: o.clock, hash: o.hash,
  }).run().then((r) => r.db);

  let db: Db;
  try {
    db = await runMigrated(provider);
  } catch (e) {
    if (e instanceof InsufficientSpaceError) throw new BootstrapError('diskSpace', e.message, e);
    if (e instanceof MigrationFailedError) throw new BootstrapError('migrate', e.message, e);
    throw new BootstrapError('open', (e as Error).message, e);
  }

  // 4 — seed.
  let seedResult: SeedResult;
  try {
    seedResult = await db.withTransaction((tx) => installSeed(tx, o.seed, o.clock.nowUtc().toISOString()));
  } catch (e) {
    await db.close().catch(() => {});
    throw new BootstrapError('seed', (e as Error).message, e);
  }

  // 4b — fotoğraf temizliği. Başarısızlığı bootstrap'ı DÜŞÜRMEZ: temizlik
  // bir bakım işidir, uygulamanın açılmasına engel olmamalıdır.
  let photoSweep: SweepResult | null = null;
  if (o.photos) {
    const env = o.photos;
    photoSweep = await db.withTransaction((tx) => sweepOrphans(tx, env)).catch((e: unknown) => {
      o.log?.(`[V90] fotoğraf temizliği atlandı: ${(e as Error).message}`);
      return null;
    });
  }

  // 5 — servisler.
  const scheduler = new Scheduler({
    clock: o.clock,
    // Açık transaction içinde okunur; yeni transaction AÇILMAZ (02 §3).
    preferredWorkoutDays: (tx) => preferredWorkoutDays(tx),
  });
  const restTimers = new RestTimerService({ clock: o.clock, ...(o.notifications ? { notifications: o.notifications } : {}) });
  const catalog = new CatalogCache(db);
  const session = new ActiveSessionService({
    db, clock: o.clock, scheduler, restTimers, catalog: () => catalog.all(),
  });

  return {
    get db() { return db; },
    clock: o.clock, files: o.files, catalog, scheduler, restTimers, session,
    pauseService: new PauseService({ clock: o.clock, scheduler }),
    seed: seedResult,
    photoSweep,
    isEncrypted: provider.isEncrypted,
    dbPath: provider.path,
    openMigrated: (path) => runMigrated(makeProvider(o, path)),
    closeLive: () => db.close(),
    reopenLive: async () => { db = await runMigrated(provider); return db; },
    close: () => db.close(),
  };
}

function defaultProvider(o: BootstrapOptions): DatabaseProvider {
  if (!o.dbPath) {
    throw new BootstrapError('build',
      'dbPath verilmedi ve şifresiz sağlayıcıya düşülmez (R93.7)');
  }
  return makeProvider(o, o.dbPath);
}

/**
 * Staging veritabanı da CANLI DB ile aynı türde olmalıdır: şifreli kurulumda
 * staging de şifrelidir ve aynı anahtarı kullanır, aksi halde dosya değişimi
 * sonrası DB açılamazdı. Bu yüzden ikisi de aynı üreticiden çıkar.
 */
function makeProvider(o: BootstrapOptions, path: string): DatabaseProvider {
  if (o.makeProvider) return o.makeProvider(path);
  throw new BootstrapError('build',
    'sağlayıcı üreticisi verilmedi: uygulama src/platform/db.ts üzerinden vermelidir (R93.7)');
}
