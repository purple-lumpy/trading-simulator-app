import type { Candle } from "trading-charter-app-library";

/**
 * Local random-walk generator so this shell has no external data
 * dependency yet. Swap for the real ingestion pipeline once the
 * data-feasibility spike (implementation-plan.md §2) lands.
 */
export function generateSampleCandles(count: number, timeframeSeconds = 300): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  let time = Math.floor(Date.now() / 1000) - count * timeframeSeconds;

  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 2;
    const close = Math.max(1, open + change);
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    const volume = Math.random() * 1000;
    candles.push({ time, open, high, low, close, volume });
    price = close;
    time += timeframeSeconds;
  }
  return candles;
}
