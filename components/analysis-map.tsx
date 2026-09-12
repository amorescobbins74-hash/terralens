'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Map as MapIcon } from 'lucide-react';
import { corners } from '../lib/geo/spatial.ts';
import { paint } from '../lib/geo/render.ts';
import type { View } from '../lib/geo/render.ts';
import type { Analysis, Pair } from '../lib/geo/types.ts';
export default function AnalysisMap({
  pair,
  analysis,
  view,
  split,
  selected,
}: {
  pair: Pair;
  analysis: Analysis;
  view: View;
  split: number;
  selected: number | null;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    canvas = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [base, setBase] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#101d29' },
            },
          ],
        },
        center: [-121.58, 39.75],
        zoom: 11,
        attributionControl: false,
      });
      map.current = m;
      m.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'top-right',
      );
      m.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution:
            'Contains modified Copernicus Sentinel data · Element 84',
        }),
        'bottom-right',
      );
      m.on('load', () => setReady(true));
    } catch {
      queueMicrotask(() =>
        setError('当前浏览器无法开启 WebGL 地图。分析统计与导出仍可使用。'),
      );
      return;
    }
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (!canvas.current) canvas.current = document.createElement('canvas');
    paint(canvas.current, pair, analysis, view, split, selected);
    const coords = corners(pair.before.grid) as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];
    const source = m.getSource('observation') as
      | maplibregl.CanvasSource
      | undefined;
    if (source) {
      source.setCoordinates(coords);
      source.play();
      m.once('render', () => source.pause());
      m.triggerRepaint();
    } else {
      m.addSource('observation', {
        type: 'canvas',
        canvas: canvas.current,
        coordinates: coords,
        animate: false,
      });
      m.addLayer({
        id: 'observation',
        type: 'raster',
        source: 'observation',
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
      });
    }
  }, [ready, pair, analysis, view, split, selected]);
  const fit = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const c = corners(pair.before.grid);
    const b = new maplibregl.LngLatBounds(c[0], c[0]);
    c.forEach((p) => b.extend(p));
    m.fitBounds(b, { padding: 42, duration: 500 });
  }, [pair]);
  useEffect(() => {
    if (ready) fit();
  }, [ready, fit]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (base && !m.getSource('osm')) {
      m.addSource('osm', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      });
      m.addLayer(
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
          paint: { 'raster-opacity': 0.5 },
        },
        'observation',
      );
      m.on('error', (e) => {
        if (e.error?.message)
          setError('在线底图加载失败；卫星分析图层不受影响。');
      });
    }
    if (m.getLayer('osm'))
      m.setLayoutProperty('osm', 'visibility', base ? 'visible' : 'none');
  }, [base, ready]);
  return (
    <div className="map-wrap">
      <div
        ref={container}
        className="map-container"
        aria-label="卫星影像分析地图"
      />
      <div className="map-top">
        <span className="map-badge">
          {view === 'compare'
            ? '两期真彩色影像'
            : view === 'change'
              ? `Δ${analysis.metric.toUpperCase()} · 对比期 − 基准期`
              : `对比期 ${analysis.metric.toUpperCase()}`}
        </span>
        <div className="map-actions">
          <button onClick={fit} title="返回研究区域" aria-label="返回研究区域">
            <Crosshair size={17} />
          </button>
          <button
            onClick={() => setBase(!base)}
            aria-pressed={base}
            title="切换在线底图"
            aria-label="切换在线底图"
          >
            <MapIcon size={17} />
          </button>
        </div>
      </div>
      <div className="map-legend">
        {view === 'change' ? (
          <>
            <span className="color-bar" />
            <span>下降 −1</span>
            <span>稳定 0</span>
            <span>上升 +1</span>
          </>
        ) : view === 'compare' ? (
          <>
            <span>
              A / {pair.before.scene.properties.datetime.slice(0, 10)}
            </span>
            <span>B / {pair.after.scene.properties.datetime.slice(0, 10)}</span>
          </>
        ) : (
          <span>蓝色：负值　棕色 → 绿色：指数升高</span>
        )}
      </div>
      {error && <output className="map-error">{error}</output>}
      <div className="map-resolution">
        60 m 分析网格 · EPSG:{pair.before.grid.epsg}
      </div>
    </div>
  );
}
