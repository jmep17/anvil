import type { TimeoutConfig } from "../config/types.ts";

/**
 * What the turn is currently waiting on. Each gets its own budget: waiting for
 * the first token covers prompt processing and is legitimately slow, while a
 * gap in the middle of a response means something has gone wrong.
 */
export type StallPhase = "first-chunk" | "chunk" | "tool";

export function stallBudget(phase: StallPhase, timeouts: TimeoutConfig): number {
  switch (phase) {
    case "first-chunk":
      return timeouts.firstChunkMs;
    case "chunk":
      return timeouts.chunkMs;
    case "tool":
      return timeouts.toolMs;
  }
}

export function describeStall(phase: StallPhase): string {
  switch (phase) {
    case "first-chunk":
      return "waiting for the model to start responding";
    case "chunk":
      return "waiting for the next token";
    case "tool":
      return "waiting for a tool to finish";
  }
}

/**
 * Silence detector for a turn.
 *
 * The AI SDK's own `timeout` instruments the stream it is handed, so it cannot
 * see the failure that actually strands a local agent: a server that accepts
 * the request, returns nothing, and never closes the connection — the fetch
 * never resolves, so there is no stream to time out. This tracks wall-clock
 * silence around the whole call instead, and the caller aborts on it.
 *
 * Kept free of timers so it can be tested by advancing a clock.
 */
export class StallDetector {
  private phaseValue: StallPhase = "first-chunk";
  private lastBeat: number;

  constructor(
    private readonly timeouts: TimeoutConfig,
    startedAt: number,
  ) {
    this.lastBeat = startedAt;
  }

  get phase(): StallPhase {
    return this.phaseValue;
  }

  /** Record activity, optionally changing what is now being waited on. */
  beat(at: number, phase?: StallPhase): void {
    this.lastBeat = at;
    if (phase) this.phaseValue = phase;
  }

  /** How long it has been silent past its budget, or null if still within it. */
  overdue(at: number): number | null {
    const idle = at - this.lastBeat;
    return idle > stallBudget(this.phaseValue, this.timeouts) ? idle : null;
  }
}

export interface StallReport {
  phase: StallPhase;
  idleMs: number;
}

/**
 * Polls a `StallDetector` and reports at most one stall.
 *
 * The "at most one" is the whole point. The detector keeps failing its check for
 * as long as the aborted stream takes to unwind — which, for the connection that
 * caused the stall, can be a long time. Reporting every poll buried the
 * transcript under one error per second and left the UI unusable.
 */
export class StallWatch {
  private reported: StallReport | null = null;

  constructor(
    private readonly detector: StallDetector,
    private readonly awaitingUser: () => boolean = () => false,
  ) {}

  /** The stall this run gave up on, or null if it has not. */
  get report(): StallReport | null {
    return this.reported;
  }

  /** The stall, the first time one is seen; null on every other call. */
  tick(at: number): StallReport | null {
    if (this.reported) return null;
    // A turn waiting on an approval prompt is not a turn that has stalled, and
    // timing out on it would answer the prompt for the user.
    if (this.awaitingUser()) {
      this.detector.beat(at);
      return null;
    }
    const idleMs = this.detector.overdue(at);
    if (idleMs == null) return null;
    this.reported = { phase: this.detector.phase, idleMs };
    return this.reported;
  }
}

export function formatStallDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

/** The message a stalled turn ends with. Names the cause and the way out. */
export function stallMessage(phase: StallPhase, idleMs: number): string {
  return [
    `The model server went quiet — ${describeStall(phase)} for ${formatStallDuration(idleMs)}.`,
    "Anvil stopped waiting rather than hang. Check the server is still loaded and has room for this context,",
    "then send the message again. Raise `timeouts` in the config if this was a legitimately slow run.",
  ].join(" ");
}
