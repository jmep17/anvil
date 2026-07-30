import React from "react";
import { Box, Text } from "ink";
import { ToolRow } from "./ToolRow.tsx";
import type { TimelineItem } from "./types.ts";
import { truncateDisplay } from "./format.ts";

/** Collapse blank lines and cap height for dense assistant display. */
function densifyAssistant(text: string, maxLines = 4, maxChars = 400): string {
  const clipped = text.length > maxChars ? text.slice(-maxChars) : text;
  const lines = clipped
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return lines.slice(-maxLines).join("\n") || clipped.trim();
}

function estimateLines(item: TimelineItem): number {
  if (item.kind === "tool") return 1;
  if (item.kind === "assistant") {
    return Math.min(4, Math.max(1, densifyAssistant(item.text).split("\n").length));
  }
  // user, thinking, status, error — always one display line
  return 1;
}

function takeFit(items: TimelineItem[], maxLines: number): TimelineItem[] {
  if (maxLines <= 0 || items.length === 0) return [];
  const out: TimelineItem[] = [];
  let used = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    const n = estimateLines(item);
    if (out.length > 0 && used + n > maxLines) break;
    out.unshift(item);
    used += n;
  }
  return out;
}

function ItemView({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case "user":
      return (
        <Text color="cyan">
          {"you> "}
          {truncateDisplay(item.text.replace(/\n/g, " ↵ "), 200)}
        </Text>
      );
    case "assistant":
      return <Text>{densifyAssistant(item.text)}</Text>;
    case "thinking":
      return (
        <Text dimColor italic>
          {truncateDisplay(item.text.replace(/\n/g, " "), 160)}
        </Text>
      );
    case "tool":
      return <ToolRow item={item} />;
    case "status":
      return <Text dimColor>{item.text}</Text>;
    case "error":
      return <Text color="red">{item.text}</Text>;
  }
}

export function Timeline({
  items,
  maxLines,
}: {
  items: TimelineItem[];
  maxLines: number;
}) {
  const visible = takeFit(items, maxLines);
  return (
    <Box
      flexDirection="column"
      height={Math.max(maxLines, 1)}
      overflow="hidden"
      justifyContent="flex-end"
      flexGrow={1}
    >
      {visible.map((item) => (
        <Box key={item.id} flexShrink={0}>
          <ItemView item={item} />
        </Box>
      ))}
    </Box>
  );
}
