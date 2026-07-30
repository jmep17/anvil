import React from "react";
import { Box, Text } from "ink";
import { Mascot } from "./Mascot.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { ToolRow } from "./ToolRow.tsx";
import { truncateDisplay } from "./format.ts";
import type { TimelineItem } from "./types.ts";

/** Fixed rows reserved for Activity so chrome never jumps when busy. */
export const ACTIVITY_RESERVE = 4;

export function Activity({
  busy,
  thinking,
  streaming,
  runningTools,
}: {
  busy: boolean;
  thinking: string;
  streaming: string;
  runningTools: Extract<TimelineItem, { kind: "tool" }>[];
}) {
  const active =
    busy || Boolean(thinking) || Boolean(streaming) || runningTools.length > 0;
  if (!active) return null;

  const showWorking = busy && !streaming;
  const toolBudget = Math.max(0, ACTIVITY_RESERVE - (showWorking ? 2 : 0) - (streaming ? 2 : 0));
  const tools = runningTools.slice(0, Math.max(1, toolBudget));

  return (
    <Box
      flexDirection="column"
      height={ACTIVITY_RESERVE}
      overflow="hidden"
      flexShrink={0}
    >
      {tools.map((t) => (
        <ToolRow key={t.id} item={t} />
      ))}
      {showWorking ? (
        <Box flexShrink={0}>
          <Mascot active={busy} />
          <Text> </Text>
          <ProgressBar active={busy} width={14} />
          <Text dimColor> {thinking ? "thinking" : "working"}…</Text>
        </Box>
      ) : null}
      {thinking && showWorking ? (
        <Box flexShrink={0}>
          <Text dimColor italic>
            {truncateDisplay(thinking.replace(/\n/g, " "), 100)}
          </Text>
        </Box>
      ) : null}
      {streaming ? (
        <Box flexShrink={0} height={2} overflow="hidden">
          <Text>{streaming.length > 160 ? streaming.slice(-160) : streaming}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
