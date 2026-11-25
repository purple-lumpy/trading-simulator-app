import type { Candle } from "trading-charter-app-library";

export function parseMarketCsv(text: string, timeColumn: string): Candle[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = source.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === "\n" || c === undefined)) {
      row.push(cell.trim()); cell = "";
      if (c !== delimiter) { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (c !== undefined && (c !== "\r" || quoted)) cell += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合。");
  const header = rows.shift()?.map(c => c.toLowerCase()) ?? [];
  const volumeColumn = header.includes("tick_volume") ? "tick_volume" : header.includes("tick_volumn") ? "tick_volumn" : "volume";
  for (const column of [timeColumn, "open", "high", "low", "close", volumeColumn]) {
    if (!header.includes(column)) throw new Error(`缺少列：${column}`);
  }
  const candles = rows.map((values, index) => {
    const get = (column: string) => values[header.indexOf(column)] ?? "";
    const raw = get(timeColumn);
    let time: number;
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const n = Number(raw); time = n >= 1e12 ? n / 1000 : n;
    } else {
      let iso = raw.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3").replace(" ", "T");
      if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += "Z";
      time = Date.parse(iso) / 1000;
    }
    const number = (column: string) => get(column) === "" ? NaN : Number(get(column));
    const candle = { time, open: number("open"), high: number("high"), low: number("low"), close: number("close"), volume: number(volumeColumn) };
    if (!Object.values(candle).every(Number.isFinite) || time < 0 || !Number.isInteger(time) || candle.volume < 0 || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high) throw new Error(`第 ${index + 2} 行：时间或 OHLCV 数据无效。`);
    return candle;
  }).sort((a, b) => a.time - b.time);
  if (!candles.length) throw new Error("CSV 没有行情数据。");
  for (let i = 1; i < candles.length; i++) if (candles[i].time === candles[i - 1].time) throw new Error("CSV 存在重复时间，请清理后重新导入。");
  return candles;
}
