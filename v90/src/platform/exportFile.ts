// Dışa aktarılan dosyanın kullanıcıya teslimi — YEREL: sandbox'a yaz + paylaşım
// sayfası (expo-sharing). Web karşılığı exportFile.web.ts: tarayıcı indirmesi.
//
// ZIP önce uygulama sandbox'ına yazılır; paylaşım iptali veri kaybı değildir
// (06 B.7). Paylaşım kullanılamıyorsa dosya yine cache'te durur.
import { File, Paths } from 'expo-file-system';

export type ExportDelivery = 'shared' | 'saved' | 'downloaded';

export async function deliverExport(
  bytes: Uint8Array, fileName: string, mimeType: string,
): Promise<ExportDelivery> {
  const out = new File(Paths.cache, fileName);
  if (out.exists) out.delete();
  out.create();
  out.write(bytes);

  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out.uri, { mimeType, dialogTitle: fileName });
    return 'shared';
  }
  return 'saved';
}
