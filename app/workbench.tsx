'use client';
/* oxlint-disable react/react-compiler -- Imperative worker lifecycle currently triggers PruneHoistedContexts in the experimental compiler lint; the React compiler is not enabled. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Orbit,
  ArrowUpRight,
  Scan,
  Satellite,
  Download,
  Search,
  Play,
  RefreshCw,
  SlidersHorizontal,
  FileJson,
  Table2,
  BookOpen,
  CheckCircle2,
  Layers,
  X,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { analyze } from '../lib/geo/analysis.ts';
import { SAMPLE_BBOX, searchScenes } from '../lib/geo/catalog.ts';
import { validateBBox } from '../lib/geo/spatial.ts';
import { download, manifest, toCSV, toGeoJSON } from '../lib/geo/export.ts';
import { registerEvidenceTool } from '../lib/geo/webmcp.ts';
import type { Analysis, BBox, Metric, Pair, Scene } from '../lib/geo/types.ts';
import type { View } from '../lib/geo/render.ts';
const AnalysisMap = lazy(() => import('../components/analysis-map'));
const f = (n: number | null, d = 2) =>
  n === null
    ? '—'
    : n.toLocaleString('zh-CN', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const date = (s: Scene) => s.properties.datetime.slice(0, 10);
export default function Workbench() {
  const [pair, setPair] = useState<Pair | null>(null),
    [metric, setMetric] = useState<Metric>('nbr'),
    [threshold, setThreshold] = useState(0.27),
    [minPixels, setMinPixels] = useState(4);
  const [bboxText, setBBoxText] = useState(SAMPLE_BBOX.join(', ')),
    [start, setStart] = useState('2018-10-15'),
    [end, setEnd] = useState('2018-12-15'),
    [cloud, setCloud] = useState(20);
  const [scenes, setScenes] = useState<Scene[]>([]),
    [beforeId, setBeforeId] = useState(''),
    [afterId, setAfterId] = useState(''),
    [searchedBBox, setSearchedBBox] = useState<BBox>(SAMPLE_BBOX);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('正在加载内置真实卫星案例…'),
    [error, setError] = useState(''),
    [truncated, setTruncated] = useState(false);
  const [view, setView] = useState<View>('compare'),
    [split, setSplit] = useState(50),
    [selected, setSelected] = useState<number | null>(null),
    [showMethod, setShowMethod] = useState(false),
    [tab, setTab] = useState<'patches' | 'sources'>('patches');
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    generation = useRef(0),
    evidence = useRef<unknown>(null);
  const analysis = useMemo(
    () => (pair ? analyze(pair, metric, threshold, minPixels) : null),
    [pair, metric, threshold, minPixels],
  );

  useEffect(() => {
    evidence.current =
      pair && analysis ? manifest(pair, analysis) : { status: 'no-analysis' };
  }, [pair, analysis]);
  useEffect(() => registerEvidenceTool(() => evidence.current), []);
  // Cleanup intentionally cancels the latest active job, not just the mount-time job.
  /* oxlint-disable react-hooks/exhaustive-deps -- These refs hold imperative jobs, not DOM nodes; cleanup must read their latest values. */
  useEffect(() => {
    void loadSample();
    return () => {
      generation.current++;
      worker.current?.terminate();
      abort.current?.abort();
    };
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */
  function begin() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError('');
    return generation.current;
  }
  function finish(id: number) {
    if (id === generation.current) setBusy(false);
  }
  async function loadSample() {
    const id = begin();
    setMessage('读取内置真实 Sentinel-2 影像窗口…');
    try {
      const r = await fetch(
        import.meta.env.BASE_URL + 'data/paradise-pair.json',
        { signal: abort.current!.signal },
      );
      if (!r.ok) throw new Error('内置案例暂不可用，请尝试在线检索');
      const data = (await r.json()) as Pair;
      if (id !== generation.current) return;
      analyze(data);
      setPair(data);
      setSelected(null);
      setScenes([data.before.scene, data.after.scene]);
      setBeforeId(data.before.scene.id);
      setAfterId(data.after.scene.id);
      setBBoxText(data.before.grid.aoi.join(', '));
      setSearchedBBox(data.before.grid.aoi);
      setStart('2018-10-15');
      setEnd('2018-12-15');
      setTruncated(false);
      setView('compare');
      setMessage(
        '已加载真实历史影像快照；可直接调参分析，也可重新从云端读取。',
      );
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      finish(id);
    }
  }
  function getBBox(): BBox {
    const b = bboxText.split(/[,，]/).map((v) => Number(v.trim())) as BBox;
    validateBBox(b);
    return b;
  }
  async function search() {
    let b: BBox;
    try {
      b = getBBox();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return;
    }
    const id = begin();
    setMessage('检索公开卫星目录…');
    try {
      const result = await searchScenes(
        b,
        start,
        end,
        cloud,
        abort.current!.signal,
      );
      if (id !== generation.current) return;
      setScenes(result.scenes);
      setSearchedBBox(b);
      setTruncated(result.truncated);
      setBeforeId(result.scenes[0]?.id ?? '');
      setAfterId(result.scenes.at(-1)?.id ?? '');
      setMessage(
        result.scenes.length
          ? '找到 ' +
              result.scenes.length +
              ' 景影像。请选择同一瓦片的前后两期，再开始分析。'
          : '该范围没有符合条件的影像。请调整日期或云量。',
      );
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      finish(id);
    }
  }
  function run() {
    const before = scenes.find((s) => s.id === beforeId),
      after = scenes.find((s) => s.id === afterId);
    if (!before || !after) {
      setError('请先检索并选择两期影像');
      return;
    }
    if (before.id === after.id || date(before) >= date(after)) {
      setError('基准期必须早于对比期，请选择不同日期');
      return;
    }
    const id = begin();
    setMessage('创建统一分析网格…');
    try {
      const w = new Worker(
        new URL('../lib/geo/analysis.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (id !== generation.current) return;
        if (data.type === 'progress') setMessage(data.message);
        else if (data.type === 'result') {
          setPair(data.pair);
          setSelected(null);
          setView('change');
          setMessage(
            '云端真实影像分析完成。结果与导出均对应下方显示的区域和日期。',
          );
          w.terminate();
          worker.current = null;
          finish(id);
        } else {
          setError(data.message);
          w.terminate();
          worker.current = null;
          finish(id);
        }
      };
      w.onerror = () => {
        if (id !== generation.current) return;
        setError('影像处理进程失败，请重试或加载内置案例');
        w.terminate();
        worker.current = null;
        finish(id);
      };
      w.postMessage({ before, after, bbox: searchedBBox });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      finish(id);
    }
  }
  function cancel() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    setBusy(false);
    setMessage('已取消；保留上一次完成的结果。');
  }
  function exportFile(kind: 'geojson' | 'csv' | 'json') {
    if (!pair || !analysis) return;
    const stem = 'terralens-' + metric + '-' + date(pair.after.scene);
    if (kind === 'csv')
      download(stem + '.csv', toCSV(analysis), 'text/csv;charset=utf-8');
    else
      download(
        stem + (kind === 'geojson' ? '.geojson' : '-manifest.json'),
        JSON.stringify(
          kind === 'geojson'
            ? toGeoJSON(pair, analysis)
            : manifest(pair, analysis),
          null,
          2,
        ),
      );
    setMessage('已生成 ' + kind.toUpperCase() + ' 下载文件。');
  }
  const resolution = pair?.before.grid.resolution ?? 60;
  const lossHa = ((analysis?.loss ?? 0) * resolution ** 2) / 10000;
  const validPct = analysis
    ? (analysis.valid / (analysis.valid + analysis.excluded)) * 100
    : 0;
  const largest = analysis?.patches[0];
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Orbit size={28} />
          <b>TerraLens</b>
          <span>EARTH OBSERVATION LAB</span>
        </div>
        <div className="topright">
          <span className="status-dot" />
          <span>本地计算</span>
          <button
            className="text-button"
            onClick={() => setShowMethod(!showMethod)}
          >
            <BookOpen size={16} /> 方法与来源
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">工作空间 / WORKSPACE</div>
          <div className="nav-active">
            <Scan size={18} /> 地表变化分析 <span className="version">1.0</span>
          </div>
          <div className="divider" />
          <div className="section-heading">
            <div className="section-label">01 / 研究区域</div>
            <button
              className="icon-button"
              onClick={loadSample}
              disabled={busy}
              title="加载内置真实案例"
              aria-label="加载内置真实案例"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <h3>从一个真实案例开始</h3>
          <p className="muted compact">Paradise · 2018 年林火前后</p>
          <label className="field-label" htmlFor="bbox">
            区域范围 / WGS84
          </label>
          <textarea
            id="bbox"
            value={bboxText}
            onChange={(e) => setBBoxText(e.target.value)}
            rows={2}
          />
          <small className="hint">
            西经度, 南纬度, 东经度, 北纬度
            <br />
            支持小区域探索，每边约 20 km 以内
          </small>
          <div className="divider" />
          <div className="section-label">02 / 发现卫星影像</div>
          <div className="scene-mini">
            <Satellite size={18} />
            <div>
              Sentinel-2 L2A<small>地表反射率 · 开放数据</small>
            </div>
          </div>
          <div className="date-inputs">
            <label>
              开始日期
              <input
                aria-label="开始日期"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                aria-label="结束日期"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <label className="slider-label">
            整景云量上限 <b>{cloud}%</b>
            <input
              aria-label="整景云量上限"
              type="range"
              min="0"
              max="100"
              step="5"
              value={cloud}
              onChange={(e) => setCloud(+e.target.value)}
            />
          </label>
          <button className="wide" onClick={search} disabled={busy}>
            <Search size={16} /> 检索真实影像
          </button>
          <div className="scene-select">
            <label htmlFor="before">A / 基准期</label>
            <select
              id="before"
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
              disabled={busy || !scenes.length}
            >
              {!scenes.length && <option value="">请先检索</option>}
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {date(s)} · {s.id.split('_')[1]} · 云{' '}
                  {f(s.properties['eo:cloud_cover'], 1)}%
                </option>
              ))}
            </select>
          </div>
          <div className="scene-select">
            <label htmlFor="after">B / 对比期</label>
            <select
              id="after"
              value={afterId}
              onChange={(e) => setAfterId(e.target.value)}
              disabled={busy || !scenes.length}
            >
              {!scenes.length && <option value="">请先检索</option>}
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {date(s)} · {s.id.split('_')[1]} · 云{' '}
                  {f(s.properties['eo:cloud_cover'], 1)}%
                </option>
              ))}
            </select>
          </div>
          {truncated && (
            <p className="hint">
              仅展示本次前 100 景，请缩小日期范围获得完整候选。
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy || scenes.length < 2}
            onClick={run}
          >
            <Play size={16} /> 从云端读取并分析
          </button>
          {busy && (
            <button className="wide cancel" onClick={cancel}>
              <X size={15} /> 取消当前任务
            </button>
          )}
          <div className="sidebar-foot">
            <CheckCircle2 size={16} />
            <div>
              无需 API 密钥<small>计算在浏览器进行，影像按需读取</small>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="heading">
            <div>
              <div className="section-label">CHANGE INTELLIGENCE</div>
              <h1>地表变化证据工作台</h1>
              <p>发现变化，追溯每一个像元。</p>
            </div>
            <button disabled={!pair} onClick={() => exportFile('geojson')}>
              <Download size={16} /> 导出 GeoJSON
            </button>
          </div>
          <div
            className={'notice ' + (error ? 'error' : '')}
            role={error ? 'alert' : 'status'}
          >
            {error ? (
              <AlertCircle size={16} />
            ) : busy ? (
              <RefreshCw size={16} className="spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <span>{error || message}</span>
            {error && (
              <button
                className="text-button"
                onClick={() => setError('')}
                aria-label="关闭错误"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {pair && analysis ? (
            <>
              <div className="result-context">
                <span className="tag">
                  {pair.source === 'snapshot' ? '真实影像快照' : '云端读取结果'}
                </span>
                <span>
                  {date(pair.before.scene)} <span className="accent">→</span>{' '}
                  {date(pair.after.scene)}
                </span>
                <span className="context-aoi">
                  范围{' '}
                  {pair.before.grid.aoi.map((v) => v.toFixed(3)).join(', ')}
                </span>
              </div>
              <div className="stats">
                <Stat
                  label="有效观测覆盖"
                  value={f(validPct, 1)}
                  unit="%"
                  caption={analysis.valid.toLocaleString() + ' 个共同有效像元'}
                />
                <Stat
                  label={metric.toUpperCase() + ' 下降区域'}
                  value={f(lossHa, 1)}
                  unit="ha"
                  caption={'Δ ≤ −' + threshold.toFixed(2) + ' · 含未成斑块像元'}
                  tone="orange"
                />
                <Stat
                  label="待复核变化斑块"
                  value={String(analysis.patches.length)}
                  unit="个"
                  caption={'四邻域连通 · ≥ ' + minPixels + ' 个像元'}
                />
                <Stat
                  label="平均指数变化"
                  value={f(analysis.meanDelta, 3)}
                  unit=""
                  caption="仅统计两期共同有效位置"
                  tone="orange"
                />
              </div>
              {validPct < 50 && (
                <div className="coverage-warning">
                  <AlertCircle size={15} /> 共同有效覆盖不足
                  50%。统计仅代表有效位置，请勿外推到整个研究区；建议更换影像复核。
                </div>
              )}
              <div className="analysis-layout">
                <section className="map-panel">
                  <div className="map-toolbar">
                    <div className="segmented">
                      {(
                        [
                          ['compare', '前后对比'],
                          ['change', '变化强度'],
                          ['index', '对比期指数'],
                        ] as [View, string][]
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setView(v)}
                          className={view === v ? 'active' : ''}
                          aria-pressed={view === v}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="small-tag">{metric.toUpperCase()}</span>
                  </div>
                  <Suspense
                    fallback={
                      <div className="map-loading">正在初始化地图…</div>
                    }
                  >
                    <AnalysisMap
                      pair={pair}
                      analysis={analysis}
                      view={view}
                      split={split}
                      selected={selected}
                    />
                  </Suspense>
                  {view === 'compare' && (
                    <label className="swipe-control">
                      <span>A / 基准期</span>
                      <input
                        aria-label="前后影像分界"
                        type="range"
                        min="0"
                        max="100"
                        value={split}
                        onChange={(e) => setSplit(+e.target.value)}
                      />
                      <span>B / 对比期</span>
                    </label>
                  )}
                </section>
                <aside className="inspector">
                  <h2>
                    <SlidersHorizontal size={17} /> 分析设置
                  </h2>
                  <label className="field-label" htmlFor="metric">
                    变化指标
                  </label>
                  <select
                    id="metric"
                    value={metric}
                    onChange={(e) => {
                      setMetric(e.target.value as Metric);
                      setSelected(null);
                    }}
                  >
                    <option value="nbr">NBR · 燃烧 / 地表扰动</option>
                    <option value="ndvi">NDVI · 植被变化</option>
                  </select>
                  <p className="hint">
                    {metric === 'nbr'
                      ? '近红外与短波红外的归一化差异。下降可提示燃烧或其他地表扰动。'
                      : '近红外与红光的归一化差异。下降可提示植被减少或季节变化。'}
                  </p>
                  <label className="slider-label">
                    下降阈值 <b>−{threshold.toFixed(2)}</b>
                    <input
                      aria-label="下降阈值"
                      type="range"
                      min=".05"
                      max=".8"
                      step=".01"
                      value={threshold}
                      onChange={(e) => {
                        setThreshold(+e.target.value);
                        setSelected(null);
                      }}
                    />
                  </label>
                  <div className="range-captions">
                    <small>更敏感</small>
                    <small>更严格</small>
                  </div>
                  <label className="field-label" htmlFor="minpixels">
                    最小斑块
                  </label>
                  <select
                    id="minpixels"
                    value={minPixels}
                    onChange={(e) => {
                      setMinPixels(+e.target.value);
                      setSelected(null);
                    }}
                  >
                    <option value="1">1 像元 / 0.36 ha</option>
                    <option value="4">4 像元 / 1.44 ha</option>
                    <option value="9">9 像元 / 3.24 ha</option>
                    <option value="25">25 像元 / 9 ha</option>
                  </select>
                  <div className="divider" />
                  <h2>变化值分布</h2>
                  <Histogram analysis={analysis} />
                  <div className="distribution">
                    <span>
                      <i className="dot orange" />
                      下降{' '}
                      <b>
                        {analysis.valid
                          ? f((analysis.loss / analysis.valid) * 100, 1)
                          : '—'}
                        %
                      </b>
                    </span>
                    <span>
                      <i className="dot green" />
                      上升{' '}
                      <b>
                        {analysis.valid
                          ? f((analysis.gain / analysis.valid) * 100, 1)
                          : '—'}
                        %
                      </b>
                    </span>
                  </div>
                  <div className="quality-note">
                    <CheckCircle2 size={15} />
                    <span>
                      两期 SCL 联合掩膜
                      <small>
                        已排除 {analysis.excluded.toLocaleString()}{' '}
                        个云、阴影、不确定或无效位置。
                      </small>
                    </span>
                  </div>
                </aside>
              </div>
              <section className="evidence-panel">
                <div className="evidence-heading">
                  <div className="segmented">
                    <button
                      className={tab === 'patches' ? 'active' : ''}
                      onClick={() => setTab('patches')}
                    >
                      <Layers size={15} /> 变化斑块
                    </button>
                    <button
                      className={tab === 'sources' ? 'active' : ''}
                      onClick={() => setTab('sources')}
                    >
                      <FileJson size={15} /> 数据溯源
                    </button>
                  </div>
                  <div className="export-actions">
                    <button onClick={() => exportFile('csv')}>
                      <Table2 size={14} /> CSV
                    </button>
                    <button onClick={() => exportFile('json')}>
                      <FileJson size={14} /> 复现清单
                    </button>
                  </div>
                </div>
                {tab === 'patches' ? (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>斑块编号</th>
                            <th>估算面积</th>
                            <th>平均 Δ{metric.toUpperCase()}</th>
                            <th>像元数</th>
                            <th>地图操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.patches.slice(0, 15).map((p) => (
                            <tr
                              key={p.id}
                              className={selected === p.id ? 'selected' : ''}
                            >
                              <td>
                                <span className="patch-id">
                                  P-{String(p.id).padStart(3, '0')}
                                </span>
                              </td>
                              <td>{f(p.hectares, 2)} ha</td>
                              <td className="orange-text">
                                {f(p.meanChange, 3)}
                              </td>
                              <td>{p.pixels.toLocaleString()}</td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setSelected(
                                      selected === p.id ? null : p.id,
                                    );
                                    setView('change');
                                  }}
                                >
                                  {selected === p.id ? '取消高亮' : '高亮查看'}{' '}
                                  <ChevronRight size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!analysis.patches.length && (
                        <p className="empty-table">
                          {analysis.valid
                            ? '当前阈值下没有满足大小条件的下降斑块。试着降低阈值或最小斑块。'
                            : '没有两期共同有效的像元，请更换影像。'}
                        </p>
                      )}
                    </div>
                    <div className="table-footer">
                      <span>
                        {analysis.patches.length > 15
                          ? '显示面积最大的 15 个斑块；导出包含全部斑块。'
                          : '共 ' + analysis.patches.length + ' 个变化斑块'}
                      </span>
                      <span>
                        {largest
                          ? '最大斑块 ' + f(largest.hectares, 1) + ' ha'
                          : '—'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="sources">
                    <Source label="A / 基准期" scene={pair.before.scene} />
                    <Source label="B / 对比期" scene={pair.after.scene} />
                    <div className="source-note">
                      <b>采集时间与读取时间分别记录</b>
                      <p>
                        读取时间：{pair.retrievedAt} · 分析网格：
                        {pair.before.grid.width} × {pair.before.grid.height} ·
                        EPSG:{pair.before.grid.epsg}
                      </p>
                      <p>
                        导出清单包含原始 STAC 元数据、每个波段链接、scale /
                        offset、网格和全部分析参数。
                      </p>
                    </div>
                  </div>
                )}
              </section>
              <div className="method-strip">
                <b>结果用于探索与复核</b>
                <span>光谱下降 ≠ 已确认损毁</span>
                <span>60 m 抽样面积估算</span>
                <span>阴影、烟雾和季节差异可能影响结果</span>
              </div>
            </>
          ) : (
            <div className="canvas-empty">
              <Satellite size={42} />
              <h2>
                {busy ? '正在准备真实观测数据' : '加载一个案例，开始分析'}
              </h2>
              <p>选择区域 → 检索影像 → 同网格比较 → 导出证据</p>
              <button onClick={loadSample} disabled={busy}>
                加载内置真实案例
              </button>
            </div>
          )}
          {showMethod && (
            <section className="method-panel">
              <div className="section-heading">
                <h2>方法、参考与能力边界</h2>
                <button
                  onClick={() => setShowMethod(false)}
                  aria-label="关闭方法说明"
                >
                  <X size={16} />
                </button>
              </div>
              <p>
                参考 GeoAI.js 的浏览器端地理处理流程与 Element 84
                的云原生影像组织方式，自主实现变化分析工作台。当前运行的是光谱指数差分，不包含训练模型或大模型推理。
              </p>
              <ol>
                <li>
                  通过 STAC 检索真实 Sentinel-2 L2A 观测，用 HTTP Range
                  读取研究区所需 COG 数据块。
                </li>
                <li>
                  按各波段元数据执行 DN × scale + offset；在相同 UTM
                  网格上最近邻抽样至 60 m。
                </li>
                <li>
                  两期都仅保留 SCL 4、5、6 类像元，计算 NDVI 或 NBR，使用 B − A
                  表示变化。
                </li>
                <li>
                  对超过下降阈值的像元做四邻域连通分析，过滤小斑块，按网格面积估算公顷数。
                </li>
                <li>
                  GeoJSON
                  由每个斑块的逐行像元带组成，保留采样形状；并非测绘边界或已验证灾损。
                </li>
              </ol>
              <div className="reference-links">
                <a
                  href="https://github.com/decision-labs/geoai.js"
                  target="_blank"
                  rel="noreferrer"
                >
                  GeoAI.js <ArrowUpRight size={14} />
                </a>
                <a
                  href="https://github.com/Element84/earth-search"
                  target="_blank"
                  rel="noreferrer"
                >
                  Earth Search <ArrowUpRight size={14} />
                </a>
                <a
                  href="https://github.com/geotiffjs/geotiff.js"
                  target="_blank"
                  rel="noreferrer"
                >
                  GeoTIFF.js <ArrowUpRight size={14} />
                </a>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  caption,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  caption: string;
  tone?: string;
}) {
  return (
    <div className={'stat ' + (tone ?? '')}>
      <small>{label}</small>
      <div>
        <b>{value}</b>
        <span>{unit}</span>
      </div>
      <p>{caption}</p>
    </div>
  );
}
function Histogram({ analysis }: { analysis: Analysis }) {
  const max = Math.max(1, ...analysis.histogram);
  return (
    <div className="histogram-wrap">
      <div
        className="histogram"
        aria-label="变化值直方图，横轴从负一到正一，超出范围归入两端"
      >
        {analysis.histogram.map((v, i) => (
          <span
            key={i}
            style={{
              height: Math.max(2, (v / max) * 64),
              background: i < 10 ? '#dc976b' : '#55bca2',
            }}
            title={v + ' 个像元'}
          />
        ))}
      </div>
      <div className="histogram-axis">
        <small>≤ −1</small>
        <small>0</small>
        <small>≥ +1</small>
      </div>
    </div>
  );
}
function Source({ label, scene }: { label: string; scene: Scene }) {
  return (
    <div className="source-card">
      <small>{label}</small>
      <h3>{scene.id}</h3>
      <p>
        采集：{scene.properties.datetime}
        <br />
        整景云量：{f(scene.properties['eo:cloud_cover'], 2)}%
      </p>
      <a
        href={
          'https://earth-search.aws.element84.com/v1/collections/' +
          scene.collection +
          '/items/' +
          scene.id
        }
        target="_blank"
        rel="noreferrer"
      >
        查看原始 STAC 元数据 <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
