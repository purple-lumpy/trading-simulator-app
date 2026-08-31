import { useEffect, useRef, useState } from "react";
import type { PriceAxisPosition } from "trading-charter-app-library";
import { useChartSettingsStore } from "./chartSettingsStore";
import { ColorSetting } from "./ColorSetting";

/**
 * One row per `ChartOptions` color field this panel exposes - declared
 * as data rather than eight near-identical `<ColorSetting>` calls, so
 * adding the *next* configurable color (per the class doc comment on
 * `ChartOptions` itself: several fields already exist "specifically so a
 * future settings UI can let someone pick their own") is a one-line
 * addition here, not a new block of JSX.
 */
const COLOR_FIELDS: Array<{
  key:
    | "upColor"
    | "downColor"
    | "backgroundColor"
    | "gridColor"
    | "gridBackgroundColor"
    | "gridSeparatorColor"
    | "textColor"
    | "currentPriceLineColor"
    | "crosshairPriceTagColor"
    | "crosshairTimeTagColor"
    | "crosshairTimeTagTextColor";
  label: string;
}> = [
  { key: "upColor", label: "Up candle" },
  { key: "downColor", label: "Down candle" },
  { key: "backgroundColor", label: "Chart background" },
  { key: "gridColor", label: "Gridlines" },
  { key: "gridBackgroundColor", label: "Grid background" },
  { key: "gridSeparatorColor", label: "Price axis separator" },
  { key: "textColor", label: "Axis text" },
  { key: "currentPriceLineColor", label: "Current price line" },
  { key: "crosshairPriceTagColor", label: "Crosshair price tag" },
  { key: "crosshairTimeTagColor", label: "Crosshair time tag" },
  { key: "crosshairTimeTagTextColor", label: "Crosshair time tag text" },
];

/** Where to position the gear + panel, in canvas-relative CSS pixels — `ChartPanel` computes this from `ChartCore.getGearAnchor()` and passes it straight through, so this component never has to know anything about the chart's own layout math. `null` (no price-ruler strip reserved at all) falls back to the CSS-only fixed corner position `.settings-panel-container` still declares for exactly that case. */
export interface GearAnchor {
  x: number;
  y: number;
}

interface SettingsPanelProps {
  anchor?: GearAnchor | null;
}

/**
 * The gear icon + popover settings panel itself - the UI half of the v1
 * plan's settings item ("a settings gear on the chart which allows us to
 * select colors for different objects... install a library to color
 * pick... save these in some ChartSettingsConfig shape"). Reads and
 * writes `useChartSettingsStore` exclusively; it never touches a
 * `ChartCore` instance directly - `ChartPanel`'s effect is the only place
 * store changes actually reach the live chart, keeping this component
 * ignorant of chart internals entirely (it would work unchanged sitting
 * next to a chart it doesn't own) - `anchor` is the one exception, and
 * even that is handed a plain `{x, y}` point rather than a `ChartCore`
 * reference.
 *
 * Apply/Cancel: every control below edits the store's live-preview
 * `draft` (previewed on the actual chart immediately, via `ChartPanel`'s
 * own effect) rather than committing anything by itself. Only three
 * things ever call `apply()`/`cancel()`, all in this component:
 * - The **Apply** button commits the draft (`apply()`) and closes.
 * - The **Cancel** button discards it (`cancel()`) and closes.
 * - Closing the panel any *other* way - an outside click, or toggling
 *   the gear closed without hitting either button - discards it too,
 *   per the v1 plan's "when someone clicks outside we cancel." Both
 *   paths funnel through `closePanel()` below so this rule can't
 *   drift between them.
 */
export function SettingsPanel({ anchor }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const options = useChartSettingsStore((s) => s.draft);
  const setOption = useChartSettingsStore((s) => s.setOption);
  const setVolumeVisible = useChartSettingsStore((s) => s.setVolumeVisible);
  const reset = useChartSettingsStore((s) => s.reset);
  const applyDraft = useChartSettingsStore((s) => s.apply);
  const cancelDraft = useChartSettingsStore((s) => s.cancel);

  /** Close the panel, optionally discarding whatever draft edits are in progress first — see this component's own doc comment for which caller passes which. */
  const closePanel = (commit: boolean) => {
    if (!commit) cancelDraft();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closePanel(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Centers the gear button on the anchor point rather than using it as
  // the container's top-left corner - matches ChartCore.getGearAnchor()'s
  // own doc comment on what the returned point means. The fallback (no
  // anchor) case is left entirely to .settings-panel-container's own
  // fixed-corner CSS, untouched.
  const containerStyle = anchor
    ? { left: anchor.x, top: anchor.y, right: "auto", bottom: "auto", transform: "translate(-50%, -50%)" }
    : undefined;

  // Which way the popover itself opens, relative to the gear - only
  // matters when `anchor` puts the gear at a real position on the chart
  // (see ChartCore.getGearAnchor()'s own doc comment: that's always in
  // the chart's *lower* footer band, regardless of axis side, so the
  // panel opens *upward* from it there - "settings-panel--anchored"
  // below). Without an anchor, .settings-panel-container falls back to
  // its own fixed top-*right* corner instead (see that class's own CSS
  // comment) - the gear is already near the top there, so the base
  // .settings-panel rule's original "open downward" stays correct
  // as-is, and no modifier class is added.
  //
  // *Horizontally*, which side the panel opens toward mirrors whichever
  // edge the gear itself is near - the same edge `options.priceAxisPosition`
  // already puts the price-ruler strip against (see getGearAnchor(): its
  // x is the axis strip's own horizontal center) - so the panel opens
  // away from that edge and stays inside the chart instead of running
  // off it.
  const panelClassName = anchor
    ? `settings-panel settings-panel--anchored settings-panel--axis-${options.priceAxisPosition}`
    : "settings-panel";

  return (
    <div className="settings-panel-container" style={containerStyle} ref={containerRef}>
      <button
        type="button"
        className="settings-gear-button"
        aria-label="Chart settings"
        onClick={() => {
          if (open) closePanel(false); // toggling closed without Apply = cancel, same as an outside click
          else setOpen(true);
        }}
      >
        {/* A hand-drawn gear, not the "⚙" text glyph this used to be - no
            amount of flex-centering the *button* can center that glyph's own
            *ink* within the circle, because different platforms/fonts place
            "⚙" at a different offset within its own em-square (that's what
            kept looking "not quite centered" even after the button itself
            was correctly centered). An SVG has no such font-dependent
            asymmetry: every shape below is placed relative to the viewBox's
            own center (12, 12), so the icon's true visual center already
            matches its element box, and centering that box in the button
            (see .settings-gear-button's flex rules) is then exact. Built
            from primitives instead of a copied icon-font path for the same
            reason - a ring (the gear body) plus 8 teeth rotated 45deg apart
            around that same center point. */}
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <rect
              key={angle}
              x="10.5"
              y="1"
              width="3"
              height="3"
              rx="0.8"
              fill="currentColor"
              transform={`rotate(${angle} 12 12)`}
            />
          ))}
        </svg>
      </button>
      {open && (
        <div className={panelClassName}>
          <div className="settings-panel-header">
            <span>Chart settings</span>
            <button type="button" className="settings-reset" onClick={reset}>
              Reset
            </button>
          </div>

          <div className="settings-section">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={options.volumePaneRatio > 0}
                onChange={(e) => setVolumeVisible(e.target.checked)}
              />
              Show volume bars
            </label>

            <label className="settings-select-row">
              Price axis side
              <select
                value={options.priceAxisPosition}
                onChange={(e) => setOption("priceAxisPosition", e.target.value as PriceAxisPosition)}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>

            {/* ChartOptions.barAreaWidthRatio - how much of the plot's
                width candles actually lay out across before the empty
                margin reserved for "what's ahead" begins; 100% runs
                candles all the way to the price line, with no margin at
                all. Stored/read as the same 0-1 fraction the library
                itself takes - only the displayed number is a percentage,
                to match how a trader thinks about "how much of the chart
                is bars." */}
            <label className="settings-select-row">
              Bar area width
              <span className="settings-slider-value">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(options.barAreaWidthRatio * 100)}
                  onChange={(e) => setOption("barAreaWidthRatio", Number(e.target.value) / 100)}
                />
                {Math.round(options.barAreaWidthRatio * 100)}%
              </span>
            </label>
          </div>

          <div className="settings-section settings-colors">
            {COLOR_FIELDS.map(({ key, label }) => (
              <ColorSetting key={key} label={label} color={options[key]} onChange={(color) => setOption(key, color)} />
            ))}
          </div>

          <div className="settings-panel-footer">
            <button type="button" className="settings-cancel" onClick={() => closePanel(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-apply"
              onClick={() => {
                applyDraft();
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
