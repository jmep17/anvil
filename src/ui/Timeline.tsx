import React from "react";
import { Box, Text } from "ink";
import { ToolRow } from "./ToolRow.tsx";
import type { TimelineItem } from "./types.ts";
import { truncateDisplay, wrapDisplayLines } from "./format.ts";

type DisplayLine =
  | { key: string; type: "item"; item: Exclude<TimelineItem, { kind: "assistant" }> }
  | { key: string; type: "assistant"; text: string; first: boolean };

function toDisplayLines(items: TimelineItem[], columns: number): DisplayLine[] {
  const width = Math.max(20, columns - 2);
  return items.flatMap<DisplayLine>((item) => {
    if (item.kind !== "assistant") return [{ key: item.id, type: "item", item }];
    const lines = wrapDisplayLines(item.text, width);
    return lines.map((text, index) => ({
      key: `${item.id}-${index}`,
      type: "assistant" as const,
      text,
      first: index === 0,
    }));
  });
}

function ItemView({ item, columns }: { item: Exclude<TimelineItem, { kind: "assistant" }>; columns: number }) {
  switch (item.kind) {
    case "user":
      return (
        <Text color="cyan">
          {"you> "}
          {truncateDisplay(item.text.replace(/\n/g, " ↵ "), Math.max(20, columns - 7))}
        </Text>
      );
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
  scrollOffset = 0,
}: {
  items: TimelineItem[];
  maxLines: number;
  columns: number;
  /** Number of rendered transcript rows above the live tail. */
  scrollOffset?: number;
}) {
  const lines = toDisplayLines(items, columns);
  const end = Math.max(0, lines.length - scrollOffset);
  const visible = lines.slice(Math.max(0, end - Math.max(maxLines, 1)), end);
  return (
    <Box
      flexDirection="column"
      height={Math.max(maxLines, 1)}
      overflow="hidden"
      justifyContent="flex-start"
      flexGrow={1}
    >
      {visible.map((line) => (
        <Box key={line.key} flexShrink={0}>
          {line.type === "assistant" ? (
            <>
              <Text color="magenta">{line.first ? "✦ " : "  "}</Text>
              <Text>{line.text || " "}</Text>
            </>
          ) : (
            <ItemView item={line.item} columns={columns} />
          )}
        </Box>
      ))}
    </Box>
  );
}
