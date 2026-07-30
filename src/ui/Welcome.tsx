import { memo } from "react";
import { TextAttributes } from "@opentui/core";
import { colors } from "./theme.ts";

/**
 * Shown once at the top of the transcript and then scrolled away, rather than
 * pinned as chrome — the working area is worth more than a permanent banner.
 */
export const Welcome = memo(function Welcome({
  cwd,
  model,
  resumed,
}: {
  cwd: string;
  model: string;
  resumed?: number;
}) {
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
        ✻ Welcome to Anvil
      </text>
      <text fg={colors.muted} attributes={TextAttributes.DIM}>
        {"  /help for commands · @ to reference a file · shift+tab for plan mode"}
      </text>
      <text fg={colors.faint} attributes={TextAttributes.DIM}>
        {`  cwd: ${cwd}`}
      </text>
      <text fg={colors.faint} attributes={TextAttributes.DIM}>
        {`  model: ${model}`}
      </text>
      {resumed ? (
        <text fg={colors.faint} attributes={TextAttributes.DIM}>
          {`  resumed ${resumed} message${resumed === 1 ? "" : "s"} from a previous session`}
        </text>
      ) : null}
    </box>
  );
});

/** Rows the welcome block occupies, for the transcript height reservation. */
export function welcomeHeight(resumed?: number): number {
  return 6 + (resumed ? 1 : 0);
}
