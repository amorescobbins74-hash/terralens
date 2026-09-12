import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyze } from '../lib/geo/analysis.ts';
import { toGeoJSON } from '../lib/geo/export.ts';
import type { Pair } from '../lib/geo/types.ts';
void test('a connected ring dissolves to one polygon with a real hole', async () => {
  const p = JSON.parse(
    await readFile(
      new URL('../public/data/paradise-pair.json', import.meta.url),
      'utf8',
    ),
  ) as Pair;
  const grid = {
    ...p.before.grid,
    width: 3,
    height: 3,
    bounds: [600000, 4400000, 600180, 4400180] as [
      number,
      number,
      number,
      number,
    ],
  };
  for (const c of [p.before, p.after]) {
    c.grid = grid;
    for (const k of ['red', 'green', 'blue', 'swir22'] as const)
      c.bands[k] = Array(9).fill(0.2);
    c.bands.scl = Array(9).fill(4);
    c.bands.nir = Array(9).fill(c === p.before ? 0.6 : 0.2);
  }
  p.after.bands.nir[4] = 0.6;
  const a = analyze(p, 'nbr', 0.27, 1),
    g = toGeoJSON(p, a);
  assert.equal(a.patches.length, 1);
  assert.equal(a.patches[0].pixels, 8);
  assert.equal(g.features[0].geometry.coordinates.length, 1);
  assert.equal(g.features[0].geometry.coordinates[0].length, 2);
});
void test('every real exported patch has finite closed rings and consistent pixel area', async () => {
  const p = JSON.parse(
    await readFile(
      new URL('../public/data/paradise-pair.json', import.meta.url),
      'utf8',
    ),
  ) as Pair;
  const a = analyze(p),
    g = toGeoJSON(p, a);
  assert.equal(g.features.length, a.patches.length);
  for (const feature of g.features) {
    assert.ok(
      Math.abs(feature.properties.area_ha - feature.properties.pixels * 0.36) <
        1e-9,
    );
    for (const polygon of feature.geometry.coordinates)
      for (const ring of polygon) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1));
        assert.ok(ring.flat().every(Number.isFinite));
      }
  }
});
