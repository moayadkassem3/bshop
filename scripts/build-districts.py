"""Builds Türkiye's il/ilçe list with a centre point per ilçe, for
apps/web/src/components/register/provinces.ts.

Inputs (put them under SRC):
  SRC/tapi/provinces.json, SRC/tapi/districts.json
    https://github.com/ubeydeozdmr/turkiye-api/tree/main/datasets
  SRC/gb/ADM1.geojson, SRC/gb/ADM2.geojson
    geoBoundaries gbOpen TUR ADM1/ADM2 "_simplified.geojson" from
    https://github.com/wmgeolab/geoBoundaries/tree/main/releaseData/gbOpen/TUR

Usage: python3 scripts/build-districts.py SRC out.json, then turn out.json into
provinces.ts (81 provinces, 973 districts; "Hakkari" is kept as "Hakkâri").

Names and province centres: turkiye-api (MIT). District geometry: geoBoundaries
gbOpen TUR ADM2, from OpenStreetMap (ODbL). Each district gets a point inside
its own boundary (the area centroid when it falls inside, else the inside point
nearest to it), rounded to 4 decimals (~10 m).
"""
import json, sys, unicodedata

src, out = sys.argv[1], sys.argv[2]
provinces = json.load(open(f'{src}/tapi/provinces.json'))
districts = json.load(open(f'{src}/tapi/districts.json'))
adm1 = json.load(open(f'{src}/gb/ADM1.geojson'))['features']
adm2 = json.load(open(f'{src}/gb/ADM2.geojson'))['features']

def rings(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    return polys

def inside(pt, geom):
    x, y = pt
    hit = False
    for poly in rings(geom):
        for ring in poly:  # even-odd over all rings handles holes
            n = len(ring)
            for i in range(n):
                x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                    hit = not hit
    return hit

def centroid(geom):
    a = cx = cy = 0.0
    for poly in rings(geom):
        ring = poly[0]
        for i in range(len(ring) - 1):
            x1, y1 = ring[i]; x2, y2 = ring[i + 1]
            c = x1 * y2 - x2 * y1
            a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    return (cx / (3 * a), cy / (3 * a))

def bbox(geom):
    xs = [p[0] for poly in rings(geom) for p in poly[0]]; ys = [p[1] for poly in rings(geom) for p in poly[0]]
    return min(xs), min(ys), max(xs), max(ys)

def point_inside(geom):
    c = centroid(geom)
    if inside(c, geom):
        return c
    x0, y0, x1, y1 = bbox(geom)
    best = None
    steps = 60
    for i in range(1, steps):
        for j in range(1, steps):
            p = (x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * j / steps)
            if inside(p, geom):
                d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2
                if best is None or d < best[0]:
                    best = (d, p)
    return best[1]

def norm(s):
    s = s.replace('İ', 'i').replace('I', 'ı').lower()
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))
    return s.replace('ı', 'i').replace('â', 'a').replace(' ', '').replace('-', '')

# Spelled differently in the boundary data.
ALIASES = {'Karakeçili': 'Karakeçeli', 'Gediz': 'Gediz Merkez'}
# Island districts missing from the boundary data: their town centres.
ISLANDS = {'Gökçeada': (40.1985, 25.9064), 'Adalar': (40.8576, 29.1207)}

# Which province each ADM2 polygon lies in.
prov_geom = {f['properties']['shapeISO']: f['geometry'] for f in adm1}
by_prov = {}
for f in adm2:
    p = point_inside(f['geometry'])
    f['point'] = p
    iso = next((iso for iso, g in prov_geom.items() if inside(p, g)), None)
    by_prov.setdefault(iso, []).append(f)

result, problems = [], []
for prov in sorted(provinces, key=lambda p: p['id']):
    iso = f"TR-{prov['id']:02d}"
    cands = by_prov.get(iso, [])
    capital = (prov['coordinates']['longitude'], prov['coordinates']['latitude'])
    items = []
    for d in sorted((d for d in districts if d['provinceId'] == prov['id']), key=lambda d: d['name']):
        if d['name'] == 'Merkez':
            match = [f for f in cands if inside(capital, f['geometry'])]
        elif d['name'] in ISLANDS:
            lat, lng = ISLANDS[d['name']]
            items.append({'name': d['name'], 'lat': lat, 'lng': lng})
            continue
        else:
            want = norm(ALIASES.get(d['name'], d['name']))
            match = [f for f in cands if norm(f['properties']['shapeName']) == want]
        if len(match) != 1:
            problems.append((prov['name'], d['name'], [f['properties']['shapeName'] for f in match]))
            continue
        lng, lat = match[0]['point']
        items.append({'name': d['name'], 'lat': round(lat, 4), 'lng': round(lng, 4)})
    result.append({'name': prov['name'], 'lat': round(capital[1], 4), 'lng': round(capital[0], 4), 'districts': items})

used = {id(f) for fs in by_prov.values() for f in fs}
print('districts placed:', sum(len(p['districts']) for p in result), 'problems:', len(problems))
for p in problems[:60]:
    print(' ', p)
json.dump(result, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
