/** Kimlik üretimi — Node 22 ve RN (polyfill ile) `globalThis.crypto` sağlar. */
export type IdGenerator = () => string;
export const uuid: IdGenerator = () => globalThis.crypto.randomUUID();
