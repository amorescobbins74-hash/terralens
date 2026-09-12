import type { Analysis, Cube, Metric, Pair, Patch } from './types.ts';

export function index(a: number, b: number): number | null {
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a < 0 ||
    b < 0 ||
    a + b <= 1e-8
  )
    return null;
  return (a - b) / (a + b);
}
// SCL 4/5/6 only: vegetation, bare soil and water. Exclude cloud, shadow,
// cirrus, snow, dark/uncertain and invalid pixels in BOTH observations.
export function spectral(cube: Cube, metric: Metric): (number | null)[] {
  const n = cube.grid.width * cube.grid.height;
  for (const band of [
    'nir',
    metric === 'ndvi' ? 'red' : 'swir22',
    'scl',
  ] as const) {
    if (cube.bands[band]?.length !== n)
      throw new Error('波段长度与分析网格不一致');
  }
  return cube.bands.nir.map((v, i) =>
    [4, 5, 6].includes(cube.bands.scl[i])
      ? index(v, cube.bands[metric === 'ndvi' ? 'red' : 'swir22'][i])
      : null,
  );
}
export function analyze(
  pair: Pair,
  metric: Metric = 'nbr',
  threshold = 0.27,
  minPixels = 4,
): Analysis {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 2)
    throw new Error('阈值必须大于 0 且不超过 2');
  if (!Number.isInteger(minPixels) || minPixels < 1)
    throw new Error('最小斑块像元数必须为正整数');
  if (JSON.stringify(pair.before.grid) !== JSON.stringify(pair.after.grid))
    throw new Error('两期影像必须使用完全相同的分析网格');
  if (pair.before.scene.id === pair.after.scene.id)
    throw new Error('请选择不同日期的两期影像');
  if (
    !(
      Date.parse(pair.before.scene.properties.datetime) <
      Date.parse(pair.after.scene.properties.datetime)
    )
  )
    throw new Error('基准期必须早于对比期');
  const before = spectral(pair.before, metric),
    after = spectral(pair.after, metric);
  const delta = before.map((v, i) =>
    v === null || after[i] === null ? null : after[i]! - v,
  );
  const { width, height, resolution } = pair.before.grid;
  let valid = 0,
    loss = 0,
    gain = 0,
    sumB = 0,
    sumA = 0;
  const histogram = Array(20).fill(0),
    labels = Array(delta.length).fill(0);
  delta.forEach((v, i) => {
    if (v === null) return;
    valid++;
    sumB += before[i]!;
    sumA += after[i]!;
    if (v <= -threshold) loss++;
    else if (v >= threshold) gain++;
    histogram[Math.min(19, Math.max(0, Math.floor((v + 1) * 10)))]++;
  });
  const seen = new Uint8Array(delta.length),
    patches: Patch[] = [];
  for (let i = 0; i < delta.length; i++) {
    if (seen[i] || delta[i] === null || delta[i]! > -threshold) continue;
    const queue = [i];
    seen[i] = 1;
    let sum = 0;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      sum += delta[c]!;
      const x = c % width,
        y = Math.floor(c / width);
      const near = [
        ...(x > 0 ? [c - 1] : []),
        ...(x < width - 1 ? [c + 1] : []),
        ...(y > 0 ? [c - width] : []),
        ...(y < height - 1 ? [c + width] : []),
      ];
      for (const j of near)
        if (!seen[j] && delta[j] !== null && delta[j]! <= -threshold) {
          seen[j] = 1;
          queue.push(j);
        }
    }
    if (queue.length >= minPixels) {
      const id = patches.length + 1;
      queue.forEach((j) => (labels[j] = id));
      patches.push({
        id,
        pixels: queue.length,
        hectares: (queue.length * resolution * resolution) / 10000,
        meanChange: sum / queue.length,
        cells: queue,
      });
    }
  }
  patches.sort((a, b) => b.hectares - a.hectares);
  return {
    metric,
    threshold,
    minPixels,
    valid,
    excluded: delta.length - valid,
    loss,
    gain,
    stable: valid - loss - gain,
    meanBefore: valid ? sumB / valid : null,
    meanAfter: valid ? sumA / valid : null,
    meanDelta: valid ? (sumA - sumB) / valid : null,
    before,
    after,
    delta,
    labels,
    patches,
    histogram,
  };
}
