// Dışa aktarılan dosyanın kullanıcıya teslimi — WEB: tarayıcı indirmesi.
// Yerel karşılığı exportFile.ts (sandbox'a yaz + paylaşım sayfası).
//
// ZIP ŞİFRESİZDİR (02 §12.2) ve tarayıcının indirme klasörüne gider; ekran
// bunu kullanıcıya söyler (06 B.7). Sunucuya hiçbir şey gitmez: Blob yalnızca
// bu sekmenin belleğinde oluşur ve `blob:` URL ile indirilir.
export type ExportDelivery = 'shared' | 'saved' | 'downloaded';

export async function deliverExport(
  bytes: Uint8Array, fileName: string, mimeType: string,
): Promise<ExportDelivery> {
  // Kopya: BlobPart `ArrayBuffer` tabanlı görünüm ister; kaynak SharedArrayBuffer olabilir.
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Tıklama indirmeyi başlatır; URL hemen değil, bir sonraki döngüde
    // serbest bırakılır ki tarayıcı Blob'u okumaya başlamış olsun.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return 'downloaded';
}
