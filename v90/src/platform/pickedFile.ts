// Seçilen dosyanın baytları — YEREL: expo-file-system. Web karşılığı
// pickedFile.web.ts (blob:/data: URI → fetch). Seçilen ORİJİNAL dosyaya
// dokunulmaz (R116.2); yalnızca okunur.
import { File } from 'expo-file-system';

export async function readPickedBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
