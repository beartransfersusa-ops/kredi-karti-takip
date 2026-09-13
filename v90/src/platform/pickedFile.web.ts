// Seçilen dosyanın baytları — WEB: seçici `blob:`/`data:` URI verir, fetch ile
// okunur. Yerel karşılığı pickedFile.ts (expo-file-system). Seçilen ORİJİNAL
// dosyaya dokunulmaz (R116.2); yalnızca okunur, hiçbir yere yüklenmez.
export async function readPickedBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`seçilen dosya okunamadı (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
