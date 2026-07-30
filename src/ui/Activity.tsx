import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.tsx";
import { ToolRow } from "./ToolRow.tsx";
import { truncateDisplay } from "./format.ts";
import type { TimelineItem } from "./types.ts";

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
  if (!busy && !thinking && !streaming && runningTools.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={0}>
      {runningTools.map((t) => (
        <ToolRow key={t.id} item={t} />
      ))}
      {busy && !streaming && !thinking && runningTools.length === 0 ? (
        <Box>
          <Spinner color="magenta" />
          <Text dimColor> thinking…</Text>
        </Box>
      ) : null}
      {thinking ? (
        <Box>
          <Spinner color="magenta" />
          <Text dimColor italic>
            {" "}
            {truncateDisplay(thinking.replace(/\n/g, " "), 120)}
          </Text>
        </Box>
      ) : null}
      {streaming ? (
        <Text>{streaming.length > 400 ? streaming.slice(-400) : streaming}</Text>
      ) : null}
    </Box>
  );
}
