// Checksum portu. Node'da node:crypto, RN'de expo-crypto ile sağlanır.
export type Hasher = (text: string) => Promise<string>;

export const nodeSha256: Hasher = async (text) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
};
