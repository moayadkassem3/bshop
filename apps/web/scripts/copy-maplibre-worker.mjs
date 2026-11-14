// MapLibre runs map work in a Web Worker loaded from its own files. Bundling
// moves the main code, so the worker files are copied to public/ and the map
// points at them with setWorkerUrl (see src/components/explore/ExploreMap.tsx).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/package.json')) + '/dist';
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre');
mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(dist, file), join(target, file));
