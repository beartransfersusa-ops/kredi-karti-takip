// GEÇİCİ ambient tanımlar.
//
// Expo uygulaması (`npx create-expo-app` + prebuild) bu depoya eklendiğinde
// gerçek paketler kurulacak ve BU DOSYA SİLİNECEK. Şimdilik yalnızca
// production sürücülerinin tip denetiminden geçmesini sağlar; çalışma zamanı
// davranışı Node testlerinde sqlcipherNode sürücüsüyle doğrulanır.

declare module 'expo-secure-store' {
  export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: string;
  export interface SecureStoreOptions { keychainAccessible?: string }
  export function getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
  export function setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
  export function deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
}

declare module 'expo-sqlite' {
  export interface SQLiteRunResult { changes: number; lastInsertRowId: number }
  export interface SQLiteDatabase {
    execAsync(source: string): Promise<void>;
    runAsync(source: string, params?: readonly unknown[]): Promise<SQLiteRunResult>;
    getFirstAsync<T>(source: string, params?: readonly unknown[]): Promise<T | null>;
    getAllAsync<T>(source: string, params?: readonly unknown[]): Promise<T[]>;
    closeAsync(): Promise<void>;
  }
  export interface SQLiteOpenOptions { useNewConnection?: boolean; enableChangeListener?: boolean }
  export function openDatabaseAsync(name: string, options?: SQLiteOpenOptions): Promise<SQLiteDatabase>;
}

declare module 'expo-crypto' {
  export function getRandomBytes(byteCount: number): Uint8Array;
  export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
}
