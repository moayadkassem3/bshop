// Builds the dark "Lacivert" map style (founder, 8 November 2026): OpenFreeMap's detailed
// Liberty style recoloured with the app's navy theme. Run after changing the colours below:
//   node scripts/build-navy-map-style.mjs [liberty.json]
// (pass a downloaded copy of https://tiles.openfreemap.org/styles/liberty where fetch has no network).
// It writes the style for the app (bundled) and for the website (served from public/).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const T = {
  land: '#0b1120', residential: '#0d1525', park: '#10231f', wood: '#0f211e', water: '#0b2b4c', waterLine: '#0d3358',
  building: '#111a2c', buildingLine: '#16213a',
  minor: '#26334d', secondary: '#31425f', primary: '#3b5079', motorway: '#4a63a0', casing: '#0d1424',
  rail: '#26324b', path: '#1a2437', boundary: '#38466a', aeroway: '#141d30',
  label: '#b3bccd', labelMuted: '#8792a8', waterLabel: '#6f9bd0', halo: '#0b1120',
};
const has = (id, ...words) => words.some((w) => id.includes(w));

export function navy(style) {
  for (const l of style.layers) {
    const id = l.id;
    const p = (l.paint ??= {});
    if (l.type === 'background') p['background-color'] = T.land;
    else if (l.type === 'fill' || l.type === 'fill-extrusion') {
      const key = l.type === 'fill' ? 'fill-color' : 'fill-extrusion-color';
      if (has(id, 'water')) p[key] = T.water;
      else if (has(id, 'building')) {
        p[key] = T.building;
        if (l.type === 'fill') p['fill-outline-color'] = T.buildingLine;
        else p['fill-extrusion-opacity'] = 0.9;
      } else if (has(id, 'park', 'grass', 'pitch', 'cemetery')) p[key] = T.park;
      else if (has(id, 'wood', 'wetland')) p[key] = T.wood;
      else if (has(id, 'aeroway')) p[key] = T.aeroway;
      else if (has(id, 'road_area')) {
        p[key] = T.minor;
        delete p['fill-pattern'];
      } else p[key] = T.residential;
    } else if (l.type === 'line') {
      p['line-color'] = has(id, 'casing') ? T.casing
        : has(id, 'waterway') ? T.waterLine
        : has(id, 'motorway') ? T.motorway
        : has(id, 'trunk', 'primary') ? T.primary
        : has(id, 'secondary', 'tertiary') ? T.secondary
        : has(id, 'rail') ? T.rail
        : has(id, 'path', 'pedestrian', 'track') ? T.path
        : has(id, 'boundary') ? T.boundary
        : has(id, 'park_outline') ? T.park
        : has(id, 'aeroway') ? T.aeroway
        : T.minor;
      delete p['line-pattern'];
    } else if (l.type === 'symbol') {
      p['text-color'] = has(id, 'water') ? T.waterLabel : has(id, 'road', 'highway', 'poi') ? T.labelMuted : T.label;
      p['text-halo-color'] = T.halo;
      p['text-halo-width'] = 1.2;
      if (has(id, 'poi')) p['icon-opacity'] = 0.55;
    } else if (l.type === 'raster') p['raster-opacity'] = 0;
  }
  style.name = 'Lacivert';
  return style;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const liberty = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], 'utf8'))
  : await (await fetch('https://tiles.openfreemap.org/styles/liberty')).json();
const json = JSON.stringify(navy(liberty));
for (const file of ['apps/mobile/src/lib/mapStyleNavy.json', 'apps/web/public/map/lacivert.json']) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), json);
  console.log('wrote', file, `${(json.length / 1024).toFixed(0)} KB`);
}
