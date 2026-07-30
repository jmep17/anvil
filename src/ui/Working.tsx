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

/** `✻ Pondering… (12s · 1.4k tokens · esc to interrupt)` */
export function workingLabel(
  frame: string,
  verb: string,
  elapsedMs: number,
  tokens?: number,
  queued?: number,
): string {
  const parts = [formatElapsed(elapsedMs)];
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
}: {
  startedAt: number;
  tokens?: number;
  queued?: number;
}) {
  const tick = useTicker(true, FRAME_MS);
  const elapsed = Date.now() - startedAt;
  const frame = FRAMES[tick % FRAMES.length]!;
  const verb = VERBS[Math.floor(elapsed / VERB_MS) % VERBS.length]!;

  return (
    <box flexDirection="row" flexShrink={0} paddingX={1}>
      <text fg={colors.accent} attributes={TextAttributes.BOLD}>
        {workingLabel(frame, verb, elapsed, tokens, queued)}
      </text>
    </box>
  );
});

/** One row, always. */
export function workingHeight(): number {
  return 1;
}
