import React from "react";
import { Box, Text } from "ink";
import { formatToolDuration, summarizeToolInput, truncateDisplay } from "./format.ts";
import { Spinner } from "./Spinner.tsx";
import type { TimelineItem } from "./types.ts";

type ToolItem = Extract<TimelineItem, { kind: "tool" }>;

export function ToolRow({ item }: { item: ToolItem }) {
  const summary = summarizeToolInput(item.input);
  const dur = formatToolDuration(item.ms);

  if (item.status === "running") {
    return (
      <Box>
        <Spinner color="yellow" />
        <Text color="yellow"> {item.name}</Text>
        {summary ? <Text dimColor> {summary}</Text> : null}
      </Box>
    );
  }

  const ok = item.status === "done";
  const out = item.output ? truncateDisplay(item.output, 100) : "";
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={ok ? "green" : "red"}>{ok ? "✓" : "✗"}</Text>
        <Text color="yellow"> {item.name}</Text>
        {summary ? <Text dimColor> {summary}</Text> : null}
        {dur ? <Text dimColor> · {dur}</Text> : null}
      </Box>
      {out ? (
        <Box marginLeft={2}>
          <Text dimColor>{out}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
