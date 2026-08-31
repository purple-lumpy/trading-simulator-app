import { ReplayController } from "../ReplayController.js";
import type { ReplayDataSource } from "../ReplayController.js";
import type { Candle } from "../../core/types.js";

function makeSource(length: number): ReplayDataSource {
  const bars: Candle[] = Array.from({ length }, (_, i) => ({
    time: i,
    open: i,
    high: i,
    low: i,
    close: i,
    volume: 0,
  }));
  return { length: () => bars.length, at: (i) => bars[i] };
}

describe("ReplayController — step/seek", () => {
  it("emits a final update for bar 0 on the first stepForward from the initial cursor", () => {
    const controller = new ReplayController(makeSource(5));
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.stepForward();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 0 }), index: 0, final: true })
    );
  });

  it("does not step past the last bar", () => {
    const controller = new ReplayController(makeSource(2));
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.stepForward(); // -> 0
    controller.stepForward(); // -> 1
    controller.stepForward(); // no-op, already at last index

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 1 }), index: 1, final: true })
    );
  });

  it("does not step before the first bar", () => {
    const controller = new ReplayController(makeSource(5));
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.stepForward(); // cursor -> 0, emits
    controller.stepBackward(); // cursor <= 0 guard: no-op, no re-emit

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("seek positions the cursor so the NEXT stepForward reveals the sought bar", () => {
    // Regression test: an earlier version set cursor = index directly, which
    // silently skipped emitting the sought bar (the following stepForward
    // would land on index + 1 instead of index).
    const controller = new ReplayController(makeSource(100));
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.seek(50);
    controller.stepForward();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 50 }), index: 50, final: true })
    );
  });

  it("seek clamps to the available range", () => {
    const controller = new ReplayController(makeSource(10));
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.seek(9999);
    controller.stepForward();

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 9 }), index: 9, final: true })
    );
  });
});

describe("ReplayController — play/pause/speed (no intrabar animation)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("advances one final bar per base interval while playing", () => {
    const controller = new ReplayController(makeSource(10), { baseIntervalMs: 100 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play(); // immediate tick -> 1 call at t=0
    jest.advanceTimersByTime(350); // + ~3.5 ticks at 100ms -> 3 more calls (t=100,200,300)

    expect(onUpdate).toHaveBeenCalledTimes(4);
    expect(onUpdate.mock.calls.every(([update]) => update.final)).toBe(true);
  });

  it("stops advancing once paused", () => {
    const controller = new ReplayController(makeSource(10), { baseIntervalMs: 100 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play(); // immediate tick -> 1 call at t=0
    jest.advanceTimersByTime(150); // + 1 more call at t=100
    controller.pause();
    jest.advanceTimersByTime(500);

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("advances proportionally faster at higher speed", () => {
    const controller = new ReplayController(makeSource(10), { baseIntervalMs: 100 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.setSpeed(10); // 10x -> 10ms per bar (not yet playing, so no immediate effect here)
    controller.play(); // immediate tick -> 1 call at t=0, cursor at bar 0
    jest.advanceTimersByTime(105); // + ~10.5 ticks at 10ms -> 9 more calls before auto-pausing
    // (the source only has 10 bars: the immediate tick plus 9 interval ticks reach the last
    // bar, index 9; the 10th scheduled interval tick lands on the auto-pause branch and emits
    // nothing, matching "auto-pauses once the last bar is reached" below)

    expect(onUpdate).toHaveBeenCalledTimes(10);
  });

  it("play() emits an update immediately, without waiting for the first interval to elapse", () => {
    const controller = new ReplayController(makeSource(10), { baseIntervalMs: 100 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 0 }), index: 0, final: true })
    );
  });

  it("setSpeed() while playing reprices the cadence without firing an extra immediate update", () => {
    const controller = new ReplayController(makeSource(10), { baseIntervalMs: 100 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play(); // immediate tick -> 1 call, cursor now at bar 0
    expect(onUpdate).toHaveBeenCalledTimes(1);

    controller.setSpeed(10); // reprices to 10ms/tick — should not itself advance/emit
    expect(onUpdate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10); // one tick at the new, faster cadence
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("auto-pauses once the last bar is reached", () => {
    const controller = new ReplayController(makeSource(3), { baseIntervalMs: 10 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play();
    jest.advanceTimersByTime(1000); // far more ticks than bars available

    expect(onUpdate).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ candle: expect.objectContaining({ time: 2 }), index: 2, final: true })
    );
  });
});

describe("ReplayController — intrabarTicks (synthesized live-forming bars)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("emits (intrabarTicks - 1) non-final updates before the final one, per bar", () => {
    const controller = new ReplayController(makeSource(2), { baseIntervalMs: 80, intrabarTicks: 4 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play(); // immediate tick -> 1st sub-tick at t=0
    jest.advanceTimersByTime(60); // + remaining 3 sub-ticks of the bar (3 * 20ms)

    expect(onUpdate).toHaveBeenCalledTimes(4);
    const updates = onUpdate.mock.calls.map(([u]) => u);
    expect(updates.slice(0, 3).every((u) => u.final === false)).toBe(true);
    expect(updates[3].final).toBe(true);
    // Every sub-tick for a bar reports the same index and the same bar time.
    expect(updates.every((u) => u.index === 0 && u.candle.time === 0)).toBe(true);
  });

  it("keeps the settled candle as the final update's payload, not a synthesized one", () => {
    const source: ReplayDataSource = {
      length: () => 1,
      at: () => ({ time: 5, open: 10, high: 20, low: 5, close: 15, volume: 1000 }),
    };
    const controller = new ReplayController(source, { baseIntervalMs: 40, intrabarTicks: 4 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.play();
    jest.advanceTimersByTime(40);

    const final = onUpdate.mock.calls[3][0];
    expect(final.final).toBe(true);
    expect(final.candle).toEqual({ time: 5, open: 10, high: 20, low: 5, close: 15, volume: 1000 });
  });

  it("stepForward bypasses intrabar animation and emits the resolved bar immediately", () => {
    const controller = new ReplayController(makeSource(5), { intrabarTicks: 8 });
    const onUpdate = jest.fn();
    controller.onUpdate(onUpdate);

    controller.stepForward();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ final: true, index: 0 }));
  });
});
