import { create } from "zustand";
import { DEFAULT_OPTIONS } from "trading-charter-app-library";
import type { ChartOptions, PriceAxisPosition } from "trading-charter-app-library";

/**
 * The chart's live, user-adjustable configuration — a settings panel's
 * whole reason to exist (see the v1 plan's settings item: "select colors
 * for different objects," "turn on/off the volume bars," all "saved in
 * some ChartSettingsConfig shape"). Deliberately typed as `ChartOptions`
 * itself rather than a separate app-defined shape: the library already
 * owns the authoritative list of what's configurable and what each
 * field's type is (`ChartCore.setOptions()` takes exactly this shape), so
 * a parallel `ChartSettingsConfig` interface here would just be the same
 * fields copied out and one library change away from drifting out of
 * sync. Reusing the type is the inheritance-shaped move at this layer —
 * this store *is* a `ChartOptions`, not a lookalike of one.
 *
 * `Required` because every field always has a concrete value once the
 * store exists (seeded from `DEFAULT_OPTIONS` below) — `ChartOptions`
 * itself leaves every field optional only because `ChartCore` accepts a
 * partial patch; a caller here reads a specific field, not a patch.
 */
export type ChartSettingsConfig = Required<ChartOptions>;

/**
 * Zustand chosen over Redux for exactly the reason raised when this
 * store was proposed: it has no provider/boilerplate and its whole
 * runtime is a few hundred bytes, which matters more here than usual —
 * this is a demo app for a standalone charting *library*, so keeping the
 * app-level dependency footprint small keeps the demo honest about what
 * the library itself costs to embed.
 *
 * `draft`/`committed` split (Apply/Cancel): every edit below
 * (`setOption`, `setVolumeVisible`, `reset`) mutates `draft` only, and
 * `ChartPanel` pushes `draft` into the live chart on every change — so a
 * color tweak previews on the actual chart immediately, the same instant
 * behavior this store had before Apply/Cancel existed. `committed` is
 * the separate "last applied" baseline that only `apply()`/`cancel()`
 * ever touch: `apply()` freezes `draft` into it, `cancel()` throws
 * `draft` away by copying `committed` back over it (which, via that same
 * `ChartPanel` effect, reverts the live chart too). See
 * `SettingsPanel`'s own doc comment for which user actions call which.
 */
interface ChartSettingsStore {
  /** The live-preview config every edit mutates immediately — what `SettingsPanel` renders its controls from and what `ChartPanel` pushes into the live chart via `setOptions()` on every change, Apply/Cancel decided or not. */
  draft: ChartSettingsConfig;
  /** The last *applied* config — untouched by any in-progress edit, and what `draft` reverts to on Cancel (see this interface's own doc comment). */
  committed: ChartSettingsConfig;
  /**
   * The volume pane's ratio from the last time it was shown, remembered
   * across a "hide volume" round trip — `setVolumeVisible(false)` sets
   * `draft.volumePaneRatio` to 0 (`ChartCore`'s own "disable the volume
   * pane" signal, see `ChartOptions.volumePaneRatio`'s doc comment), and
   * without saving the prior value separately, `setVolumeVisible(true)`
   * would have nothing to restore *to* except `DEFAULT_OPTIONS`' ratio —
   * clobbering a size a settings panel might one day let someone tune.
   */
  lastVolumePaneRatio: number;
  /** Update one field of the live-preview draft — every color picker and the axis-position select in `SettingsPanel` funnels through this. Does not touch `committed` — see `apply()`. */
  setOption: <K extends keyof ChartSettingsConfig>(key: K, value: ChartSettingsConfig[K]) => void;
  /** Convenience for the one boolean-shaped setting in the panel ("show volume bars") — reads/writes through `draft.volumePaneRatio` rather than being its own independent flag, so it can never disagree with what `ChartCore` itself is looking at. */
  setVolumeVisible: (visible: boolean) => void;
  /** Reset the *draft* to `DEFAULT_OPTIONS` — the panel's "Reset to defaults" action. Deliberately just another draft edit, same as a color change: it previews immediately but still needs Apply to stick, and Cancel (or closing the panel any other way) discards it same as any other in-progress edit. */
  reset: () => void;
  /** Commit the current draft: `committed` becomes exactly what `draft` already is — the chart is already showing it, so this is purely "make it stick" bookkeeping. The settings panel's "Apply" action. */
  apply: () => void;
  /** Discard every uncommitted edit: `draft` reverts to `committed`, which `ChartPanel`'s own `setOptions()` effect then pushes back to the live chart, undoing whatever preview was on screen. The settings panel's "Cancel" action, and — per the v1 plan's "when someone clicks outside we cancel" — what closing the panel any other way (an outside click, toggling the gear closed) does too. */
  cancel: () => void;
}

export const useChartSettingsStore = create<ChartSettingsStore>((set, get) => ({
  draft: { ...DEFAULT_OPTIONS },
  committed: { ...DEFAULT_OPTIONS },
  lastVolumePaneRatio: DEFAULT_OPTIONS.volumePaneRatio,

  setOption: (key, value) =>
    set((state) => ({ draft: { ...state.draft, [key]: value } })),

  setVolumeVisible: (visible) =>
    set((state) => {
      if (visible) {
        return { draft: { ...state.draft, volumePaneRatio: state.lastVolumePaneRatio || DEFAULT_OPTIONS.volumePaneRatio } };
      }
      // Save whatever ratio was in effect before hiding, but only if it
      // was actually showing something - never overwrite the remembered
      // ratio with 0 from a redundant "hide" call.
      const lastVolumePaneRatio = state.draft.volumePaneRatio > 0 ? state.draft.volumePaneRatio : state.lastVolumePaneRatio;
      return { draft: { ...state.draft, volumePaneRatio: 0 }, lastVolumePaneRatio };
    }),

  reset: () => set({ draft: { ...DEFAULT_OPTIONS } }),

  apply: () => set((state) => ({ committed: state.draft })),

  cancel: () => set((state) => ({ draft: state.committed })),
}));

/** Re-exported purely so `SettingsPanel` doesn't need its own import of a type it only forwards. */
export type { PriceAxisPosition };
