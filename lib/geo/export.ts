import { lonLat } from './spatial.ts';
import polygonClipping from 'polygon-clipping';
import type { Analysis, Pair } from './types.ts';
export function manifest(pair: Pair, a: Analysis) {
  return {
    schema: 'terralens-evidence/1.0',
    software: 'TerraLens 1.0.0',
    exportedAt: new Date().toISOString(),
    retrievedAt: pair.retrievedAt,
    source: pair.source,
    catalog: 'https://earth-search.aws.element84.com/v1',
    before: pair.before.scene,
    after: pair.after.scene,
    grid: pair.before.grid,
    algorithm: {
      name: 'spectral-index-difference',
      metric: a.metric,
      formula:
        a.metric === 'ndvi'
          ? '(NIR-RED)/(NIR+RED)'
          : '(NIR-SWIR22)/(NIR+SWIR22)',
      delta: 'after - before',
      declineThreshold: -a.threshold,
      sclClasses: [4, 5, 6],
      resampling: 'nearest',
      connectivity: 4,
      minPatchPixels: a.minPixels,
      reflectance: 'DN * asset scale + asset offset',
      area: 'UTM planar grid cell area; exploratory 60m sampling',
    },
    summary: {
      validPixels: a.valid,
      excludedPixels: a.excluded,
      declinePixels: a.loss,
      increasePixels: a.gain,
      meanBefore: a.meanBefore,
      meanAfter: a.meanAfter,
      meanDelta: a.meanDelta,
      patchCount: a.patches.length,
    },
    limitations: [
      'Spectral decline is not proof of a specific cause.',
      'Seasonality, residual cloud/smoke and registration may affect results.',
      'Areas are 60m sampled grid estimates, not survey boundaries.',
    ],
  };
}
export function toGeoJSON(pair: Pair, a: Analysis) {
  const grid = pair.before.grid;
  return {
    type: 'FeatureCollection',
    terralens: manifest(pair, a),
    features: a.patches.map((p) => {
      // Union row strips on an integer grid BEFORE reprojection. This preserves
      // holes and removes shared boundaries (adjacent MultiPolygon parts alone
      // would be invalid in strict OGC topology validators).
      const cells = [...p.cells].sort((x, y) => x - y),
        strips: polygonClipping.Polygon[] = [];
      for (let j = 0; j < cells.length; j++) {
        const start = cells[j],
          y = Math.floor(start / grid.width),
          x = start % grid.width;
        let count = 1;
        while (
          j + 1 < cells.length &&
          cells[j + 1] === cells[j] + 1 &&
          Math.floor(cells[j + 1] / grid.width) === y
        ) {
          count++;
          j++;
        }
        strips.push([
          [
            [x, -y],
            [x, -y - 1],
            [x + count, -y - 1],
            [x + count, -y],
            [x, -y],
          ],
        ]);
      }
      const dissolved = polygonClipping.union(strips[0], ...strips.slice(1));
      const coordinates = dissolved.map((polygon) =>
        polygon.map((ring) =>
          ring.map(([x, y]) =>
            lonLat(
              grid.epsg,
              grid.bounds[0] + x * grid.resolution,
              grid.bounds[3] + y * grid.resolution,
            ),
          ),
        ),
      );
      return {
        type: 'Feature',
        id: p.id,
        properties: {
          patch_id: p.id,
          area_ha: p.hectares,
          mean_delta: p.meanChange,
          pixels: p.pixels,
          metric: a.metric,
          before: pair.before.scene.id,
          after: pair.after.scene.id,
        },
        geometry: { type: 'MultiPolygon', coordinates },
      };
    }),
  };
}
export function toCSV(a: Analysis) {
  return (
    'patch_id,pixels,area_ha,mean_delta,metric\r\n' +
    a.patches
      .map(
        (p) =>
          `${p.id},${p.pixels},${p.hectares.toFixed(4)},${p.meanChange.toFixed(6)},${a.metric}`,
      )
      .join('\r\n')
  );
}
export function download(
  name: string,
  content: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
