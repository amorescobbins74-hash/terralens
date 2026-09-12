// GeoTIFF.js's generic nearest resize samples from the raster's top-left.
// Here every band uses the SAME target cell centers (important for 10m / 20m).
export function centerSample(
  values: ArrayLike<number>,
  inWidth: number,
  inHeight: number,
  width: number,
  height: number,
): number[] {
  if (values.length !== inWidth * inHeight || width < 1 || height < 1)
    throw new Error('Invalid raster shape');
  const out = Array.from({ length: width * height }, () => 0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(
          inWidth - 1,
          Math.floor(((x + 0.5) * inWidth) / width),
        ),
        sy = Math.min(
          inHeight - 1,
          Math.floor(((y + 0.5) * inHeight) / height),
        );
      out[y * width + x] = values[sy * inWidth + sx];
    }
  return out;
}
