import test from 'node:test';
import assert from 'node:assert/strict';
import { index, analyze } from '../lib/geo/analysis.ts';
import { makeGrid, lonLat, validateBBox } from '../lib/geo/spatial.ts';
import { toGeoJSON, toCSV, manifest } from '../lib/geo/export.ts';
import { centerSample } from '../lib/geo/sampling.ts';
import type { Pair, Cube, Scene } from '../lib/geo/types.ts';
function fixture(): Pair {
  const grid = {
    epsg: 32610,
    bounds: [600000, 4400000, 600180, 4400120] as [
      number,
      number,
      number,
      number,
    ],
    width: 3,
    height: 2,
    resolution: 60,
    aoi: [-122, 39, -121, 40] as [number, number, number, number],
  };
  function cube(id: string, date: string, nir: number[]): Cube {
    return {
      scene: {
        id,
        collection: 'sentinel-2-l2a',
        bbox: [],
        properties: { datetime: date, 'eo:cloud_cover': 0 },
        assets: {},
      } as Scene,
      grid,
      bands: {
        red: Array(6).fill(0.2),
        green: Array(6).fill(0.2),
        blue: Array(6).fill(0.2),
        nir,
        swir22: Array(6).fill(0.2),
        scl: Array(6).fill(4),
      },
    };
  }
  return {
    before: cube('before', '2020-01-01T00:00:00Z', Array(6).fill(0.6)),
    after: cube(
      'after',
      '2020-01-11T00:00:00Z',
      [0.2, 0.2, 0.6, 0.6, 0.6, 0.2],
    ),
    source: 'snapshot',
    retrievedAt: '2020-01-12T00:00:00Z',
  };
}
void test('coarse sampling uses shared grid cell centers, not upper-left pixels', () => {
  assert.deepEqual(centerSample([0, 1, 2, 3, 4, 5], 6, 1, 2, 1), [1, 4]);
  assert.deepEqual(
    centerSample(
      Array.from({ length: 36 }, (_, i) => i),
      6,
      6,
      1,
      1,
    ),
    [21],
  );
  assert.throws(() => centerSample([1], 2, 2, 1, 1));
});
void test('normalized difference rejects zero, negative and non-finite reflectance', () => {
  assert.equal(index(0.6, 0.2), 0.49999999999999994);
  assert.equal(index(0, 0), null);
  assert.equal(index(-9999, 0.2), null);
  assert.equal(index(NaN, 0.2), null);
});
void test('joint quality mask excludes cloud in either date and uses paired means', () => {
  const p = fixture();
  p.before.bands.scl[0] = 9;
  p.after.bands.scl[1] = 3;
  const a = analyze(p, 'ndvi', 0.27, 1);
  assert.equal(a.valid, 4);
  assert.equal(a.excluded, 2);
  assert.equal(a.loss, 1);
  assert.equal(a.delta[0], null);
  assert.equal(a.delta[1], null);
  assert.ok(Math.abs(a.meanBefore! - 0.5) < 1e-9);
});
void test('four-neighbor connected patches do not wrap across row ends', () => {
  const p = fixture();
  p.after.bands.nir = [0.6, 0.6, 0.2, 0.2, 0.6, 0.6];
  const a = analyze(p, 'nbr', 0.27, 1);
  assert.equal(a.patches.length, 2);
  assert.equal(a.patches[0].pixels, 1);
  assert.equal(a.patches[0].hectares, 0.36);
});
void test('minimum patch filter leaves total decline counts intact', () => {
  const a = analyze(fixture(), 'nbr', 0.27, 2);
  assert.equal(a.loss, 3);
  assert.equal(a.patches.length, 1);
  assert.equal(a.patches[0].pixels, 2);
  assert.equal(a.patches[0].hectares, 0.72);
});
void test('all invalid pixels return null means, never NaN or zero evidence', () => {
  const p = fixture();
  p.after.bands.scl.fill(9);
  const a = analyze(p);
  assert.equal(a.valid, 0);
  assert.equal(a.meanBefore, null);
  assert.equal(a.meanDelta, null);
  assert.deepEqual(a.patches, []);
});
void test('grid and dates must be compatible', () => {
  const p = fixture();
  p.after.grid = { ...p.after.grid, resolution: 30 };
  assert.throws(() => analyze(p), /同/);
  const q = fixture();
  q.after.scene.id = q.before.scene.id;
  assert.throws(() => analyze(q), /不同/);
  const z = fixture();
  z.after.scene.properties.datetime = '2019-01-01';
  assert.throws(() => analyze(z), /早于/);
});
void test('parameters are bounded and bbox validation handles malformed coordinates', () => {
  assert.throws(() => analyze(fixture(), 'nbr', 0));
  assert.throws(() => analyze(fixture(), 'nbr', NaN));
  assert.throws(() => analyze(fixture(), 'nbr', 0.2, 0));
  assert.throws(() => validateBBox([0, 0, 2, 2]));
  assert.throws(() => validateBBox([NaN, 0, 0.1, 0.1]));
  assert.throws(() => validateBBox([2, 0, 1, 0.1]));
});
void test('UTM grid is snapped and reversible near known central meridian', () => {
  const g = makeGrid([-123.01, 39.99, -122.99, 40.01], 32610);
  assert.equal(g.bounds[0] % 60, 0);
  assert.equal(g.bounds[3] % 60, 0);
  const p = lonLat(32610, 500000, 0);
  assert.ok(Math.abs(p[0] + 123) < 1e-8);
  assert.ok(Math.abs(p[1]) < 1e-8);
});
void test('GeoJSON exports pixel strips rather than patch bounding rectangles', () => {
  const p = fixture(),
    a = analyze(p, 'nbr', 0.27, 1),
    geo = toGeoJSON(p, a);
  assert.equal(geo.features.length, 2);
  assert.equal(geo.features[0].geometry.type, 'MultiPolygon');
  assert.equal(geo.features[0].geometry.coordinates.length, 1);
  const ring = geo.features[0].geometry.coordinates[0][0];
  assert.deepEqual(ring[0], ring.at(-1));
  assert.equal(ring.length, 5);
  assert.ok(
    ring.every((c) => c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90),
  );
  assert.equal(geo.features[0].properties.area_ha, 0.72);
});
void test('CSV and manifest preserve parameters and data lineage', () => {
  const p = fixture(),
    a = analyze(p, 'ndvi', 0.3, 2);
  assert.ok(
    toCSV(a).startsWith('patch_id,pixels,area_ha,mean_delta,metric\r\n'),
  );
  const m = manifest(p, a);
  assert.equal(m.before.id, 'before');
  assert.equal(m.algorithm.declineThreshold, -0.3);
  assert.equal(m.algorithm.minPatchPixels, 2);
  assert.equal(m.grid.resolution, 60);
  assert.equal(m.source, 'snapshot');
});
