import type { Candle } from "trading-charter-app-library";

export interface MarketDataset {
  id: string;
  symbol: string;
  timeframeSeconds: number;
  candles: Candle[];
}
export interface DecisionMarker {
  id: string;
  datasetId: string;
  candleTime: number;
  action: "buy" | "sell" | "hold";
  quantity: number;
  referencePrice: number;
  positionBefore: number;
  positionAfter: number;
}
export interface AnnotationFile {
  schemaVersion: 1;
  dataset: MarketDataset;
  markers: DecisionMarker[];
  revealedCount: number;
}

// A single decision per candle. Historical edits are validated against all later decisions.
export function recalculateMarkers(dataset: MarketDataset, markers: DecisionMarker[]): DecisionMarker[] {
  const candles = new Map(dataset.candles.map(c => [c.time, c]));
  const times = new Set<number>();
  let position = 0;
  return [...markers].sort((a, b) => a.candleTime - b.candleTime).map(marker => {
    const candle = candles.get(marker.candleTime);
    if (!candle || marker.datasetId !== dataset.id || times.has(marker.candleTime)) throw new Error("标记与行情不匹配，或同一根 K 线存在重复决策。");
    times.add(marker.candleTime);
    if (!["buy", "sell", "hold"].includes(marker.action)) throw new Error("无效的标记动作。");
    if (!Number.isFinite(marker.quantity) || (marker.action === "hold" ? marker.quantity !== 0 : marker.quantity <= 0)) throw new Error("买卖数量必须大于 0，观望数量必须为 0。");
    const before = position;
    position = Number((position + (marker.action === "buy" ? marker.quantity : marker.action === "sell" ? -marker.quantity : 0)).toFixed(10));
    if (!Number.isFinite(position) || position < 0) throw new Error("该操作会使当前或后续标记超卖，请先调整相关卖出标记。");
    return { ...marker, referencePrice: candle.close, positionBefore: before, positionAfter: position };
  });
}

export function parseAnnotationFile(text: string): AnnotationFile {
  const file = JSON.parse(text) as AnnotationFile;
  if (file.schemaVersion !== 1 || !file.dataset || typeof file.dataset.id !== "string" || typeof file.dataset.symbol !== "string" || !Number.isFinite(file.dataset.timeframeSeconds) || file.dataset.timeframeSeconds <= 0 || !Array.isArray(file.dataset.candles) || !file.dataset.candles.length || !Array.isArray(file.markers)) throw new Error("文件不是有效的标注数据集。");
  let lastTime = -Infinity;
  for (const c of file.dataset.candles) {
    if (!c || ![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) || c.time <= lastTime || c.volume < 0 || c.low > Math.min(c.open, c.close) || c.high < Math.max(c.open, c.close) || c.low > c.high) throw new Error("行情数据格式错误。");
    lastTime = c.time;
  }
  const ids = new Set<string>();
  for (const m of file.markers) {
    if (!m || typeof m.id !== "string" || ids.has(m.id)) throw new Error("标记 ID 无效或重复。");
    ids.add(m.id);
  }
  return { ...file, markers: recalculateMarkers(file.dataset, file.markers), revealedCount: Number.isInteger(file.revealedCount) ? Math.max(0, Math.min(file.revealedCount, file.dataset.candles.length)) : 40 };
}
