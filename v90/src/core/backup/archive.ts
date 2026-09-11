// Arşiv portu ve Node (zlib) uygulaması — docs/v90/02-architecture.md §2, §12.3.
// Production'da react-native-zip-archive aynı portu uygular; domain kodu
// hangisinin çalıştığını bilmez.

export interface ArchiveEntry { path: string; data: Uint8Array }

export interface Archiver {
  write(entries: readonly ArchiveEntry[]): Promise<Uint8Array>;
  read(zip: Uint8Array): Promise<ArchiveEntry[]>;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const METHOD_DEFLATE = 8;
const METHOD_STORE = 0;

/** CRC-32 (IEEE 802.3) — ZIP başlıkları için zorunlu. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Node'da zlib ile; RN'de native arşivleyici bu sınıfın yerine geçer. */
export class NodeArchiver implements Archiver {
  async write(entries: readonly ArchiveEntry[]): Promise<Uint8Array> {
    const { deflateRawSync } = await import('node:zlib');
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const e of entries) {
      const name = new TextEncoder().encode(e.path);
      const crc = crc32(e.data);
      const deflated = deflateRawSync(e.data);
      const useDeflate = deflated.length < e.data.length;
      const body = useDeflate ? new Uint8Array(deflated) : e.data;
      const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, LOCAL_SIG, true);
      lv.setUint16(4, 20, true);            // version needed
      lv.setUint16(6, 0x0800, true);        // UTF-8 adlar
      lv.setUint16(8, method, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true);
      lv.setUint32(22, e.data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);

      chunks.push(local, body);

      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, CENTRAL_SIG, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, e.data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);
      central.push(cen);

      offset += local.length + body.length;
    }

    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, EOCD_SIG, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return concat([...chunks, ...central, eocd]);
  }

  async read(zip: Uint8Array): Promise<ArchiveEntry[]> {
    const { inflateRawSync } = await import('node:zlib');
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new ArchiveError('ZIP sonu (EOCD) bulunamadı');

    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const out: ArchiveEntry[] = [];

    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== CENTRAL_SIG) throw new ArchiveError('merkezi dizin bozuk');
      const method = view.getUint16(p + 10, true);
      const crc = view.getUint32(p + 16, true);
      const compSize = view.getUint32(p + 20, true);
      const rawSize = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOff = view.getUint32(p + 42, true);
      const path = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));

      if (view.getUint32(localOff, true) !== LOCAL_SIG) throw new ArchiveError(`yerel başlık bozuk: ${path}`);
      const lNameLen = view.getUint16(localOff + 26, true);
      const lExtraLen = view.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const body = zip.subarray(start, start + compSize);

      const data = method === METHOD_DEFLATE ? new Uint8Array(inflateRawSync(body))
        : method === METHOD_STORE ? new Uint8Array(body)
          : (() => { throw new ArchiveError(`desteklenmeyen sıkıştırma: ${method}`); })();
      if (data.length !== rawSize) throw new ArchiveError(`boyut uyuşmuyor: ${path}`);
      if (crc32(data) !== crc) throw new ArchiveError(`CRC uyuşmuyor: ${path}`);

      out.push({ path, data });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }
}

export class ArchiveError extends Error {
  constructor(message: string) { super(message); this.name = 'ArchiveError'; }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b);
