import type { BBox, Scene } from './types.ts';
import { validateBBox } from './spatial.ts';
export const CATALOG = 'https://earth-search.aws.element84.com/v1';
export const SAMPLE_BBOX: BBox = [-121.63, 39.71, -121.53, 39.79];
export async function searchScenes(
  bbox: BBox,
  start: string,
  end: string,
  cloud: number,
  signal?: AbortSignal,
): Promise<{ scenes: Scene[]; truncated: boolean }> {
  validateBBox(bbox);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    start > end
  )
    throw new Error('请检查开始和结束日期');
  if (!Number.isFinite(cloud) || cloud < 0 || cloud > 100)
    throw new Error('云量应在 0–100%');
  const response = await fetch(`${CATALOG}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox,
      datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
      query: { 'eo:cloud_cover': { lte: cloud } },
      limit: 100,
    }),
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(45000),
    ]),
  });
  if (!response.ok)
    throw new Error(
      `卫星目录暂不可用（HTTP ${response.status}），可先加载内置真实案例`,
    );
  const data = (await response.json()) as {
    features: Scene[];
    links?: { rel: string }[];
  };
  if (!Array.isArray(data.features))
    throw new Error('目录返回了无法识别的数据');
  return {
    scenes: data.features
      .filter((s: Scene) =>
        ['red', 'green', 'blue', 'nir', 'swir22', 'scl'].every((b) =>
          s.assets?.[b]?.href?.startsWith('https://'),
        ),
      )
      .sort((a: Scene, b: Scene) =>
        a.properties.datetime.localeCompare(b.properties.datetime),
      ),
    truncated: !!data.links?.some((l: { rel: string }) => l.rel === 'next'),
  };
}
