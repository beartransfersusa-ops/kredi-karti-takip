#!/usr/bin/env python3
"""Üretilmiş dosyalar belgeyle uyumlu mu?

Üreticileri geçici bir dizine yeniden çalıştırıp mevcut çıktıyla karşılaştırır.
Fark varsa: belge güncellenmiş ama `npm run gen` çalıştırılmamış demektir.
CI bu kontrolle seed/migration kaymasını yakalar.
"""
import filecmp, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
GENERATED = ['src/core/db/migrations/001_initial.sql', 'data/exercises.json',
             'data/programs/v90.json', 'data/muscle-volume-targets.json',
             'data/initial-profile.json']

snapshot = {}
with tempfile.TemporaryDirectory() as tmp:
    for rel in GENERATED:
        src = ROOT / rel
        if not src.exists():
            sys.exit(f'HATA: {rel} yok — `npm run gen` çalıştır')
        dst = pathlib.Path(tmp) / rel.replace('/', '_')
        shutil.copy2(src, dst)
        snapshot[rel] = dst

    for script in ['extract-migration.py', 'extract-seed.py']:
        r = subprocess.run([sys.executable, str(ROOT / 'scripts' / script)],
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode != 0:
            sys.exit(f'HATA: {script} başarısız\n{r.stdout}{r.stderr}')

    drift = [rel for rel, snap in snapshot.items()
             if not filecmp.cmp(snap, ROOT / rel, shallow=False)]

if drift:
    print('KAYMA TESPİT EDİLDİ — belge değişmiş ama üretilmiş dosyalar güncellenmemiş:')
    for rel in drift:
        print(f'  • {rel}')
    print('\nDüzeltme: `npm run gen` çalıştır ve sonucu commit et.')
    sys.exit(1)
print(f'{len(GENERATED)} üretilmiş dosyanın tamamı belgeyle uyumlu (kayma yok).')
