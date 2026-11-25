import { useEffect, useMemo, useState } from "react";
import type { Marker } from "trading-charter-app-library";
import { ChartPanel } from "../ChartPanel";
import { generateSampleCandles } from "../sampleData";
import { parseAnnotationFile, recalculateMarkers } from "./model";
import type { AnnotationFile, DecisionMarker } from "./model";
import "../index.css";
import { parseMarketCsv } from "./csv";

const STORAGE_KEY = "market-replay-annotations-v1";
const actionNames = { buy: "买入", sell: "卖出", hold: "观望" };
function createFile(): AnnotationFile {
  return { schemaVersion: 1, dataset: { id: crypto.randomUUID(), symbol: "SAMPLE", timeframeSeconds: 300, candles: generateSampleCandles(600, 300) }, markers: [], revealedCount: 40 };
}
function loadFile(): { file: AnnotationFile; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { file: raw ? parseAnnotationFile(raw) : createFile(), error: "" };
  } catch {
    return { file: createFile(), error: "无法读取本地记录。为保护原记录，自动保存已暂停；请先导出备份或导入有效的 JSON 文件。" };
  }
}
const date = (time: number) => new Date(time * 1000).toLocaleString("zh-CN", { hour12: false });

export function AnnotationApp() {
  const [initial] = useState(loadFile);
  const [file, setFile] = useState(initial.file);
  const [saveBlocked, setSaveBlocked] = useState(Boolean(initial.error));
  const [saveStatus, setSaveStatus] = useState("等待保存");
  const [error, setError] = useState(initial.error);
  const [quantity, setQuantity] = useState("1");
  const [playing, setPlaying] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{ index: number; nonce: number }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [period, setPeriod] = useState(900);
  const [timeColumn, setTimeColumn] = useState("time_utc");
  const [csvStatus, setCsvStatus] = useState("");
  const { dataset, markers, revealedCount } = file;
  const current = dataset.candles[revealedCount - 1];
  const currentMarker = markers.find(m => m.candleTime === current?.time);
  const visibleMarkers = markers.filter(m => m.candleTime <= (current?.time ?? -Infinity));
  const position = visibleMarkers[visibleMarkers.length - 1]?.positionAfter ?? 0;
  const chartMarkers = useMemo<Marker[]>(() => markers.filter(m => m.action !== "hold").map(m => ({ time: m.candleTime, price: m.referencePrice, kind: m.action === "buy" ? "entry" : "exit" })), [markers]);

  useEffect(() => {
    if (saveBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
      setSaveStatus(`已自动保存 ${new Date().toLocaleTimeString("zh-CN")}`);
    } catch {
      setSaveStatus("本地保存失败，请立即导出 JSON 备份");
    }
  }, [file, saveBlocked]);

  function progress(count: number) {
    setFile(previous => previous.revealedCount === count ? previous : { ...previous, revealedCount: count });
  }
  function commit(next: DecisionMarker[]) {
    try {
      const recalculated = recalculateMarkers(dataset, next);
      setFile(previous => ({ ...previous, markers: recalculated }));
      setEditingId(null);
      setError("");
    } catch (e) { setError((e as Error).message); }
  }
  function mark(action: DecisionMarker["action"]) {
    if (!current || playing) return;
    if (currentMarker && editingId !== currentMarker.id) { setError("当前 K 线已有标记，请先点击列表中的“编辑”，或删除原标记。"); return; }
    const next: DecisionMarker = { id: currentMarker?.id ?? crypto.randomUUID(), datasetId: dataset.id, candleTime: current.time, action, quantity: action === "hold" ? 0 : Number(quantity), referencePrice: current.close, positionBefore: 0, positionAfter: 0 };
    commit([...markers.filter(m => m.candleTime !== current.time), next]);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `annotations-${dataset.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(input: HTMLInputElement) {
    const selected = input.files?.[0];
    if (!selected) return;
    try {
      const restored = parseAnnotationFile(await selected.text());
      if (!window.confirm("导入会替换当前工作区，请确认已导出需要保留的记录。")) return;
      setFile(restored);
      setRevision(value => value + 1);
      setSeekRequest(undefined);
      setEditingId(null);
      setPlaying(false);
      setSaveBlocked(false);
      setError("");
    } catch (e) { setError(`导入失败：${(e as Error).message}`); }
    finally { input.value = ""; }
  }

  async function importCsv(input: HTMLInputElement) {
    const selected = input.files?.[0];
    if (!selected) return;
    try {
      if (!symbol.trim()) throw new Error("请填写品种。");
      const candles = parseMarketCsv(await selected.text(), timeColumn);
      const gaps = candles.slice(1).filter((c, i) => c.time - candles[i].time > period).length;
      if (candles.some((c, i) => i > 0 && (c.time - candles[i - 1].time) % period !== 0)) throw new Error("时间间隔与所选周期不匹配，请检查周期。");
      if (!window.confirm(`导入 ${symbol.trim()}，${period / 60} 分钟，${candles.length} 根 K 线。\nUTC 范围：${new Date(candles[0].time * 1000).toISOString()} 至 ${new Date(candles[candles.length - 1].time * 1000).toISOString()}\n发现 ${gaps} 处时间缺口（可能包含休市），不自动补齐。\n将替换当前行情及标记，请先导出需要保留的记录。继续？`)) return;
      setFile({ schemaVersion: 1, dataset: { id: crypto.randomUUID(), symbol: symbol.trim(), timeframeSeconds: period, candles }, markers: [], revealedCount: Math.min(40, candles.length) });
      setRevision(v => v + 1); setSeekRequest(undefined); setEditingId(null); setPlaying(false); setSaveBlocked(false); setError("");
      setCsvStatus(`已导入 ${selected.name}；${gaps} 处时间缺口。`);
    } catch (e) { setError(`CSV 导入失败：${(e as Error).message}`); }
    finally { input.value = ""; }
  }

  return <main className="app annotation-app">
    <header><h1>K 线决策标注</h1><p>{dataset.symbol} · {dataset.timeframeSeconds / 60} 分钟 · {dataset.candles.length} 根 K 线</p></header>
    <section className="annotation-card">
      <h2>导入 CSV 行情</h2>
      <div className="annotation-actions">
        <label>品种 <input value={symbol} onChange={e => setSymbol(e.target.value)} /></label>
        <label>周期 <select value={period} onChange={e => setPeriod(Number(e.target.value))}><option value={900}>15 分钟</option><option value={3600}>1 小时</option><option value={14400}>4 小时</option></select></label>
        <label>时间列 <select value={timeColumn} onChange={e => setTimeColumn(e.target.value)}><option>time_utc</option><option>timestamp_utc</option><option>time</option></select></label>
        <label className="import-label">选择 CSV<input type="file" accept=".csv,text/csv,.tsv" onChange={e => void importCsv(e.currentTarget)} /></label>
      </div>
      <p className="annotation-hint">时间按 UTC 开盘时间解析，支持日期文本及秒/毫秒时间戳。tick_volume → volume（兼容 tick_volumn）；OHLC 同名。spread_points、real_volume 不参与标注导入。每次导入创建独立数据集，原记录请先导出。</p>
      {csvStatus && <p role="status">{csvStatus}</p>}
    </section>
    <div className="annotation-toolbar">
      <span role="status">{saveBlocked ? "自动保存已暂停" : saveStatus}</span>
      <button onClick={download}>导出行情与标记 JSON</button>
      <label className="import-label">恢复 JSON<input type="file" accept=".json,application/json" onChange={e => void importFile(e.currentTarget)} /></label>
    </div>
    <p className="annotation-hint">按 Next 逐根查看；暂停后，以最后一根已收盘 K 线的收盘价标记。数量按品种单位计，初始持仓为 0。显示时间为本机时区，导出 time 为 UTC Unix 秒。</p>
    <ChartPanel key={`${dataset.id}-${revision}`} candles={dataset.candles} timeframeSeconds={dataset.timeframeSeconds} activeTool="none" markers={chartMarkers} initialRevealedCount={file.revealedCount} onProgress={progress} onPlayingChange={setPlaying} seekRequest={seekRequest} />
    <section className="annotation-card">
      <h2>{editingId && currentMarker?.id === editingId ? "编辑当前标记" : "添加决策标记"}</h2>
      <div className="annotation-summary"><span>决策 K 线：{current ? date(current.time) : "请先前进一步"}</span><span>参考价：{current?.close.toFixed(4) ?? "—"}</span><span>截至当前持仓：{position}</span></div>
      <div className="annotation-actions">
        <label>买卖数量 <input aria-label="买卖数量" type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="buy" disabled={!current || playing} onClick={() => mark("buy")}>买入 / 加仓</button>
        <button className="sell" disabled={!current || playing} onClick={() => mark("sell")}>卖出 / 减仓</button>
        <button disabled={!current || playing} onClick={() => mark("hold")}>观望</button>
      </div>
      {playing && <p>回放中，请暂停后标记。</p>}
      {error && <p role="alert" className="annotation-error">{error}</p>}
    </section>
    <section className="annotation-card">
      <h2>决策记录（{markers.length}）</h2>
      <p className="annotation-hint">每根 K 线记录一个决策。修改或删除后会重算后续仓位；导致超卖的修改不会保存。观望记录保存在列表和导出文件中，买卖点同时显示在图表上。</p>
      {!markers.length ? <p>暂无标记。输入数量后点击买入，或记录一次观望。</p> : <div className="annotation-table-wrap"><table><thead><tr><th>K 线时间</th><th>动作</th><th>数量</th><th>参考价格</th><th>前仓位</th><th>后仓位</th><th>操作</th></tr></thead><tbody>{markers.map(m => <tr key={m.id}><td>{date(m.candleTime)}</td><td>{actionNames[m.action]}</td><td>{m.quantity}</td><td>{m.referencePrice.toFixed(4)}</td><td>{m.positionBefore}</td><td>{m.positionAfter}</td><td><button onClick={() => { setQuantity(String(m.quantity || 1)); setEditingId(m.id); setSeekRequest({ index: dataset.candles.findIndex(c => c.time === m.candleTime), nonce: Date.now() }); }}>定位 / 编辑</button> <button onClick={() => commit(markers.filter(item => item.id !== m.id))}>删除</button></td></tr>)}</tbody></table></div>}
    </section>
    <p className="annotation-hint">自动保存位于当前浏览器、当前网址的本地存储中。请导出 JSON 到电脑作为备份；更换端口、浏览器或清理站点数据后，需要通过“恢复 JSON”加载。</p>
  </main>;
}
