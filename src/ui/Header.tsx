import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";
import { TextAttributes } from "@opentui/core";

function statusLines(status: string, columns: number): string[] {
  // Borders + padding + the leading status dot consume six columns.
  return wrapDisplayLines(status, Math.max(12, columns - 6));
}

/** Includes the box borders and is used to reserve transcript space. */
export function headerHeight(status: string, columns: number): number {
  return 3 + statusLines(status, columns).length;
}

export function Header({ status, columns }: { status: string; columns: number }) {
  const statusColor = status.startsWith("online")
    ? colors.green
    : status.startsWith("offline")
      ? colors.red
      : status.startsWith("checking")
        ? colors.yellow
        : colors.cyan;
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={colors.border}
      backgroundColor={colors.surface}
      paddingX={1}
      width="100%"
      flexDirection="column"
      flexShrink={0}
    >
      <box flexDirection="row">
        <text fg={colors.purple} attributes={TextAttributes.BOLD}>
          ◈ ANVIL
        </text>
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {"  LOCAL AGENT"}
        </text>
      </box>
      {statusLines(status, columns).map((line, index) => (
        <text key={index} fg={statusColor} attributes={TextAttributes.DIM}>
          {`${index === 0 ? "● " : "  "}${line || " "}`}
        </text>
      ))}
    </box>
  );
}
