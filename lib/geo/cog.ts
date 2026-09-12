import { fromCustomClient } from 'geotiff';
import { RangeClient } from './range-client.ts';
import { centerSample } from './sampling.ts';
import { makeGrid, lonLat } from './spatial.ts';
import type { Band, BBox, Cube, Grid, Pair, Scene } from './types.ts';
const BANDS: Band[] = ['red', 'green', 'blue', 'nir', 'swir22', 'scl'];
function epsg(scene: Scene) {
  return (
    scene.properties['proj:epsg'] ??
    Number(scene.properties['proj:code']?.replace('EPSG:', ''))
  );
}
export async function readCube(
  scene: Scene,
  grid: Grid,
  progress: (s: string) => void,
  signal?: AbortSignal,
): Promise<Cube> {
  const bands = {} as Cube['bands'];
  for (const band of BANDS) {
    signal?.throwIfAborted();
    progress(
      `${scene.properties.datetime.slice(0, 10)} · 读取 ${band.toUpperCase()}`,
    );
    const asset = scene.assets[band];
    if (!asset?.href?.startsWith('https://'))
      throw new Error(`影像缺少公开 ${band} COG 波段`);
    const tiff = await fromCustomClient(
      new RangeClient(asset.href),
      { allowFullFile: false },
      signal,
    );
    try {
      const image = await tiff.getImage(),
        [ox, oy] = image.getOrigin(),
        [rx, ry] = image.getResolution();
      if (image.getGeoKeys()?.ProjectedCSTypeGeoKey !== grid.epsg)
        throw new Error('COG 坐标系与 STAC 记录不一致');
      if (rx <= 0 || ry >= 0) throw new Error('仅支持北向上的 Sentinel-2 栅格');
      const [w, s, e, n] = grid.bounds;
      const raw = [(w - ox) / rx, (n - oy) / ry, (e - ox) / rx, (s - oy) / ry];
      if (raw.some((v) => Math.abs(v - Math.round(v)) > 1e-4))
        throw new Error('源影像像元网格不对齐，无法进行可靠对比');
      const window = raw.map(Math.round);
      if (
        window[0] < 0 ||
        window[1] < 0 ||
        window[2] > image.getWidth() ||
        window[3] > image.getHeight()
      )
        throw new Error(
          '选中的影像未完整覆盖分析区域，请选择同一瓦片内的影像或缩小范围',
        );
      const native = await image.readRasters({
        window,
        samples: [0],
        interleave: true,
        signal,
      });
      const raster = centerSample(
        native as unknown as ArrayLike<number>,
        window[2] - window[0],
        window[3] - window[1],
        grid.width,
        grid.height,
      );
      const meta = asset['raster:bands']?.[0];
      if (
        band !== 'scl' &&
        (!Number.isFinite(meta?.scale) || !Number.isFinite(meta?.offset))
      )
        throw new Error(
          `影像 ${band} 缺少 scale/offset，已停止以避免错误反射率`,
        );
      const nodata = meta?.nodata ?? image.getGDALNoData() ?? 0;
      bands[band] = Array.from(raster as unknown as number[], (v) =>
        v === nodata
          ? band === 'scl'
            ? 0
            : -9999
          : band === 'scl'
            ? v
            : Number((v * meta!.scale! + meta!.offset!).toFixed(6)),
      );
    } finally {
      await tiff.close();
    }
  }
  // Clip the rotated UTM envelope back to the requested WGS84 rectangle.
  for (let i = 0; i < bands.scl.length; i++) {
    const x = i % grid.width,
      y = Math.floor(i / grid.width);
    const [lng, lat] = lonLat(
      grid.epsg,
      grid.bounds[0] + (x + 0.5) * grid.resolution,
      grid.bounds[3] - (y + 0.5) * grid.resolution,
    );
    if (
      lng < grid.aoi[0] ||
      lng > grid.aoi[2] ||
      lat < grid.aoi[1] ||
      lat > grid.aoi[3]
    )
      bands.scl[i] = 0;
  }
  return { scene, grid, bands };
}
export async function readPair(
  before: Scene,
  after: Scene,
  bbox: BBox,
  progress: (s: string) => void,
  signal?: AbortSignal,
): Promise<Pair> {
  if (
    before.id === after.id ||
    Date.parse(before.properties.datetime) >=
      Date.parse(after.properties.datetime)
  )
    throw new Error('请选择基准期早于对比期的不同影像');
  if (epsg(before) !== epsg(after))
    throw new Error('两期影像必须使用相同 UTM 分区，请换选同一瓦片');
  const grid = makeGrid(bbox, epsg(before));
  const a = await readCube(before, grid, progress, signal),
    b = await readCube(after, grid, progress, signal);
  return {
    before: a,
    after: b,
    source: 'live',
    retrievedAt: new Date().toISOString(),
  };
}
