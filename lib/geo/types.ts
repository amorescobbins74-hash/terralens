export type BBox = [number, number, number, number];
export type Band = 'red' | 'green' | 'blue' | 'nir' | 'swir22' | 'scl';
export type Metric = 'ndvi' | 'nbr';
export type Asset = {
  href: string;
  'raster:bands'?: { scale?: number; offset?: number; nodata?: number }[];
};
export type Scene = {
  id: string;
  collection: string;
  bbox: number[];
  properties: {
    datetime: string;
    'eo:cloud_cover': number;
    'proj:epsg'?: number;
    'proj:code'?: string;
    [key: string]: unknown;
  };
  assets: Record<string, Asset>;
  links?: { rel: string; href: string }[];
};
export type Grid = {
  epsg: number;
  bounds: BBox;
  width: number;
  height: number;
  resolution: number;
  aoi: BBox;
};
export type Cube = { scene: Scene; grid: Grid; bands: Record<Band, number[]> };
export type Pair = {
  before: Cube;
  after: Cube;
  source: 'live' | 'snapshot';
  retrievedAt: string;
};
export type Patch = {
  id: number;
  pixels: number;
  hectares: number;
  meanChange: number;
  cells: number[];
};
export type Analysis = {
  metric: Metric;
  threshold: number;
  minPixels: number;
  valid: number;
  excluded: number;
  loss: number;
  gain: number;
  stable: number;
  meanBefore: number | null;
  meanAfter: number | null;
  meanDelta: number | null;
  before: (number | null)[];
  after: (number | null)[];
  delta: (number | null)[];
  labels: number[];
  patches: Patch[];
  histogram: number[];
};
