import test from "node:test";
import assert from "node:assert/strict";
import { recalculateMarkers, parseAnnotationFile } from "../src/annotations/model.ts";
import type { MarketDataset, DecisionMarker } from "../src/annotations/model.ts";

const dataset: MarketDataset = { id: "sample", symbol: "SAMPLE", timeframeSeconds: 300, candles: [1000, 1300, 1600].map(time => ({ time, open: 100, high: 110, low: 90, close: 105, volume: 10 })) };
const marker = (action: DecisionMarker["action"], quantity: number, candleTime: number): DecisionMarker => ({ id: String(candleTime), datasetId: dataset.id, candleTime, action, quantity, referencePrice: 0, positionBefore: 999, positionAfter: 999 });

test("sorts decisions and derives buy, partial sale, hold positions from zero", () => {
  const result = recalculateMarkers(dataset, [marker("hold", 0, 1600), marker("sell", 0.1, 1300), marker("buy", 0.3, 1000)]);
  assert.deepEqual(result.map(m => [m.positionBefore, m.positionAfter]), [[0, 0.3], [0.3, 0.2], [0.2, 0.2]]);
  assert.equal(result[0].referencePrice, 105);
});
test("rejects edits or deletions that make later sales exceed holdings", () => {
  assert.throws(() => recalculateMarkers(dataset, [marker("buy", 1, 1000), marker("sell", 2, 1300)]), /超卖/);
  assert.throws(() => recalculateMarkers(dataset, [marker("sell", 2, 1300)]), /超卖/);
});
test("recalculates later holdings after a historical edit", () => {
  const result = recalculateMarkers(dataset, [marker("buy", 3, 1000), marker("sell", 2, 1300)]);
  assert.equal(result[1].positionAfter, 1);
});
test("rejects duplicate times, missing candles and invalid quantities", () => {
  assert.throws(() => recalculateMarkers(dataset, [marker("buy", 1, 1000), marker("hold", 0, 1000)]));
  assert.throws(() => recalculateMarkers(dataset, [marker("buy", 1, 999)]));
  for (const quantity of [NaN, Infinity, -1, 0]) assert.throws(() => recalculateMarkers(dataset, [marker("buy", quantity, 1000)]));
  assert.throws(() => recalculateMarkers(dataset, [marker("hold", 1, 1000)]));
});
test("JSON round trip preserves fixed candles and recomputes positions", () => {
  const result = parseAnnotationFile(JSON.stringify({ schemaVersion: 1, dataset, markers: [marker("buy", 2, 1000)], revealedCount: 2 }));
  assert.deepEqual(result.dataset, dataset);
  assert.equal(result.markers[0].positionAfter, 2);
  assert.equal(result.revealedCount, 2);
});
test("rejects corrupted datasets and mismatched markers", () => {
  assert.throws(() => parseAnnotationFile("{}"));
  assert.throws(() => parseAnnotationFile(JSON.stringify({ schemaVersion: 1, dataset: { ...dataset, candles: [{ ...dataset.candles[0], high: 1 }] }, markers: [] })));
  assert.throws(() => recalculateMarkers(dataset, [{ ...marker("buy", 1, 1000), datasetId: "other" }]));
});

import { parseMarketCsv } from "../src/annotations/csv.ts";
test("CSV maps UTC text and tick volume, sorts rows and ignores extra fields", () => {
  const rows = parseMarketCsv('\uFEFFtime_utc,timestamp_utc,open,high,low,close,tick_volume,spread_points,real_volume\r\n"2025-01-01 00:15:00",1735690500,10,12,9,11,8,2,0\r\n2025-01-01 00:00:00,1735689600,10,12,9,11,7,2,0', 'time_utc');
  assert.equal(rows[0].time, 1735689600);
  assert.equal(rows[0].volume, 7);
});
test("CSV supports millisecond timestamps and rejects empty prices and duplicate times", () => {
  const header = 'timestamp_utc,open,high,low,close,tick_volume\n';
  assert.equal(parseMarketCsv(header + '1735689600000,10,12,9,11,7', 'timestamp_utc')[0].time, 1735689600);
  assert.throws(() => parseMarketCsv(header + '1735689600,,12,9,11,7', 'timestamp_utc'));
  assert.throws(() => parseMarketCsv(header + '1735689600,10,12,9,11,7\n1735689600,10,12,9,11,7', 'timestamp_utc'));
});
