import React from "react";
import { Box, Text } from "ink";

export function FilePicker({
  matches,
  selected,
  query,
  columns,
}: {
  matches: string[];
  selected: number;
  query: string;
  columns: number;
}) {
  if (matches.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} flexShrink={0}>
        <Text dimColor>@{query || "…"} · no matching files</Text>
      </Box>
    );
  }

  const width = Math.max(12, columns - 4);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} flexShrink={0}>
      <Text dimColor>@{query || "…"} · {matches.length} file{matches.length === 1 ? "" : "s"}</Text>
      {matches.map((path, index) => {
        const active = index === selected;
        const label = path.length > width - 2 ? `…${path.slice(-(width - 3))}` : path;
        return (
          <Text key={path} color={active ? "magenta" : undefined} inverse={active} bold={active}>
            {active ? "› " : "  "}
            {label}
          </Text>
        );
      })}
    </Box>
  );
}

export function filePickerRows(matches: string[]): number {
  // border (2) + header (1) + rows (at least 1 for empty state)
  return 3 + Math.max(1, matches.length);
}
