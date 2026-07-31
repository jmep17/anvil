/**
 * When the terminal is resized, the transcript already in its scrollback was
 * laid out for the old size — pre-wrapped rows, hanging indents, a bordered
 * welcome block. The terminal re-wraps all of it at the new column count, and
 * the pinned region moves without the rows it used to occupy always being
 * cleared, so the prompt and footer can be left behind as a second copy. That
 * is what makes zooming look like the CLI has come apart and duplicated itself.
 *
 * OpenTUI's answer is a "destructive resize replay": reset the split-footer
 * bookkeeping, clear the mangled copy, and re-commit the transcript at the new
 * size. This module holds the decision of *when* to do that, kept free of the
 * renderer so it can be tested without a terminal.
 */

/** Resize bursts as the font scales; one replay at the end is enough. */
export const RESIZE_REPLAY_DEBOUNCE_MS = 150;

/** Terminal dimensions — not the renderer's, which are the pinned region's. */
export interface TerminalSize {
  width: number;
  height: number;
}

function usable(size: TerminalSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/**
 * A replay is needed whenever the terminal itself changed size. Width decides
 * how every committed row re-wraps; height moves the pinned region, which can
 * strand the rows it previously occupied.
 *
 * This must be measured against the *terminal*, never the renderer's own
 * height: in split-footer mode that is the footer's height, and setting
 * `renderer.footerHeight` emits a resize event of its own. Comparing those
 * would replay the whole transcript every time a picker opened.
 */
export function needsReplay(previous: TerminalSize, next: TerminalSize): boolean {
  if (!usable(next)) return false;
  return next.width !== previous.width || next.height !== previous.height;
}

/** Whatever the injected timer returns; Bun and the DOM lib disagree on it. */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

export interface ResizeReplayScheduler {
  /** Note a resize. Runs the replay once the burst settles, if it needs one. */
  onResize(size: TerminalSize): void;
  /** Drop a pending replay (unmount). */
  cancel(): void;
}

/**
 * Collapses a burst of resizes into a single replay at the new size.
 *
 * `initialSize` seeds the comparison so the first event after startup does not
 * replay a transcript that is already correct.
 */
export function createResizeReplayScheduler(opts: {
  initialSize: TerminalSize;
  replay: (size: TerminalSize) => void;
  debounceMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
}): ResizeReplayScheduler {
  const debounceMs = opts.debounceMs ?? RESIZE_REPLAY_DEBOUNCE_MS;
  const schedule: (fn: () => void, ms: number) => TimerHandle =
    opts.setTimeoutFn ?? setTimeout;
  const unschedule: (handle: TimerHandle) => void =
    opts.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let size = opts.initialSize;
  let timer: TimerHandle | null = null;

  const cancel = () => {
    if (timer !== null) unschedule(timer);
    timer = null;
  };

  return {
    onResize(next: TerminalSize) {
      if (!needsReplay(size, next)) return;
      size = next;
      cancel();
      timer = schedule(() => {
        timer = null;
        opts.replay(size);
      }, debounceMs);
    },
    cancel,
  };
}
