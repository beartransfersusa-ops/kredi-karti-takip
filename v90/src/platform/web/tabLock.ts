// Tek sekme kilidi — web hedefi (02 §12.2, ADR-013).
//
// sql.js veritabanı bellekte çalışır ve her commit sonrası görüntü IndexedDB'ye
// yazılır. İki sekme aynı görüntüyü açsa her biri diğerinin yazdığını ezerdi.
// Web Locks API ile "v90.db" kilidi sekme ömrü boyunca tutulur; ikinci sekme
// kilidi alamayınca DbOpenError ile durur (B.16.1 hata ekranı; veri bozulmaz).
//
// Web Locks yoksa (eski tarayıcı, güvensiz bağlam) sessizce geçilir: kilit
// olmadan çalışmak, hiç çalışmamaktan iyidir ve tek sekmede sorun yoktur.
//
// DOM tipine bağlı DEĞİLDİR (yapısal tipler): Node testinde de derlenip
// sahte bir kilit yöneticisiyle sınanabilir.
import { DbOpenError } from '../../core/db/errors.ts';

export const TAB_LOCK_NAME = 'v90.db';

export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: object | null) => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

function defaultLocks(): LockManagerLike | undefined {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks;
}

/**
 * Kilidi ister ve alındığında döner; kilit sekme kapanana kadar bırakılmaz.
 * Alınamazsa DbOpenError. `locks` verilmezse tarayıcının yöneticisi kullanılır.
 */
export function requestTabLock(locks: LockManagerLike | undefined = defaultLocks()): Promise<void> {
  if (!locks) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    locks.request(TAB_LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock === null) {
        reject(new DbOpenError('uygulama başka bir sekmede açık — önce onu kapat'));
        return undefined;
      }
      resolve();
      // Geri çağrının promise'i çözülene kadar kilit tutulur; hiç çözülmez →
      // sekme kapanınca tarayıcı kilidi kendisi bırakır.
      return new Promise<never>(() => {});
    }).catch(reject);   // request'in kendisi hata verirse (ör. SecurityError)
  });
}

let held: Promise<void> | null = null;

/** Sekme başına bir kez alınır; ikinci çağrı aynı sonucu paylaşır (no-op). */
export function acquireTabLock(): Promise<void> {
  if (!held) {
    // Başarısızlık önbelleğe alınmaz: kullanıcı diğer sekmeyi kapatıp
    // "Tekrar dene" derse yeni istek yapılır.
    held = requestTabLock().catch((e: unknown) => { held = null; throw e; });
  }
  return held;
}
