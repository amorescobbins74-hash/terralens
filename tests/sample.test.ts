import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { analyze } from '../lib/geo/analysis.ts';
import type { Pair } from '../lib/geo/types.ts';
void test('bundled real satellite snapshot has matching hash, grid, source and useful observations', async () => {
  const file = await readFile(
    new URL('../public/data/paradise-pair.json', import.meta.url),
  );
  const checks = JSON.parse(
    await readFile(
      new URL('../public/data/checksums.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    createHash('sha256').update(file).digest('hex'),
    checks['paradise-pair.json'],
  );
  const p = JSON.parse(file.toString()) as Pair;
  assert.equal(p.source, 'snapshot');
  assert.equal(p.before.scene.id, 'S2B_10TFK_20181106_0_L2A');
  assert.equal(p.after.scene.id, 'S2A_10TFK_20181211_0_L2A');
  for (const c of [p.before, p.after])
    for (const values of Object.values(c.bands)) {
      assert.equal(values.length, c.grid.width * c.grid.height);
      assert.ok(values.every(Number.isFinite));
    }
  for (const metric of ['ndvi', 'nbr'] as const) {
    const a = analyze(p, metric);
    assert.ok(a.valid > 1000);
    assert.equal(
      a.valid + a.excluded,
      p.before.grid.width * p.before.grid.height,
    );
    assert.ok(a.patches.length > 0);
    assert.equal(a.loss + a.gain + a.stable, a.valid);
  }
});
