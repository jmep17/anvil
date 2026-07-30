import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { relativeTime, type SessionSummary } from "../session/store.ts";
import { colors } from "./theme.ts";

/** Rows the picker occupies, for the transcript height reservation. */
export function sessionPickerRows(sessions: SessionSummary[]): number {
  // border (2) + title (1) + rows (at least one for the empty state)
  return 3 + Math.max(1, sessions.length);
}

export const SessionPicker = memo(function SessionPicker({
  sessions,
  selected,
  columns,
  currentId,
}: {
  sessions: SessionSummary[];
  selected: number;
  columns: number;
  currentId?: string;
}) {
  const width = Math.max(20, columns - 6);

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
        {`Resume a session  (${sessions.length})`}
      </text>
      {sessions.length === 0 ? (
        <text fg={colors.muted}>No earlier sessions for this project.</text>
      ) : (
        sessions.map((session, index) => {
          const active = index === selected;
          const when = relativeTime(session.updatedAt).padEnd(9);
          const count = `${session.messageCount} msg`.padEnd(8);
          const here = session.id === currentId ? " (current)" : "";
          const label = `${when} ${count} ${session.preview || session.id}${here}`;
          return (
            <text
              key={session.id}
              fg={active ? colors.selectionFg : colors.muted}
              bg={active ? colors.selectionBg : undefined}
              attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
            >
              {`${active ? "› " : "  "}${label.slice(0, width)}`}
            </text>
          );
        })
      )}
    </box>
  );
});
