import { describe, expect, test } from "bun:test";
import {
  createResizeReplayScheduler,
  needsReplay,
  type TerminalSize,
  type TimerHandle,
} from "./resizeReplay.ts";

/** A controllable clock, so the debounce is tested rather than waited on. */
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimeoutFn: (fn: () => void) => {
      const handle = next++;
      pending.set(handle, fn);
      return handle as TimerHandle;
    },
    clearTimeoutFn: (handle: TimerHandle) => {
      pending.delete(handle as number);
    },
    /** Fire everything still scheduled. */
    flush() {
      const due = [...pending.values()];
      pending.clear();
      for (const fn of due) fn();
    },
    get scheduled() {
      return pending.size;
    },
  };
}

const size = (width: number, height: number): TerminalSize => ({ width, height });

function recorder(initial: TerminalSize) {
  const timers = fakeTimers();
  const replays: TerminalSize[] = [];
  const scheduler = createResizeReplayScheduler({
    initialSize: initial,
    replay: (next) => replays.push(next),
    ...timers,
  });
  return { timers, replays, scheduler };
}

describe("needsReplay", () => {
  test("a changed width needs one — every committed row re-wraps", () => {
    expect(needsReplay(size(120, 40), size(80, 40))).toBe(true);
    expect(needsReplay(size(80, 40), size(120, 40))).toBe(true);
  });

  test("a changed height needs one — the pinned region moves", () => {
    expect(needsReplay(size(80, 40), size(80, 24))).toBe(true);
  });

  test("an unchanged terminal does not", () => {
    // Opening a picker resizes the *footer*, which raises a resize event with
    // the terminal itself unchanged. Replaying for that would redraw the whole
    // transcript on every keystroke that opens one.
    expect(needsReplay(size(80, 40), size(80, 40))).toBe(false);
  });

  test("a nonsense size is ignored rather than acted on", () => {
    expect(needsReplay(size(80, 40), size(0, 40))).toBe(false);
    expect(needsReplay(size(80, 40), size(80, 0))).toBe(false);
    expect(needsReplay(size(80, 40), size(Number.NaN, 40))).toBe(false);
  });
});

describe("the resize replay scheduler", () => {
  test("collapses a burst of resizes into one replay at the final size", () => {
    const { timers, replays, scheduler } = recorder(size(120, 40));

    // Zooming emits a stream of these, and the renderer does not debounce them
    // in split-footer mode, so we must.
    for (const width of [110, 100, 92, 84, 80]) scheduler.onResize(size(width, 30));
    expect(replays).toEqual([]);

    timers.flush();
    expect(replays).toEqual([size(80, 30)]);
  });

  test("ignores a resize that left the terminal the same size", () => {
    const { timers, replays, scheduler } = recorder(size(80, 40));

    scheduler.onResize(size(80, 40));
    expect(timers.scheduled).toBe(0);
    timers.flush();
    expect(replays).toEqual([]);
  });

  test("replays again when the size changes a second time", () => {
    const { timers, replays, scheduler } = recorder(size(80, 40));

    scheduler.onResize(size(100, 40));
    timers.flush();
    scheduler.onResize(size(140, 50));
    timers.flush();
    expect(replays).toEqual([size(100, 40), size(140, 50)]);
  });

  test("a cancelled scheduler does not replay after unmount", () => {
    const { timers, replays, scheduler } = recorder(size(80, 40));

    scheduler.onResize(size(100, 40));
    scheduler.cancel();
    timers.flush();
    expect(replays).toEqual([]);
  });
});
