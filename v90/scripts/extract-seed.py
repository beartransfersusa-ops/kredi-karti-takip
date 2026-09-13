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

# Tüm seed dosyaları aynı sürümü taşır; installSeed bunu tek kapı olarak kullanır.
# 2: besin listesi (§46.1) ve beslenme hedefi (§42–§44) eklendi.
SEED_VERSION = 2

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
            'nutritionTarget': build_nutrition_target(),
            'note': 'Bükülü üst kol BİLİNMİYOR — onboarding\'de istenir (§11.2, R96.1).'}


def build_nutrition_target():
    """§42–§44: başlangıç kalori/makro hedefi. Değerler belgeden okunur, uydurulmaz."""
    def grab(sec, rid, pattern):
        m = re.search(rf'\| {re.escape(rid)} \|(.+?)\|', section(sec), re.S)
        if not m:
            sys.exit(f'HATA: {rid} bulunamadı')
        v = re.search(pattern, m.group(1))
        if not v:
            sys.exit(f'HATA: {rid} içinde değer okunamadı: {m.group(1)[:80]}')
        return int(v.group(1).replace('.', ''))
    kcal = grab('42', 'R42.1', r'\*\*([\d.]+)\s*kcal\*\*')
    protein = grab('43', 'R43.1', r'\*\*(\d+)\s*g/gün\*\*')
    fat = grab('44', 'R44.1', r'\*\*(\d+)\s*g/gün\*\*')
    carb = grab('44', 'R44.2', r'\*\*(\d+)\s*g/gün\*\*')
    # R44.3 makro dağılımı toplamla tutarlı olmalı (4/4/9).
    if abs(4 * protein + 4 * carb + 9 * fat - kcal) > 20:
        sys.exit(f'HATA: §44 makro dağılımı {kcal} kcal ile tutarsız')
    return {'kcal': kcal, 'proteinG': protein, 'carbG': carb, 'fatG': fat,
            'rationaleTr': ('Başlangıç hedefi: ~500 kcal açık (R42.2), 200 g protein (R43.1), '
                            '80 g yağ (R44.1), kalan karbonhidrat (R44.2). Bu bir tahmindir; '
                            'kilo trendi ve bel ölçüsüyle 2 haftada bir gözden geçirilir (R41.3, R49.1).')}

# ---------------------------------------------------------------- foods
SERVING_UNITS = {'g', 'ml', 'piece', 'scoop', 'slice'}
SOURCE = {'usda': 'seed:usda', 'tr': 'seed:tr-label'}
CATEGORIES = {'protein', 'süt ürünü', 'tahıl', 'baklagil', 'sebze', 'meyve',
              'kuruyemiş', 'yağ', 'tatlı', 'yemek', 'içecek'}


def build_foods():
    """§46.1 tablosu → food-items.json. Tutarsız satır üretimi DURDURUR."""
    body = section('46')
    if '§46.1' not in body:
        sys.exit('HATA: §46.1 seed besin listesi bulunamadı')
    out, ids, names, errors = [], set(), set(), []

    def num(cell, field, fid):
        if cell == '—':
            return None
        try:
            return float(cell)
        except ValueError:
            errors.append(f'{fid}: {field} sayı değil: {cell!r}')
            return None

    for cells in rows(body, 11):
        fid, name, cat, src, unit, serving, kcal, p, c, f, fiber = cells
        if fid == 'id':
            continue
        if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', fid):
            errors.append(f'{fid}: id kebab-case değil'); continue
        if fid in ids:
            errors.append(f'{fid}: id tekrar ediyor')
        if name in names:
            errors.append(f'{fid}: ad tekrar ediyor: {name}')
        ids.add(fid); names.add(name)
        if cat not in CATEGORIES:
            errors.append(f'{fid}: bilinmeyen kategori {cat!r}')
        if src not in SOURCE:
            errors.append(f'{fid}: kaynak usda|tr olmalı: {src!r}')
        if unit not in SERVING_UNITS:
            errors.append(f'{fid}: birim {sorted(SERVING_UNITS)} içinde değil: {unit!r}')

        kcal_v, p_v, c_v, f_v = (num(kcal, 'kcal', fid), num(p, 'P', fid),
                                 num(c, 'K', fid), num(f, 'Y', fid))
        fiber_v = num(fiber, 'Lif', fid)
        serving_v = num(serving, 'porsiyon', fid)
        if None in (kcal_v, p_v, c_v, f_v, serving_v):
            continue
        if kcal_v < 0 or p_v < 0 or c_v < 0 or f_v < 0 or serving_v <= 0:
            errors.append(f'{fid}: negatif değer ya da porsiyon ≤ 0')
        if unit in ('g', 'ml') and serving_v != 100:
            errors.append(f'{fid}: g/ml biriminde porsiyon 100 olmalı (R46.4)')
        if fiber_v is not None and fiber_v > c_v + 0.01:
            errors.append(f'{fid}: lif ({fiber_v}) karbonhidrattan ({c_v}) büyük')

        # Makro-tutarlılık (belgedeki kural): 4P+4K+9Y ya da lif düşülmüş hâli.
        full = 4 * p_v + 4 * c_v + 9 * f_v
        net = 4 * p_v + 4 * (c_v - (fiber_v or 0)) + 9 * f_v
        tol = max(25, 0.12 * max(kcal_v, full))
        if abs(kcal_v - full) > tol and abs(kcal_v - net) > tol:
            errors.append(f'{fid}: kcal {kcal_v} makro toplamıyla ({full:.0f} / net {net:.0f}) tutarsız')

        out.append({
            'id': fid, 'name': name, 'category': cat, 'source': SOURCE.get(src, src),
            'servingUnit': unit, 'servingSizeG': serving_v,
            'per100g': {'kcal': kcal_v, 'protein': p_v, 'carb': c_v, 'fat': f_v, 'fiber': fiber_v},
        })

    if errors:
        sys.exit('HATA: §46.1 besin tablosu tutarsız:\n  ' + '\n  '.join(errors))
    if not 150 <= len(out) <= 250:
        sys.exit(f'HATA: R46.1 150–250 kalem ister, {len(out)} bulundu')
    return out


# ---------------------------------------------------------------- yaz
EXERCISES, RELATIONS = build_exercises()

def write(rel_path, data):
    p = ROOT / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'  {rel_path:38s} {p.stat().st_size:>7,} B')

print('seed üretiliyor (kaynak: docs/v90/00-specification-part1.md)')
write('data/exercises.json', {'seedVersion': SEED_VERSION, 'exercises': EXERCISES, 'relations': RELATIONS})
write('data/programs/v90.json', build_program())
write('data/muscle-volume-targets.json', {'seedVersion': SEED_VERSION, 'targets': build_volume()})
write('data/initial-profile.json', build_profile())
FOODS = build_foods()
write('data/food-items.json', {'seedVersion': SEED_VERSION, 'foods': FOODS})
print(f'  {len(EXERCISES)} hareket · {len(RELATIONS)} alternatif ilişkisi · {len(FOODS)} besin')

# ---------------------------------------------------------------- presets
# Ekipman preset'leri 02-architecture.md §11.4'teki normatif tablodadır.
ARCH = (ROOT / '../docs/v90/02-architecture.md').read_text(encoding='utf-8')

def equipment_presets() -> dict:
    m = re.search(r'\| EquipmentTag \| fullCommercialGym \| homeGym \| limitedGym \|\n\|[^\n]*\n((?:\|[^\n]*\n)+)', ARCH)
    if not m:
        sys.exit('HATA: ekipman preset tablosu bulunamadı (02-architecture.md)')
    presets = {'fullCommercialGym': [], 'homeGym': [], 'limitedGym': []}
    order = ['fullCommercialGym', 'homeGym', 'limitedGym']
    for line in m.group(1).strip().splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) != 4:
            sys.exit(f'HATA: preset satırı 4 hücre değil: {line}')
        tag = cells[0].strip('`')
        for i, name in enumerate(order):
            if cells[i + 1] == '✓':
                presets[name].append(tag)
    if len(presets['fullCommercialGym']) != 20:
        sys.exit(f"HATA: fullCommercialGym 20 etiket olmalı, {len(presets['fullCommercialGym'])} bulundu")
    for name in ('homeGym', 'limitedGym'):
        if 'bodyweightOnly' not in presets[name]:
            sys.exit(f'HATA: {name} preset\'inde bodyweightOnly yok')
    return {'seedVersion': SEED_VERSION, 'presets': presets}

write('data/equipment-presets.json', equipment_presets())
