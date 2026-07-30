import React from "react";
import { Box, Text } from "ink";
import { ToolRow } from "./ToolRow.tsx";
import type { TimelineItem } from "./types.ts";
import { truncateDisplay } from "./format.ts";

function estimateLines(item: TimelineItem): number {
  if (item.kind === "tool") {
    return item.status !== "running" && item.output ? 2 : 1;
  }
  if (item.kind === "user" || item.kind === "assistant" || item.kind === "thinking") {
    const lines = item.text.split("\n").length;
    return Math.min(Math.max(lines, 1), 6);
  }
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
      return <Text>{item.text.length > 400 ? `${item.text.slice(-400)}` : item.text}</Text>;
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
    <Box flexDirection="column" height={Math.max(maxLines, 1)} overflow="hidden">
      {visible.map((item) => (
        <ItemView key={item.id} item={item} />
      ))}
    </Box>
  );
}
