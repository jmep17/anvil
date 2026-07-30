import React from "react";
import { Box, Text } from "ink";
import { Mascot } from "./Mascot.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { ToolRow } from "./ToolRow.tsx";
import { tailDisplayLines, truncateDisplay } from "./format.ts";
import type { TimelineItem } from "./types.ts";

/** Fixed rows reserved for Activity so chrome never jumps when busy. */
export const ACTIVITY_RESERVE = 6;

export function Activity({
  busy,
  thinking,
  streaming,
  runningTools,
  columns,
}: {
  busy: boolean;
  thinking: string;
  streaming: string;
  runningTools: Extract<TimelineItem, { kind: "tool" }>[];
  columns: number;
}) {
  const active =
    busy || Boolean(thinking) || Boolean(streaming) || runningTools.length > 0;
  if (!active) return null;

  const showWorking = busy && !streaming;
  // Keep one running tool visible while reserving the rest for a readable
  // response. More tools are still retained in the completed transcript.
  const tools = streaming ? runningTools.slice(0, 1) : runningTools.slice(0, 4);
  const streamRows = Math.max(1, ACTIVITY_RESERVE - tools.length);
  const excerpt = streaming
    ? tailDisplayLines(streaming, Math.max(20, columns - 4), streamRows)
    : null;

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
      {excerpt
        ? excerpt.lines.map((line, index) => (
            <Box key={`stream-${index}`} flexShrink={0}>
              <Text color="magenta">{index === 0 ? "✦ " : "  "}</Text>
              <Text>{line || " "}</Text>
            </Box>
          ))
        : null}
    </Box>
  );
}
