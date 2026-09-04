#!/usr/bin/env python3
"""V90 seed üretici.

../docs/v90/00-specification-part1.md içindeki normatif tablolardan seed JSON
dosyalarını üretir. Seed elle düzenlenmez; belge güncellenir ve bu script
yeniden çalıştırılır (`npm run gen:seed`).

Kaynak bölümler:
  §11  -> data/initial-profile.json
  §22–§26, §21 -> data/programs/v90.json
  §28  -> data/muscle-volume-targets.json
  §35, §36 -> data/exercises.json
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = ROOT / '../docs/v90/00-specification-part1.md'
DOC = SPEC.read_text(encoding='utf-8')

LPT = {'ext': 'externalLoadHigherIsHarder', 'asst': 'assistanceLowerIsHarder',
       'bw': 'bodyweight', 'bw+': 'bodyweightPlusExternalLoad',
       'lvl': 'machineLevel', 'band': 'distanceOrBand'}
JOINT_TR = {'omuz': 'shoulder', 'dirsek': 'elbow', 'bilek': 'wrist',
            'bel': 'lowerBack', 'kalça': 'hip', 'diz': 'knee', 'ayak bileği': 'ankle'}

def section(num: str) -> str:
    """§num bölümünün gövdesini döndürür."""
    m = re.search(rf'^## §{num}\.[^\n]*\n(.*?)(?=^## §|\Z)', DOC, re.S | re.M)
    if not m:
        sys.exit(f'HATA: §{num} bulunamadı')
    return m.group(1)

def rows(block: str, ncols: int):
    """Markdown tablo satırlarını (hizalama ve başlık satırı hariç) döndürür."""
    out = []
    for line in block.split('\n'):
        line = line.strip()
        if not line.startswith('|') or set(line) <= set('|-: '):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) != ncols:
            continue
        out.append(cells)
    return out

def unbold(x: str) -> str:
    return x.replace('**', '').strip()

# ---------------------------------------------------------------- exercises
def build_exercises():
    body = section('35')
    catalog = rows(body.split('**Eklem stresi')[0], 11)[1:]      # başlık satırını at

    cue_block = body.split('**Teknik ipuçları')[1].split('| ID | Gereksinim |')[0]
    assert '→' not in cue_block, 'ipucu bloğuna ilişki metni sızmış'
    cues = {m[0]: [c.strip() for c in m[1].split('·')]
            for m in re.findall(r'^\| `([a-z0-9-]+)` \| (.+?) \|$', cue_block, re.M)}

    stress_txt = body.split('**Eklem stresi profilleri**')[1].split('**Alternatif')[0]
    stress = {}
    for part in stress_txt.split('·'):
        m = re.search(r'`([a-z0-9-]+)`\s+(.+)', part)
        if not m:
            continue
        prof = {}
        for jm in re.finditer(r'(ayak bileği|omuz|dirsek|bilek|bel|kalça|diz)\s+(\d)', m.group(2)):
            prof[JOINT_TR[jm.group(1)]] = int(jm.group(2))
        if prof:
            stress[m.group(1)] = prof

    # ilişki paragrafı ipuçları tablosundan ÖNCE biter; ikisini karıştırma
    rel_txt = re.split(r'\*\*Teknik ipuçları|\| ID \|',
                       body.split('**Alternatif ilişkileri**')[1])[0]
    relations = []
    for part in rel_txt.split('·'):
        ids = re.findall(r'`([a-z0-9-]+)`', part)
        for prio, target in enumerate(ids[1:], start=1):
            relations.append({'exerciseId': ids[0], 'relatedExerciseId': target,
                              'relation': 'substitute', 'priority': prio * 10})

    out = []
    for c in catalog:
        eid = c[0].strip('`')
        out.append({
            'id': eid,
            'name': c[1],
            'nameTr': c[1],                       # v1: katalog adları İngilizce korunur (§78)
            'primaryMuscle': c[2],
            'secondaryMuscles': [] if c[3] == '—' else [x.strip() for x in c[3].split(',')],
            'movementPattern': c[4],
            'equipment': [x.strip() for x in c[5].split(',')],
            'lengthenedBias': int(c[6]),
            'skillLevel': c[7],
            'jointStressProfile': stress.get(eid, {}),
            'loadProgressionType': LPT[c[8]],
            'isUnilateral': c[9] == '✅',
            'volumeMultiplier': 1,
            'defaultIncrementKg': float(c[10]),
            'cues': cues.get(eid, []),
        })
    return out, relations

# ---------------------------------------------------------------- program
def build_program():
    overview = rows(section('21'), 6)[1:]
    templates = []
    for seq, tid, name, name_tr, sets, minutes in overview:
        templates.append({
            'id': tid.strip('`'),
            'sequenceOrder': int(seq),
            'name': name,
            'nameTr': name_tr,
            'estimatedMinutes': int(re.search(r'\d+', minutes).group()),
            'declaredWorkingSets': int(sets),
            'exercises': [],
        })

    by_name = {e['name']: e['id'] for e in EXERCISES}
    for tpl, sec in zip(templates, ['22', '23', '24', '25', '26']):
        for order, r in enumerate(rows(section(sec).split('**Direkt set')[0], 8)[1:]):
            _, ex_name, sets, reps, rir, rest, warm, _muscle = r
            base = ex_name.split(' (')[0].strip()
            if base not in by_name:
                sys.exit(f'HATA: §{sec} içindeki "{base}" katalogda yok')
            lo, hi = re.match(r'(\d+)[–-](\d+)', reps).groups()
            tpl['exercises'].append({
                'orderIndex': order,
                'exerciseId': by_name[base],
                'workingSets': int(sets),
                'warmupSets': int(warm),
                'repMin': int(lo), 'repMax': int(hi),
                'targetRir': int(rir),
                'restSeconds': int(re.search(r'\d+', rest).group()),
            })
    return {'id': 'v90', 'name': 'V90', 'version': 1, 'isCyclic': True,
            'durationDays': 90, 'workoutTemplates': templates}

# ---------------------------------------------------------------- volume
def build_volume():
    out = []
    for muscle, base, mx, prio in rows(section('28'), 4)[1:]:
        out.append({'muscle': muscle.strip('`'),
                    'baselineWeeklyDirectSets': int(base),
                    'maxRecommendedWeeklySets': int(mx),
                    'isPriority': '✅' in prio})
    return out

# ---------------------------------------------------------------- profile
def build_profile():
    txt = re.search(r'\| R11\.1 \|(.+?)\|', section('11'), re.S).group(1)
    key = {'Boy': ('heightCm', 'profile'), 'Kilo': ('weightKg', 'weight'),
           'Bel': ('waist', 'site'), 'Karın': ('abdomen', 'site'),
           'Omuz': ('shoulder', 'site'), 'Kalça': ('hip', 'site'),
           'Göğüs': ('chest', 'site'), 'Ön kol': ('forearm', 'site')}
    prof, meas, weight = {}, {}, None
    for m in re.finditer(r'\*\*([^*]+?)\s+([\d.]+)\s+(cm|kg)\*\*', txt):
        label, val, _unit = m.group(1), float(m.group(2)), m.group(3)
        if label not in key:
            sys.exit(f'HATA: §11 içinde tanınmayan alan: {label}')
        name, kind = key[label]
        if kind == 'profile':   prof[name] = val
        elif kind == 'weight':  weight = val
        else:                   meas[name] = val
    return {'profile': prof, 'weightKg': weight, 'measurementsCm': meas,
            'unknown': ['bicepsFlexed'],
            'note': 'Bükülü üst kol BİLİNMİYOR — onboarding\'de istenir (§11.2, R96.1).'}

# ---------------------------------------------------------------- yaz
EXERCISES, RELATIONS = build_exercises()

def write(rel_path, data):
    p = ROOT / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'  {rel_path:38s} {p.stat().st_size:>7,} B')

print('seed üretiliyor (kaynak: docs/v90/00-specification-part1.md)')
write('data/exercises.json', {'seedVersion': 1, 'exercises': EXERCISES, 'relations': RELATIONS})
write('data/programs/v90.json', build_program())
write('data/muscle-volume-targets.json', {'seedVersion': 1, 'targets': build_volume()})
write('data/initial-profile.json', build_profile())
print(f'  {len(EXERCISES)} hareket · {len(RELATIONS)} alternatif ilişkisi')
