#!/usr/bin/env python3
"""V90 Türkçe metin üretici.

../docs/v90/06-ux-flows.md içindeki "Türkçe metinler" tablolarından
src/ui/i18n/tr.generated.ts dosyasını üretir. UI metni elle yazılmaz: belge
güncellenir ve bu script yeniden çalıştırılır (`npm run gen:i18n`).

Belgedeki tablo biçimi:
    | Anahtar | Metin | Kaynak |
    |---|---|---|
    | `home.day` | Day {X} / 90 | 01 R88.1 |

Toplanmayanlar (kasıtlı):
  • `a.b.*` biçimindeki toplu satırlar — tek tek anahtar değil, aile özeti.
  • Anahtar sütunu backtick içinde olmayan satırlar (enum/etiket tabloları).
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC_PATH = ROOT / '../docs/v90/06-ux-flows.md'
OUT = ROOT / 'src/ui/i18n/tr.generated.ts'

DOC = DOC_PATH.read_text(encoding='utf-8')

KEY_ROW = re.compile(r'^\|\s*`([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)`\s*\|(.+)$')
PLACEHOLDER = re.compile(r'\{([^{}\s]+)\}')


def cells(rest: str) -> list[str]:
    """Satırın kalan hücreleri; kaçışlı boruyu ayırıcı saymaz."""
    parts, buf, esc = [], '', False
    for ch in rest:
        if esc:
            buf += ch if ch == '|' else '\\' + ch
            esc = False
        elif ch == '\\':
            esc = True
        elif ch == '|':
            parts.append(buf.strip())
            buf = ''
        else:
            buf += ch
    if buf.strip():
        parts.append(buf.strip())
    return parts


def clean(text: str) -> str:
    """Metin hücresini kullanıcıya gösterilecek hâline indirger."""
    text = text.strip()
    # Kod işaretlerini kaldır: `x` -> x ; **x** -> x
    text = re.sub(r'`([^`]*)`', r'\1', text)
    text = re.sub(r'\*\*([^*]*)\*\*', r'\1', text)
    return text.strip()


def collect() -> dict[str, str]:
    out: dict[str, str] = {}
    conflicts: list[str] = []
    for line in DOC.splitlines():
        m = KEY_ROW.match(line)
        if not m:
            continue
        key, rest = m.group(1), m.group(2)
        c = cells(rest)
        if not c:
            continue
        text = clean(c[0])
        # Metin hücresi boşsa ya da yalnızca tire ise atla (tablo başka şey anlatıyor).
        if not text or text in {'-', '—', '–'}:
            continue
        # Aynı anahtar iki farklı metinle geçiyorsa belge çelişkilidir.
        if key in out and out[key] != text:
            conflicts.append(f'{key}: "{out[key]}" ≠ "{text}"')
        out.setdefault(key, text)
    if conflicts:
        sys.exit('HATA: aynı anahtar farklı metinlerle tanımlanmış:\n  ' + '\n  '.join(conflicts))
    return out


def ts_literal(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def render(entries: dict[str, str]) -> str:
    lines = [
        '// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.',
        '// Kaynak: docs/v90/06-ux-flows.md "Türkçe metinler" tabloları.',
        '// Yeniden üretmek için: npm run gen:i18n',
        '//',
        f'// {len(entries)} anahtar. Metin değişecekse ÖNCE belge güncellenir;',
        '// aksi halde `npm run verify:drift` CI\'da kırılır.',
        '',
        'export const tr = {',
    ]
    for key in sorted(entries):
        lines.append(f'  {ts_literal(key)}: {ts_literal(entries[key])},')
    lines += [
        '} as const;',
        '',
        'export type TrKey = keyof typeof tr;',
        '',
        '/** Metindeki {placeholder} adları — t() çağrısını tip düzeyinde denetler. */',
        'export type TrParams = {',
    ]
    for key in sorted(entries):
        names = sorted(set(PLACEHOLDER.findall(entries[key])))
        # Anahtar adı `mm:ss` gibi tanımlayıcı olmayabilir; alan adı tırnaklanır.
        shape = ('{ ' + '; '.join(f'{ts_literal(n)}: string | number' for n in names) + ' }'
                 if names else 'undefined')
        lines.append(f'  {ts_literal(key)}: {shape};')
    lines += ['};', '']
    return '\n'.join(lines)


entries = collect()
if len(entries) < 300:
    sys.exit(f'HATA: yalnızca {len(entries)} anahtar bulundu — belge biçimi değişmiş olabilir')
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(render(entries), encoding='utf-8')
print(f'{OUT.relative_to(ROOT)}: {len(entries)} anahtar üretildi')
