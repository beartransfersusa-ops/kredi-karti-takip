#!/usr/bin/env python3
"""001_initial.sql üretici.

../docs/v90/03-data-model.md §1 içindeki SQL bloklarından migration dosyasını
üretir; böylece şema belgesi ile çalışan SQL arasında kopukluk oluşamaz.
Bağlantı düzeyi PRAGMA'lar (journal_mode, synchronous, foreign_keys) dosyaya
dahil edilmez — bunları DB açılışında MigrationRunner ayarlar (02 §12).
"""
import pathlib, re, sqlite3, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
doc = (ROOT / '../docs/v90/03-data-model.md').resolve().read_text(encoding='utf-8')
region = doc.split('## 2. Migration')[0]
blocks = re.findall(r'```sql\n(.*?)```', region, re.S)
if not blocks:
    sys.exit('HATA: 03-data-model.md §1 içinde SQL bloğu bulunamadı')

sql = '\n\n'.join(b.strip() for b in blocks)
sql = '\n'.join(l for l in sql.split('\n')
                if not re.match(r'^\s*PRAGMA (journal_mode|synchronous|foreign_keys)', l))

out = ROOT / 'src/core/db/migrations/001_initial.sql'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    '-- 001_initial\n'
    '-- OTOMATİK ÜRETİLDİ: docs/v90/03-data-model.md §1 içindeki DDL bloklarından.\n'
    '-- Elle düzenleme YAPMA; belgeyi güncelle ve `npm run gen:migration` çalıştır.\n'
    '-- Bağlantı düzeyi PRAGMA\'lar (journal_mode=WAL, synchronous=FULL, foreign_keys=ON)\n'
    '-- MigrationRunner tarafından DB açılışında ayarlanır (02-architecture.md §12).\n\n'
    + sql + '\n', encoding='utf-8')

con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys = ON')
try:
    con.executescript(out.read_text(encoding='utf-8'))
except sqlite3.Error as e:
    sys.exit(f'HATA: üretilen DDL geçersiz — {e}')

count = lambda t: con.execute(
    f"SELECT COUNT(*) FROM sqlite_master WHERE type='{t}' AND name NOT LIKE 'sqlite_%'").fetchone()[0]
print(f'{out.relative_to(ROOT)} — {len(blocks)} blok, '
      f'{count("table")} tablo, {count("view")} görünüm, {count("index")} indeks · DDL geçerli')
