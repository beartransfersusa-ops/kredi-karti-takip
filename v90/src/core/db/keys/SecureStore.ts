// Platform güvenli depolama portu — docs/v90/02-architecture.md §12.2 (R93.6).
// Anahtar ASLA normal AsyncStorage'da veya kaynak kodda tutulmaz (R93.5).

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Test ve Expo Go prototipi için. Production'da KULLANILMAZ. */
export class InMemorySecureStore implements SecureStore {
  readonly #map = new Map<string, string>();
  async get(key: string) { return this.#map.get(key) ?? null; }
  async set(key: string, value: string) { this.#map.set(key, value); }
  async remove(key: string) { this.#map.delete(key); }
  /** Yalnızca testler için: depoda ne var? */
  get size() { return this.#map.size; }
}

/**
 * expo-secure-store uygulaması (iOS Keychain / Android Keystore).
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: anahtar cihaz yedeğiyle (iCloud/Google)
 * BAŞKA BİR CİHAZA TAŞINMAZ. Bu bilinçli bir karardır (ADR-002): şifreli DB
 * dosyası yedeklense bile yeni cihazda açılamaz; kullanıcının taşınma yolu
 * uygulamanın kendi yedeğidir (§95).
 */
export class ExpoSecureStore implements SecureStore {
  async get(key: string): Promise<string | null> {
    const m = await import('expo-secure-store');
    return m.getItemAsync(key, this.#opts(m));
  }
  async set(key: string, value: string): Promise<void> {
    const m = await import('expo-secure-store');
    await m.setItemAsync(key, value, this.#opts(m));
  }
  async remove(key: string): Promise<void> {
    const m = await import('expo-secure-store');
    await m.deleteItemAsync(key, this.#opts(m));
  }
  #opts(m: typeof import('expo-secure-store')) {
    return { keychainAccessible: m.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  }
}
