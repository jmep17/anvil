import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { colors } from "./theme.ts";

/** Entries shown at once. The ring holds up to `MAX_HISTORY`, so it scrolls. */
export const HISTORY_VISIBLE = 8;

/** Rows the picker occupies, for the pinned-region reservation. */
export function historyPickerRows(count: number): number {
  // border (2) + title (1) + rows (at least one for the empty state)
  return 3 + Math.max(1, Math.min(count, HISTORY_VISIBLE));
}

/** The slice to draw, keeping the selection roughly centred. */
export function historyWindow(
  count: number,
  selected: number,
): { start: number; end: number } {
  if (count <= HISTORY_VISIBLE) return { start: 0, end: count };
  const half = Math.floor(HISTORY_VISIBLE / 2);
  const start = Math.min(Math.max(0, selected - half), count - HISTORY_VISIBLE);
  return { start, end: start + HISTORY_VISIBLE };
}

/** One row per prompt: newlines become a visible marker rather than wrapping. */
export function historyLabel(entry: string): string {
  return entry.replace(/\s*\n\s*/g, " ⏎ ").replace(/\s+/g, " ").trim();
}

export const HistoryPicker = memo(function HistoryPicker({
  entries,
  selected,
  columns,
}: {
  /** Oldest first, so ↑ walks backwards in time and up the list at once. */
  entries: string[];
  selected: number;
  columns: number;
}) {
  const width = Math.max(20, columns - 6);
  const { start, end } = historyWindow(entries.length, selected);
  const shown = entries.slice(start, end);

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={colors.accentDim}
      paddingX={1}
      flexShrink={0}
      width="100%"
    >
      <text fg={colors.accent} attributes={TextAttributes.BOLD}>
        {`Previous prompts  (${entries.length})`}
      </text>
      {entries.length === 0 ? (
        <text fg={colors.muted}>No earlier prompts in this project.</text>
      ) : (
        shown.map((entry, index) => {
          const position = start + index;
          const active = position === selected;
          return (
            <text
              // Duplicate prompts are possible, so position is the identity.
              key={position}
              fg={active ? colors.selectionFg : colors.muted}
              bg={active ? colors.selectionBg : undefined}
              attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
            >
              {`${active ? "› " : "  "}${historyLabel(entry).slice(0, width)}`}
            </text>
          );
        })
      )}
    </box>
  );
});
