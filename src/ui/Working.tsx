import { memo, useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { colors } from "./theme.ts";

const FRAMES = ["·", "✢", "✳", "∗", "✻", "✽", "✻", "∗", "✳", "✢"];
const FRAME_MS = 120;

const VERBS = [
  "Working",
  "Thinking",
  "Puzzling",
  "Digging",
  "Pondering",
  "Wrangling",
  "Noodling",
  "Considering",
];
const VERB_MS = 6_000;

/** Drives the animation clock. Ticks only while `active`, so an idle TUI is still. */
function useTicker(active: boolean, intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) {
      setTick(0);
      return;
    }
    const timer = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return tick;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** What the turn is currently blocked on, and when it started waiting. */
export interface WorkingActivity {
  label: string;
  since: number;
}

/**
 * How long a phase must last before its own duration is worth showing. Below
 * this it is just noise; above it, it is the difference between "this is slow"
 * and "this has hung, and here is what on".
 */
export const ACTIVITY_HINT_MS = 10_000;

/** `✻ Pondering… (12s · waiting for the model 11s · esc to interrupt)` */
export function workingLabel(
  frame: string,
  verb: string,
  elapsedMs: number,
  extra: {
    tokens?: number;
    queued?: number;
    activity?: string;
    activityMs?: number;
  } = {},
): string {
  const { tokens, queued, activity, activityMs } = extra;
  const parts = [formatElapsed(elapsedMs)];
  if (activity) {
    // A turn that has been silent for an hour should say so, and say what it
    // was silent on. The spinner alone reads as progress.
    parts.push(
      activityMs != null && activityMs >= ACTIVITY_HINT_MS
        ? `${activity} ${formatElapsed(activityMs)}`
        : activity,
    );
  }
  if (tokens && tokens > 0) {
    parts.push(tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tokens` : `${tokens} tokens`);
  }
  if (queued) parts.push(`${queued} queued`);
  parts.push("esc to interrupt");
  return `${frame} ${verb}… (${parts.join(" · ")})`;
}

export const Working = memo(function Working({
  startedAt,
  tokens,
  queued,
  activity,
}: {
  startedAt: number;
  tokens?: number;
  queued?: number;
  activity?: WorkingActivity | null;
}) {
  const tick = useTicker(true, FRAME_MS);
  const now = Date.now();
  const elapsed = now - startedAt;
  const frame = FRAMES[tick % FRAMES.length]!;
  const verb = VERBS[Math.floor(elapsed / VERB_MS) % VERBS.length]!;

  return (
    <box flexDirection="row" flexShrink={0} paddingX={1}>
      <text fg={colors.accent} attributes={TextAttributes.BOLD}>
        {workingLabel(frame, verb, elapsed, {
          tokens,
          queued,
          activity: activity?.label,
          activityMs: activity ? now - activity.since : undefined,
        })}
      </text>
    </box>
  );
});

/** One row, always. */
export function workingHeight(): number {
  return 1;
}
