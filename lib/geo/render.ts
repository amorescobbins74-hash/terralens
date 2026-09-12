import type { Analysis, Pair } from './types.ts';
export type View = 'compare' | 'change' | 'index';
export function color(delta: number): [number, number, number] {
  const t = Math.min(1, Math.abs(delta) / 0.7),
    base = [108, 129, 141],
    target = delta < 0 ? [253, 127, 76] : [87, 222, 179];
  return base.map((v, i) => Math.round(v + (target[i] - v) * t)) as [
    number,
    number,
    number,
  ];
}
export function paint(
  canvas: HTMLCanvasElement,
  pair: Pair,
  a: Analysis,
  view: View,
  split: number,
  selected: number | null,
) {
  const { width, height } = pair.before.grid;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    let rgb: number[],
      alpha = 255;
    if (view === 'compare') {
      const cube = i % width < (width * split) / 100 ? pair.before : pair.after;
      rgb = ['red', 'green', 'blue'].map((b) =>
        Math.round(
          255 *
            Math.pow(
              Math.max(0, Math.min(1, cube.bands[b as 'red'][i] / 0.32)),
              1 / 1.7,
            ),
        ),
      );
      if (cube.bands.scl[i] === 0) alpha = 0;
    } else if (a.delta[i] === null) {
      rgb = [56, 65, 79];
      alpha = (Math.floor(i / width) + (i % width)) % 2 ? 160 : 100;
    } else if (view === 'change') rgb = color(a.delta[i]!);
    else {
      const v = a.after[i]!;
      rgb =
        v < 0
          ? [39, 89, 133]
          : [
              Math.round(192 - v * 152),
              Math.round(155 + v * 36),
              Math.round(85 - v * 25),
            ];
    }
    if (selected !== null && a.labels[i] === selected) {
      rgb = [255, 230, 145];
    }
    image.data.set([...rgb, alpha], i * 4);
  }
  ctx.putImageData(image, 0, 0);
}
