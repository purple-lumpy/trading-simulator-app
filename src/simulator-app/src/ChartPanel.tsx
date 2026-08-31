import { useEffect, useRef, useState } from "react";
import { ChartCore, ReplayController, MovingAverage, realtimeIntervalMs } from "trading-charter-app-library";
import type { Candle, CandleUpdate, ReplaySpeed } from "trading-charter-app-library";
import { useChartSettingsStore } from "./settings/chartSettingsStore";
import { SettingsPanel, type GearAnchor } from "./settings/SettingsPanel";
import type { DrawingToolName } from "./ChartNavBar";

interface ChartPanelProps {
  candles: Candle[];
  /** The candle set's own bar duration, in seconds — drives how long one bar genuinely takes to form at 1x (see realtimeIntervalMs). */
  timeframeSeconds: number;
  /** Which drawing tool the toolbar currently has selected - see DrawingToolName's own doc comment. Passed straight through to ChartCore.setActiveDrawingTool() via the dedicated effect below ("none" becomes null - ChartCore itself owns building/tracking the actual placed-drawing instances, see its own doc comments). */
  activeTool: DrawingToolName;
}

const SPEEDS: ReplaySpeed[] = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

/**
 * How many of `candles` are already "revealed" as of `nowTime` — the
 * world-clock moment (a candle's own `time` units: Unix seconds) up to
 * which the market has been played, tracked in `ChartPanel` via
 * `nowTimeRef` (see its own comment for why a moment in time, not a
 * candle index, is what survives a timeframe switch intact). A candle
 * counts as revealed once its own bar has fully closed by that moment —
 * `c.time + timeframeSeconds <= nowTime` — mirroring exactly how
 * `ReplayController` only ever emits a bar once it's done forming.
 * `nowTime === null` means nothing has been revealed yet (a fresh
 * session), so nothing here counts as revealed either.
 */
function revealedCountAt(candles: readonly Candle[], timeframeSeconds: number, nowTime: number | null): number {
  if (nowTime === null) return 0;
  let count = 0;
  for (const c of candles) {
    if (c.time + timeframeSeconds > nowTime) break;
    count++;
  }
  return count;
}

/**
 * Owns one ChartCore for its whole lifetime, but *not* one ReplayController
 * for its whole lifetime — the replay controller gets torn down and
 * rebuilt every time `candles`/`timeframeSeconds` changes (see the second
 * effect below), which is how a timeframe switch reaches this component:
 * `App` no longer remounts `ChartPanel` via `key` (see its own doc
 * comment), it just hands down a newly resampled `candles` array, and
 * this component reacts in place.
 *
 * This is the integration point implementation-plan.md §4 step 5
 * describes ("React app shell ... rendering one revealed candle at a time
 * through the custom chart core") — minus the replay WebSocket, which
 * isn't built yet, so the data source is the local sample generator
 * instead (see sampleData.ts / App.tsx's base-series comment).
 */
export function ChartPanel({ candles, timeframeSeconds, activeTool }: ChartPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartCore | null>(null);
  const replayRef = useRef<ReplayController | null>(null);
  // The world-clock moment (a candle `time`, in seconds) the replay has
  // reached — updated every time a bar finalizes, in the onUpdate
  // listener below. This, not a candle index, is what a timeframe switch
  // carries forward: an index means something different at every
  // timeframe (bar 40 of a 1m session isn't bar 40 of a 5m one), but a
  // moment in time means the same thing regardless of how the market
  // either side of it happens to be bucketed — see revealedCountAt()
  // above for how the next timeframe's equivalent index is derived back
  // out of it. A ref, not state, because it's written from a timer
  // callback (ReplayController's own setInterval) and read synchronously
  // from an effect, neither of which should wait on a re-render.
  const nowTimeRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [revealedCount, setRevealedCount] = useState(0);
  const [gearAnchor, setGearAnchor] = useState<GearAnchor | null>(null);
  // Screen position of the delete ("\u00d7") badge for whichever placed
  // drawing is currently selected (via the "cross" tool's click-to-select
  // - see ChartCore.getSelectedDrawingDeleteAnchor()'s own doc comment),
  // or null when nothing's selected. Unlike gearAnchor above, this can't
  // just be recomputed at a few specific call sites: it moves with every
  // pan/zoom, appears/disappears with every selection change, and needs
  // to track a drawing that's still there after any of those - so it's
  // kept in sync via chart.onRender() (see the mount effect below)
  // instead, which fires after every one of those already re-renders the
  // canvas anyway.
  const [deleteAnchor, setDeleteAnchor] = useState<{ x: number; y: number } | null>(null);
  // The live-preview draft (not the last-applied `committed` config) - see
  // chartSettingsStore's own doc comment on the split. Pushing this one is
  // exactly what makes a settings-panel edit visible on the chart before
  // Apply is ever clicked.
  const chartOptions = useChartSettingsStore((s) => s.draft);

  // Mount once: build the chart against this canvas. Its lifetime is the
  // component's whole lifetime, independent of candles/timeframeSeconds —
  // see the effect below for how a data/timeframe change reaches it
  // in place (chart.setData()/applyUpdate()) instead of rebuilding it.
  useEffect(() => {
    if (!canvasRef.current) return;

    // Seed from whatever the settings store's draft already holds - a
    // one-time snapshot read (not the reactive hook) since this effect
    // only ever runs once per mount; every change after this point flows
    // through the setOptions effect below instead.
    const chart = new ChartCore(canvasRef.current, useChartSettingsStore.getState().draft);
    chart.registerIndicator(new MovingAverage(20, "sma"));
    chart.onRender(() => setDeleteAnchor(chart.getSelectedDrawingDeleteAnchor()));

    chartRef.current = chart;
    setGearAnchor(chart.getGearAnchor());

    return () => {
      chart.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild the replay controller whenever the candle set or its
  // timeframe changes — on mount (candles/timeframeSeconds are always
  // "new" the first time) and on every timeframe switch afterward. This
  // is the piece that makes a switch continuous rather than a hard reset:
  // it figures out how much of the *new* candle set is already "revealed"
  // (via revealedCountAt() + nowTimeRef, see their own comments),
  // fast-forwards the chart straight to that point with one setData()
  // call instead of re-animating through it bar by bar, and seeks the new
  // ReplayController to resume exactly there — carrying `playing`/`speed`
  // over so a switch mid-playback doesn't even pause the session.
  //
  // The *old* ReplayController is always torn down and a new one built
  // rather than trying to mutate one in place, because its data source
  // and baseIntervalMs are constructor-only (see ReplayController's own
  // types) — but the ChartCore instance above never is, which is what
  // keeps the canvas, its pan/zoom state, the gear position, and the
  // settings panel all undisturbed across a switch.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    replayRef.current?.pause();

    const newRevealedCount = revealedCountAt(candles, timeframeSeconds, nowTimeRef.current);
    if (newRevealedCount > 0) chart.setData(candles.slice(0, newRevealedCount));
    setRevealedCount(newRevealedCount);

    const replay = new ReplayController(
      { length: () => candles.length, at: (i) => candles[i] },
      {
        // Genuinely real-time at 1x: a 5m bar takes 5 real minutes, a 15s
        // bar takes 15 real seconds — whichever timeframe is selected
        // above. setSpeed() (the Speed control below) still fast-forwards
        // on top of this, same as always.
        baseIntervalMs: realtimeIntervalMs(timeframeSeconds),
        // Synthesize 8 sub-ticks per bar so the current bar visibly forms —
        // goes up and down — before locking, instead of popping in fully
        // resolved. This is purely a replay-time effect for now (see
        // ReplayController's intrabarTicks doc comment), but the chart is
        // wired to the same applyUpdate()/CandleUpdate seam a real live
        // feed would use, so swapping in one later needs no chart changes.
        intrabarTicks: 8,
      }
    );
    replay.onUpdate((update: CandleUpdate) => {
      if (update.final) {
        setRevealedCount(update.index + 1);
        nowTimeRef.current = update.candle.time + timeframeSeconds;
      }
      chart.applyUpdate(update);
    });
    replay.seek(newRevealedCount);
    replay.setSpeed(speed);
    if (playing) replay.play();
    replayRef.current = replay;

    return () => {
      replay.pause();
    };
    // playing/speed are deliberately read (to carry them over) but not
    // depended on - toggling Play or changing Speed shouldn't itself tear
    // down and rebuild the replay controller, only a genuine
    // candles/timeframeSeconds change should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, timeframeSeconds]);

  // Push every settings-panel change straight to the live chart via the
  // setOptions() runtime-reconfiguration entry point - this is the one
  // place a ChartSettingsConfig change (a new color, the axis side, the
  // volume toggle - all live-preview `draft` edits, applied or not yet,
  // per chartSettingsStore's own doc comment) actually reaches ChartCore.
  // Also fires once, harmlessly, right after the mount effect above with
  // the same values it just constructed the chart with.
  //
  // Re-reads getGearAnchor() every time, too - a settings change can
  // change the chart's own layout (toggling volume, the price-axis side,
  // its width) and therefore where the gear itself belongs; recomputing
  // it right after the render setOptions() just triggered is what keeps
  // the gear glued to that boundary instead of the fixed corner it sat in
  // before this method existed.
  useEffect(() => {
    chartRef.current?.setOptions(chartOptions);
    setGearAnchor(chartRef.current?.getGearAnchor() ?? null);
  }, [chartOptions]);

  // Pushes the toolbar's current selection to the chart every time it
  // changes - "none" resolves to null (ChartCore.setActiveDrawingTool()'s
  // own documented meaning for "back to plain pan/zoom/crosshair/
  // selection"), anything else is passed straight through: ChartCore
  // itself builds a fresh instance of that type internally (and again
  // every time a placement completes), so this component never
  // constructs or tracks any DrawingTool instance directly. Runs after
  // the mount effect on first render too (activeTool starts "none" in
  // App, so this is a harmless no-op setActiveDrawingTool(null) call the
  // first time).
  useEffect(() => {
    chartRef.current?.setActiveDrawingTool(activeTool === "none" ? null : activeTool);
  }, [activeTool]);

  const togglePlay = () => {
    const replay = replayRef.current;
    if (!replay) return;
    if (playing) {
      replay.pause();
      setPlaying(false);
    } else {
      replay.play();
      setPlaying(true);
    }
  };

  const changeSpeed = (next: ReplaySpeed) => {
    setSpeed(next);
    replayRef.current?.setSpeed(next);
  };

  const stepForward = () => replayRef.current?.stepForward();
  const stepBackward = () => replayRef.current?.stepBackward();
  // Undoes a drag-pan (horizontal, vertical, or both - see
  // ChartCore.scrollToLatest()'s own doc comment), not a replay
  // control - unlike Prev/Play/Next/Speed above it never touches
  // replayRef, only the chart's own pan state. No enabled/disabled
  // condition: ChartPanel has no reactive view of the chart's current
  // pan/zoom (that lives entirely inside ChartCore, read on demand via
  // getViewport(), not subscribed to), and calling it while already at
  // the latest candle is a harmless no-op re-render, not worth wiring up
  // a viewport subscription just to disable a button for.
  const jumpToLatest = () => chartRef.current?.scrollToLatest();

  return (
    <div className="chart-panel">
      <div className="chart-canvas-wrap">
        <canvas ref={canvasRef} width={1000} height={500} />
        <SettingsPanel anchor={gearAnchor} />
        {deleteAnchor && (
          // Same "existing Delete/Backspace key still works" story as
          // ChartCore.deleteSelectedDrawing()'s own doc comment - this is
          // just a second, more discoverable way to reach it for anyone
          // who'd rather click than remember a keyboard shortcut.
          <button
            type="button"
            className="drawing-delete-button"
            style={{ left: deleteAnchor.x, top: deleteAnchor.y }}
            title="Delete this drawing"
            aria-label="Delete selected drawing"
            onClick={() => chartRef.current?.deleteSelectedDrawing()}
          >
            ×
          </button>
        )}
      </div>
      <div className="controls">
        <button onClick={stepBackward} disabled={revealedCount === 0}>
          ⏮ Prev
        </button>
        <button onClick={togglePlay}>{playing ? "⏸ Pause" : "▶ Play"}</button>
        <button onClick={stepForward} disabled={revealedCount >= candles.length}>
          Next ⏭
        </button>
        <button onClick={jumpToLatest} title="Jump back to the latest candle">
          ⏩ Latest
        </button>
        {/* No visible "Speed" text - the ×N options (e.g. "3×") already say
            what this control is; aria-label keeps it named for screen
            readers without a sighted label repeating that. */}
        <select
          aria-label="Speed"
          value={speed}
          onChange={(e) => changeSpeed(Number(e.target.value) as ReplaySpeed)}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <span className="progress">
          {revealedCount} / {candles.length} bars revealed
        </span>
      </div>
    </div>
  );
}
