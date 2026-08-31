/**
 * One selectable entry in the instrument dropdown (see `ChartNavBar`'s
 * own `instrument`/`onInstrumentChange` props) - just enough to drive a
 * `fetchRealBaseCandles()` call and a display label, nothing else.
 *
 * Deliberately carries NO "has real data" flag of its own: whether an
 * instrument actually gets real data is discovered empirically, the
 * same way it always has been for BTC/USD - `App`'s fetch effect just
 * tries `fetchRealBaseCandles()` with this `symbol`, and data-server's
 * Coinbase-backed `/api/candles` either has that product id or it
 * doesn't. A symbol Coinbase has never heard of (a forex pair, a stock
 * ticker) makes that fetch fail exactly the same way a network outage
 * would, and `App` already treats every failure as "stay on sample" -
 * so listing EUR/USD or AAPL here needs no special-casing anywhere,
 * they just always end up on sample data, correctly, for free.
 */
export interface Instrument {
  /** Coinbase Exchange product id ("BASE-QUOTE", e.g. "BTC-USD") for a crypto pair Coinbase actually lists - or, for an instrument with no real-data source (yet), any label-ish string data-server's Coinbase request will simply fail to resolve, which is exactly the point (see the class doc comment above). */
  symbol: string;
  /** Display label shown in the dropdown and the chart header, e.g. "BTC/USD". */
  label: string;
}

/**
 * The full selectable list. The first four are real Coinbase Exchange
 * product ids - real historical data for these actually works today,
 * the same live-verified path BTC/USD has used since data-server first
 * switched to Coinbase (see data-server/src/index.ts's own doc comment).
 * The last two are deliberately NOT anything Coinbase lists - forex and
 * single-stock data need a different provider this app doesn't have yet
 * (see docs/implementation-plan.md §2.3's own research on that gap) - so
 * picking either always shows sample data, with the "Sample" badge
 * (`App`'s own `isReal`) making that plain rather than silently pretending
 * otherwise. Kept in the list anyway specifically so the dropdown itself
 * demonstrates both states side by side, not just "the one thing that
 * happens to work."
 */
export const INSTRUMENTS: Instrument[] = [
  { symbol: "BTC-USD", label: "BTC/USD" },
  { symbol: "ETH-USD", label: "ETH/USD" },
  { symbol: "SOL-USD", label: "SOL/USD" },
  { symbol: "LTC-USD", label: "LTC/USD" },
  { symbol: "EUR-USD", label: "EUR/USD" },
  { symbol: "AAPL", label: "AAPL" },
];
