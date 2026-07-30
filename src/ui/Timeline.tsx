import React from "react";
import { Box, Text } from "ink";
import { formatToolDuration, formatToolInput, wrapDisplayLines } from "./format.ts";
import type { TimelineItem } from "./types.ts";

type Tone =
  | "user"
  | "assistant"
  | "thinking"
  | "tool-running"
  | "tool-done"
  | "tool-error"
  | "status"
  | "error";

interface DisplayLine {
  key: string;
  text: string;
  tone: Tone;
}

const COLORS: Record<Tone, string | undefined> = {
  user: "cyan",
  assistant: undefined,
  thinking: "gray",
  "tool-running": "yellow",
  "tool-done": "green",
  "tool-error": "red",
  status: "gray",
  error: "red",
};

function appendWrapped(
  lines: DisplayLine[],
  key: string,
  text: string,
  tone: Tone,
  width: number,
  prefix = "│  ",
): void {
  for (const [index, line] of wrapDisplayLines(text, width).entries()) {
    lines.push({ key: `${key}-${index}`, text: `${prefix}${line || " "}`, tone });
  }
}

function appendTool(
  lines: DisplayLine[],
  item: Extract<TimelineItem, { kind: "tool" }>,
  width: number,
): void {
  const tone: Tone = item.status === "running"
    ? "tool-running"
    : item.status === "done"
      ? "tool-done"
      : "tool-error";
  const state = item.status === "running" ? "running" : item.status === "done" ? "complete" : "failed";
  const icon = item.status === "running" ? "◌" : item.status === "done" ? "✓" : "✕";
  const duration = formatToolDuration(item.ms);
  appendWrapped(
    lines,
    `${item.id}-title`,
    `╭─ ${icon} ${item.name} · ${state}${duration ? ` · ${duration}` : ""}`,
    tone,
    width,
    "",
  );
  lines.push({ key: `${item.id}-input-label`, text: "│  input", tone: "status" });
  appendWrapped(lines, `${item.id}-input`, formatToolInput(item.input), "status", width);
  if (item.output != null) {
    lines.push({ key: `${item.id}-output-label`, text: "│  output", tone: "status" });
    appendWrapped(lines, `${item.id}-output`, item.output, tone, width);
  }
  lines.push({ key: `${item.id}-end`, text: "╰─", tone });
}

function appendItem(lines: DisplayLine[], item: TimelineItem, width: number): void {
  switch (item.kind) {
    case "user":
      lines.push({ key: `${item.id}-title`, text: "╭─ you", tone: "user" });
      appendWrapped(lines, item.id, item.text, "user", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "user" });
      return;
    case "assistant":
      lines.push({ key: `${item.id}-title`, text: "╭─ ✦ anvil", tone: "assistant" });
      appendWrapped(lines, item.id, item.text, "assistant", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "assistant" });
      return;
    case "thinking":
      lines.push({ key: `${item.id}-title`, text: "╭─ thinking", tone: "thinking" });
      appendWrapped(lines, item.id, item.text, "thinking", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "thinking" });
      return;
    case "tool":
      appendTool(lines, item, width);
      return;
    case "status":
      appendWrapped(lines, item.id, `· ${item.text}`, "status", width, "  ");
      return;
    case "error":
      lines.push({ key: `${item.id}-title`, text: "╭─ ✕ error", tone: "error" });
      appendWrapped(lines, item.id, item.text, "error", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "error" });
      return;
  }
}

export function buildTranscriptLines(
  items: TimelineItem[],
  columns: number,
  thinking?: string,
  streaming?: string,
): DisplayLine[] {
  // Four columns are reserved for the card rail. Individual rows are split
  // before Ink sees them, preventing long paths and file lines from overflow.
  const width = Math.max(12, columns - 4);
  const lines: DisplayLine[] = [];
  for (const item of items) appendItem(lines, item, width);
  if (thinking) appendItem(lines, { kind: "thinking", id: "live-thinking", text: thinking }, width);
  if (streaming) appendItem(lines, { kind: "assistant", id: "live-response", text: streaming }, width);
  return lines;
}

export function Timeline({
  items,
  maxLines,
  columns,
  thinking,
  streaming,
  scrollOffset = 0,
}: {
  items: TimelineItem[];
  maxLines: number;
  columns: number;
  thinking?: string;
  streaming?: string;
  /** Number of rendered transcript rows above the live tail. */
  scrollOffset?: number;
}) {
  const lines = buildTranscriptLines(items, columns, thinking, streaming);
  const end = Math.max(0, lines.length - scrollOffset);
  const visible = lines.slice(Math.max(0, end - Math.max(maxLines, 1)), end);
  return (
    <Box
      flexDirection="column"
      height={Math.max(maxLines, 1)}
      overflow="hidden"
      justifyContent="flex-end"
      flexGrow={1}
    >
      {visible.map((line) => (
        <Box key={line.key} flexShrink={0}>
          <Text
            color={COLORS[line.tone]}
            dimColor={line.tone === "thinking" || line.tone === "status"}
            italic={line.tone === "thinking"}
          >
            {line.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
