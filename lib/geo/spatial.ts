import proj4 from 'proj4';
import type { BBox, Grid } from './types.ts';
export function utm(epsg: number) {
  const north = epsg >= 32601 && epsg <= 32660,
    south = epsg >= 32701 && epsg <= 32760;
  if (!north && !south)
    throw new Error('当前支持 Sentinel-2 的 WGS84 / UTM 投影');
  return `+proj=utm +zone=${epsg % 100} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
}
export function lonLat(epsg: number, x: number, y: number): [number, number] {
  return proj4(utm(epsg), 'EPSG:4326', [x, y]) as [number, number];
}
export function validateBBox(b: BBox) {
  if (
    b.length !== 4 ||
    !b.every(Number.isFinite) ||
    b[0] >= b[2] ||
    b[1] >= b[3] ||
    b[0] < -180 ||
    b[2] > 180 ||
    b[1] < -80 ||
    b[3] > 84
  )
    throw new Error(
      '请输入有效范围：西经度 < 东经度、南纬度 < 北纬度，纬度在 -80 至 84 度之间',
    );
  if (b[2] - b[0] > 0.25 || b[3] - b[1] > 0.18)
    throw new Error('请缩小区域：经度跨度 ≤ 0.25°、纬度跨度 ≤ 0.18°');
}
export function makeGrid(aoi: BBox, epsg: number, resolution = 60): Grid {
  validateBBox(aoi);
  const corners = [
    [aoi[0], aoi[1]],
    [aoi[0], aoi[3]],
    [aoi[2], aoi[1]],
    [aoi[2], aoi[3]],
  ].map((p) => proj4('EPSG:4326', utm(epsg), p));
  const x0 =
      Math.floor(Math.min(...corners.map((p) => p[0])) / resolution) *
      resolution,
    y0 =
      Math.floor(Math.min(...corners.map((p) => p[1])) / resolution) *
      resolution;
  const x1 =
      Math.ceil(Math.max(...corners.map((p) => p[0])) / resolution) *
      resolution,
    y1 =
      Math.ceil(Math.max(...corners.map((p) => p[1])) / resolution) *
      resolution;
  const width = Math.round((x1 - x0) / resolution),
    height = Math.round((y1 - y0) / resolution);
  if (width > 320 || height > 320 || width < 2 || height < 2)
    throw new Error('分析区域每边需要 2–320 个 60 米网格，请调整范围');
  return { epsg, bounds: [x0, y0, x1, y1], width, height, resolution, aoi };
}
export function corners(grid: Grid): [number, number][] {
  const [w, s, e, n] = grid.bounds;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ].map(([x, y]) => lonLat(grid.epsg, x, y));
}
export function cellRing(
  grid: Grid,
  x: number,
  y: number,
  width = 1,
): [number, number][] {
  const [w, , , n] = grid.bounds,
    r = grid.resolution;
  return [
    [w + x * r, n - y * r],
    [w + x * r, n - (y + 1) * r],
    [w + (x + width) * r, n - (y + 1) * r],
    [w + (x + width) * r, n - y * r],
    [w + x * r, n - y * r],
  ].map(([a, b]) => lonLat(grid.epsg, a, b));
}
