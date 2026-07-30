import React from "react";
import { Box, Text } from "ink";
import { ToolRow } from "./ToolRow.tsx";
import type { TimelineItem } from "./types.ts";
import { headDisplayLines, truncateDisplay } from "./format.ts";

const ASSISTANT_PREVIEW_LINES = 8;

function estimateLines(item: TimelineItem, columns: number): number {
  if (item.kind === "tool") return 1;
  if (item.kind === "assistant") {
    return headDisplayLines(item.text, Math.max(20, columns - 2), ASSISTANT_PREVIEW_LINES)
      .lines.length;
  }
  // user, thinking, status, error — always one display line
  return 1;
}

function takeFit(items: TimelineItem[], maxLines: number, columns: number): TimelineItem[] {
  if (maxLines <= 0 || items.length === 0) return [];
  const out: TimelineItem[] = [];
  let used = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    const n = estimateLines(item, columns);
    if (out.length > 0 && used + n > maxLines) break;
    out.unshift(item);
    used += n;
  }
  return out;
}

function ItemView({
  item,
  columns,
  maxAssistantLines,
}: {
  item: TimelineItem;
  columns: number;
  maxAssistantLines: number;
}) {
  switch (item.kind) {
    case "user":
      return (
        <Text color="cyan">
          {"you> "}
          {truncateDisplay(item.text.replace(/\n/g, " ↵ "), Math.max(20, columns - 7))}
        </Text>
      );
    case "assistant": {
      const excerpt = headDisplayLines(
        item.text,
        Math.max(20, columns - 2),
        maxAssistantLines,
      );
      return (
        <Box flexDirection="column">
          {excerpt.lines.map((line, index) => (
            <Box key={index} flexShrink={0}>
              <Text color="magenta">{index === 0 ? "✦ " : "  "}</Text>
              <Text>{line || " "}</Text>
            </Box>
          ))}
        </Box>
      );
    }
    case "thinking":
      return (
        <Text dimColor italic>
          {truncateDisplay(item.text.replace(/\n/g, " "), Math.max(20, columns - 2))}
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
  columns,
}: {
  items: TimelineItem[];
  maxLines: number;
  columns: number;
}) {
  const visible = takeFit(items, maxLines, columns);
  return (
    <Box
      flexDirection="column"
      height={Math.max(maxLines, 1)}
      overflow="hidden"
      justifyContent="flex-start"
      flexGrow={1}
    >
      {visible.map((item) => (
        <Box key={item.id} flexShrink={0}>
          <ItemView
            item={item}
            columns={columns}
            maxAssistantLines={Math.min(ASSISTANT_PREVIEW_LINES, Math.max(1, maxLines))}
          />
        </Box>
      ))}
    </Box>
  );
}
