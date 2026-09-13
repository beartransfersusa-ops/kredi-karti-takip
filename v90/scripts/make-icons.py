#!/usr/bin/env python3
"""PWA simgeleri — public/icons/icon-192.png ve icon-512.png (ADR-013).

Sıfır bağımlılık: yalnızca zlib + struct ile PNG yazar. Koyu (#0f172a)
zemin üzerine dikdörtgenlerden kurulu bir "V". Üretilen dosyalar commit
edilir; bu script yalnızca simgeyi değiştirmek isteyince koşar:

    python3 scripts/make-icons.py
"""
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'icons')

BG = (0x0F, 0x17, 0x2A)   # app.config web.backgroundColor ile aynı
FG = (0x38, 0xBD, 0xF8)   # sky-400: koyu zeminde okunur, R118 ile ilgisi yok


def chunk(tag: bytes, data: bytes) -> bytes:
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))


def in_v(x: float, y: float) -> bool:
    """Birim karede (0..1) 'V' harfi: iki eğik kalın çizgi."""
    # Çizgi kalınlığı ve kenar boşluğu oranı; 192'de de 512'de de aynı görünür.
    t = 0.11
    top, bottom = 0.22, 0.78
    if not (top <= y <= bottom):
        return False
    p = (y - top) / (bottom - top)          # 0 üstte, 1 altta
    left = 0.20 + p * 0.30                  # sol çizgi merkez x
    right = 0.80 - p * 0.30                 # sağ çizgi merkez x
    return abs(x - left) <= t / 2 or abs(x - right) <= t / 2


def png(px: int) -> bytes:
    rows = []
    for j in range(px):
        row = bytearray([0])                # filtre tipi 0
        for i in range(px):
            rgb = FG if in_v((i + 0.5) / px, (j + 0.5) / px) else BG
            row.extend(rgb)
        rows.append(bytes(row))
    raw = b''.join(rows)
    ihdr = struct.pack('>IIBBBBB', px, px, 8, 2, 0, 0, 0)   # 8 bit, RGB
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for px in (192, 512):
        path = os.path.join(OUT, f'icon-{px}.png')
        with open(path, 'wb') as f:
            f.write(png(px))
        print(f'{os.path.relpath(path, ROOT)}: {os.path.getsize(path)} bayt')


if __name__ == '__main__':
    main()
