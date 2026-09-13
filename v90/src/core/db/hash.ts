// Checksum portu — docs/v90/02-architecture.md §12.1.
//
// Yalnızca TİP. Gerçekleştirmeler ayrı dosyalarda durur ki platforma özgü
// kod yanlış bundle'a girmesin:
//   • Node/test → hash.node.ts  (node:crypto)
//   • Uygulama  → platform/hash.ts (expo-crypto)
export type Hasher = (text: string) => Promise<string>;
export type BytesHasher = (bytes: Uint8Array) => Promise<string>;
