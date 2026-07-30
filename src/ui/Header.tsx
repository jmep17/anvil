import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";
import { TextAttributes } from "@opentui/core";

function statusLines(status: string, columns: number): string[] {
  return wrapDisplayLines(status, Math.max(12, columns - 4));
}

/** Includes the box borders and is used to reserve transcript space. */
export function headerHeight(status: string, columns: number): number {
  return 3 + statusLines(status, columns).length;
}

export function Header({ status, columns }: { status: string; columns: number }) {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={colors.magenta}
      paddingX={1}
      width="100%"
      flexDirection="column"
      flexShrink={0}
    >
      <box flexDirection="row">
        <text fg={colors.magenta} attributes={TextAttributes.BOLD}>
          ◆ ANVIL
        </text>
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {"  LOCAL CODING AGENT"}
        </text>
      </box>
      {statusLines(status, columns).map((line, index) => (
        <text key={index} fg={colors.cyan} attributes={TextAttributes.DIM}>
          {line || " "}
        </text>
      ))}
    </box>
  );
}
