import type { Candle, CandleUpdate } from "../core/types.js";
import { synthesizeIntrabarPath } from "./intrabar.js";

/** Allowed playback multipliers — 1 is real-time (see `ReplayOptions.baseIntervalMs`), the rest fast-forward or slow down from there. */
export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 5 | 10 | 25 | 50 | 100;

/** Where `ReplayController` gets its bars from — historical data today, but the interface makes no assumption about that; anything answering these two questions works. */
export interface ReplayDataSource {
  /** Total number of bars available for this session. */
  length(): number;
  /** Fetch the bar at index i (may hit a local cache/pre-fetch — see requirements §6 on data strategy). */
  at(i: number): Candle;
}

/** Tuning knobs for one `ReplayController` — how fast bars reveal at 1x, and whether they animate into existence or just appear. */
export interface ReplayOptions {
  /**
   * Real wall-clock ms per bar at 1x speed. Default 200 — a fast,
   * arbitrary pace meant only for a quick demo with no other opinion
   * supplied. For a genuinely realistic session (5m candles that actually
   * take 5 real minutes at 1x, 15s candles that take 15 real seconds,
   * etc.) pass `realtimeIntervalMs(timeframeSeconds)` from
   * `./timeframes.js` instead — `setSpeed()` still fast-forwards on top
   * of whatever pace this establishes, exactly as before.
   */
  baseIntervalMs?: number;
  /**
   * When > 0, each bar is revealed as this many progressive snapshots — the
   * first (intrabarTicks - 1) are synthesized in-progress updates
   * (`final: false`), the last one locks the bar (`final: true`) — instead
   * of a single final update per bar. This is what makes historical replay
   * feel like a live feed: the current bar visibly goes up and down before
   * locking, the same as it would if real ticks were arriving. 0 (default)
   * reveals each bar as one final update, matching the old
   * appendCandle-per-bar behavior. Ignored by stepForward/stepBackward/seek
   * — manual stepping always jumps straight to the resolved bar, since a
   * trader stepping through history wants the settled candle, not to watch
   * it re-animate every time they step.
   */
  intrabarTicks?: number;
}

const DEFAULT_OPTIONS: Required<ReplayOptions> = {
  baseIntervalMs: 200,
  intrabarTicks: 0,
};

/**
 * Cursor-driven replay: play/pause/step/seek/speed, one bar at a time.
 * Deliberately has no wall-clock coupling — advancing the cursor is what
 * produces bars, timers just decide how often to advance it. This mirrors
 * the pattern validated by community replay controllers built on top of
 * TradingView Lightweight Charts (see implementation-plan.md §3.4) and,
 * more importantly, matches the security model in the requirements doc:
 * the server owns the cursor and only ever sends bars up to it.
 *
 * Emits through the same `CandleUpdate` shape (core/types.ts) a live feed
 * would use: `final: false` while a bar can still change, `final: true`
 * once it locks. That's the seam that lets ChartCore.applyUpdate() — and
 * this class — be reused unmodified for a real live data source later; see
 * `intrabarTicks` for how historical replay borrows the same shape to
 * *feel* live even though the data is fixed in advance.
 */
export class ReplayController {
  private cursor = -1;
  private speed: ReplaySpeed = 1;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(update: CandleUpdate) => void> = [];
  private readonly opts: Required<ReplayOptions>;

  /** How many of the current bar's intrabar sub-steps have already fired. */
  private subTick = 0;

  constructor(private source: ReplayDataSource, options: ReplayOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  onUpdate(listener: (update: CandleUpdate) => void): void {
    this.listeners.push(listener);
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed;
    if (this.playing) this.restartTimer(false);
  }

  /**
   * Starts playback. Fires an immediate synchronous tick before starting
   * the recurring timer, so the first bar shows up right away instead of
   * waiting a full base interval in silence — at realistic (real-time)
   * pacing that wait can be tens of seconds to several minutes, which
   * otherwise reads as "nothing is happening." setSpeed() deliberately does
   * NOT get the same treatment (see restartTimer) since it only reprices an
   * already-running cadence and shouldn't itself advance the cursor.
   */
  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.restartTimer(true);
  }

  pause(): void {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Bypasses intrabar animation — always reveals the next bar fully formed. */
  stepForward(): void {
    if (this.cursor >= this.source.length() - 1) return;
    this.cursor += 1;
    this.subTick = 0;
    this.emitFinal();
  }

  stepBackward(): void {
    if (this.cursor <= 0) return;
    this.cursor -= 1;
    this.subTick = 0;
    this.emitFinal();
  }

  /**
   * Jump so that `index` is the NEXT bar revealed — used by Random Challenge
   * to pick a hidden start point. `cursor` is "last emitted index"
   * everywhere else in this class, so seek positions one before the
   * target rather than emitting it directly: the caller decides whether
   * to reveal it via stepForward() or play(), matching the pattern the
   * rest of the API uses. (Earlier draft set cursor = index here, which
   * silently skipped the sought bar's own emission on the next step —
   * fixed as part of adding unit tests.)
   */
  seek(index: number): void {
    const clamped = Math.max(-1, Math.min(index, this.source.length() - 1));
    this.cursor = clamped - 1;
    this.subTick = 0;
  }

  /**
   * (Re)starts the recurring tick timer. `immediate` controls whether a
   * tick fires synchronously right now, before the timer's first natural
   * fire: `play()` passes true so a freshly (re)started session shows a bar
   * immediately; `setSpeed()` passes false so changing the cadence mid-play
   * only reprices the wait already in progress, without sneaking in an
   * extra, unrequested advance.
   */
  private restartTimer(immediate: boolean): void {
    if (this.timer) clearInterval(this.timer);
    const ticksPerBar = this.opts.intrabarTicks > 0 ? this.opts.intrabarTicks : 1;
    const intervalMs = this.opts.baseIntervalMs / this.speed / ticksPerBar;
    if (immediate) this.tick();
    // The immediate tick above can itself call pause() (e.g. it lands on the
    // last bar and auto-pauses) — don't resurrect a recurring timer for a
    // session that just stopped playing.
    if (!this.playing) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  /**
   * One sub-step of the playing timer. With intrabarTicks == 0 (the
   * default) this just reveals the next bar fully formed each tick, same
   * as the original per-bar timer. With intrabarTicks > 0, the first
   * (intrabarTicks - 1) ticks for a bar emit synthesized non-final
   * in-progress snapshots of it, and the final tick locks it — the same
   * event shape a live feed's isFinal flag would produce, just synthesized
   * from the settled historical bar instead of arriving over a socket.
   */
  private tick(): void {
    const ticksPerBar = this.opts.intrabarTicks > 0 ? this.opts.intrabarTicks : 1;

    if (this.subTick === 0) {
      if (this.cursor >= this.source.length() - 1) {
        this.pause();
        return;
      }
      this.cursor += 1;
    }

    this.subTick += 1;

    if (ticksPerBar <= 1 || this.subTick >= ticksPerBar) {
      this.subTick = 0;
      this.emitFinal();
      return;
    }

    const path = synthesizeIntrabarPath(this.source.at(this.cursor), ticksPerBar);
    const snapshot = path[this.subTick - 1];
    this.notify({ candle: snapshot, index: this.cursor, final: false });
  }

  private emitFinal(): void {
    this.notify({ candle: this.source.at(this.cursor), index: this.cursor, final: true });
  }

  private notify(update: CandleUpdate): void {
    for (const listener of this.listeners) listener(update);
  }
}
