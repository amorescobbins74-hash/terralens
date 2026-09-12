import { readCube } from '../lib/geo/cog.ts';
import { makeGrid } from '../lib/geo/spatial.ts';
import { CATALOG, SAMPLE_BBOX } from '../lib/geo/catalog.ts';
import { analyze } from '../lib/geo/analysis.ts';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Scene, Cube, Pair } from '../lib/geo/types.ts';
const ids = ['S2B_10TFK_20181106_0_L2A', 'S2A_10TFK_20181211_0_L2A'];
const scenes: Scene[] = [];
const cached = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], 'utf8'))
  : null;
for (const id of ids) {
  if (cached) {
    const item = cached.features.find((s: Scene) => s.id === id);
    if (!item) throw new Error('Cached catalog missing ' + id);
    scenes.push(item);
    continue;
  }
  const r = await fetch(`${CATALOG}/collections/sentinel-2-l2a/items/${id}`, {
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`STAC ${r.status}`);
  scenes.push(await r.json());
}
const grid = makeGrid(SAMPLE_BBOX, 32610),
  cubes: Cube[] = [];
const cacheDir = fileURLToPath(new URL('../.cache/', import.meta.url));
await mkdir(cacheDir, { recursive: true });
for (const scene of scenes) {
  const path = cacheDir + scene.id + '-center-v1.json';
  try {
    const cube = JSON.parse(await readFile(path, 'utf8'));
    if (JSON.stringify(cube.grid) === JSON.stringify(grid)) {
      cubes.push(cube);
      continue;
    }
  } catch {}
  let cube: Cube | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      cube = await readCube(
        scene,
        grid,
        console.log,
        AbortSignal.timeout(300000),
      );
      break;
    } catch (e) {
      console.log('Scene read failed; retry', attempt + 1);
      if (attempt === 2) throw e;
    }
  }
  if (!cube) throw new Error('No cube');
  cubes.push(cube);
  await writeFile(path, JSON.stringify(cube));
}
const pair: Pair = {
  before: cubes[0],
  after: cubes[1],
  source: 'snapshot',
  retrievedAt: new Date().toISOString(),
};
const output = fileURLToPath(new URL('../public/data/', import.meta.url));
await mkdir(output, { recursive: true });
const json = JSON.stringify(pair);
await writeFile(output + 'paradise-pair.json', json);
await writeFile(
  output + 'checksums.json',
  JSON.stringify(
    { 'paradise-pair.json': createHash('sha256').update(json).digest('hex') },
    null,
    2,
  ),
);
const a = analyze(pair);
console.log(
  JSON.stringify({
    grid: pair.before.grid,
    valid: a.valid,
    loss: a.loss,
    patches: a.patches.length,
    bytes: json.length,
  }),
);
