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
import { EncryptedSqliteProvider } from '../core/db/EncryptedSqliteProvider.ts';
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
  isEncrypted: boolean;
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
   * Verilmezse `dbPath` üzerinden ŞİFRELİ sağlayıcı kurulur. Testler kendi
   * sağlayıcılarını enjekte eder; uygulama bundle'ında şifresiz sağlayıcıya
   * giden hiçbir yol YOKTUR — `node:sqlite` buraya hiç import edilmez (R93.7).
   */
  provider?: DatabaseProvider;
  dbPath?: string;
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
  let db: Db;
  try {
    const result = await new MigrationRunner({
      provider, files: o.files, clock: o.clock, hash: o.hash,
    }).run();
    db = result.db;
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

  // 5 — servisler.
  const scheduler = new Scheduler({
    clock: o.clock,
    preferredWorkoutDays: () => db.withTransaction((tx) => preferredWorkoutDays(tx)),
  });
  const restTimers = new RestTimerService({ clock: o.clock, ...(o.notifications ? { notifications: o.notifications } : {}) });
  const catalog = new CatalogCache(db);
  const session = new ActiveSessionService({
    db, clock: o.clock, scheduler, restTimers, catalog: () => catalog.all(),
  });

  return {
    db, clock: o.clock, files: o.files, catalog, scheduler, restTimers, session,
    pauseService: new PauseService({ clock: o.clock, scheduler }),
    seed: seedResult,
    isEncrypted: provider.isEncrypted,
    close: () => db.close(),
  };
}

function defaultProvider(o: BootstrapOptions): DatabaseProvider {
  if (!o.dbPath) {
    throw new BootstrapError('build',
      'dbPath verilmedi ve şifresiz sağlayıcıya düşülmez (R93.7)');
  }
  return new EncryptedSqliteProvider({ path: o.dbPath, fileExists: (p) => o.files.exists(p) });
}
