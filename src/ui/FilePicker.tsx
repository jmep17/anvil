import { TextAttributes } from "@opentui/core";
import { colors } from "./theme.ts";

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
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={colors.muted}
        paddingX={1}
        flexShrink={0}
      >
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {`@${query || "…"} · no matching files`}
        </text>
      </box>
    );
  }

  const width = Math.max(12, columns - 4);
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={colors.magenta}
      paddingX={1}
      flexShrink={0}
    >
      <text fg={colors.muted} attributes={TextAttributes.DIM}>
        {`@${query || "…"} · ${matches.length} file${matches.length === 1 ? "" : "s"}`}
      </text>
      {matches.map((path, index) => {
        const active = index === selected;
        const label = path.length > width - 2 ? `…${path.slice(-(width - 3))}` : path;
        return (
          <text
            key={path}
            fg={active ? colors.magenta : colors.text}
            attributes={
              active ? TextAttributes.BOLD | TextAttributes.INVERSE : TextAttributes.NONE
            }
          >
            {`${active ? "› " : "  "}${label}`}
          </text>
        );
      })}
    </box>
  );
}

export function filePickerRows(matches: string[]): number {
  // border (2) + header (1) + rows (at least 1 for empty state)
  return 3 + Math.max(1, matches.length);
}
