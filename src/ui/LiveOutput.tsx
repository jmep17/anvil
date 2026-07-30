import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";

/**
 * Content rows the in-flight preview may occupy. The transcript itself lives in
 * the terminal's scrollback, which is append-only, so a response that is still
 * being written cannot go there — it would reflow as it parses. It is previewed
 * here, in the pinned region, and committed to scrollback as markdown once the
 * turn (or the next tool call) ends.
 */
export const LIVE_PREVIEW_ROWS = 6;

const THINKING_LABEL = "✻ Thinking…";

export interface LivePreview {
  /** Shown above the lines, or null when the preview is prose. */
  header: string | null;
  lines: string[];
}

function tail(lines: string[], max: number): string[] {
  return max <= 0 ? [] : lines.slice(-max);
}

/**
 * What the preview draws for the current live state. Prose wins over reasoning:
 * once the model starts answering, the reasoning that led there is finished and
 * is about to be committed to scrollback anyway.
 */
export function livePreview(
  thinking: string,
  streaming: string,
  columns: number,
): LivePreview {
  const width = Math.max(8, (columns || 80) - 2);

  const prose = streaming.replace(/\s+$/, "");
  if (prose) {
    return { header: null, lines: tail(wrapDisplayLines(prose, width), LIVE_PREVIEW_ROWS) };
  }

  const reasoning = thinking.replace(/\s+$/, "");
  if (!reasoning) return { header: null, lines: [] };
  return {
    header: THINKING_LABEL,
    lines: tail(wrapDisplayLines(reasoning, width), LIVE_PREVIEW_ROWS - 1),
  };
}

/** Rows the preview occupies, for the pinned-region reservation. */
export function liveOutputRows(
  thinking: string,
  streaming: string,
  columns: number,
): number {
  const preview = livePreview(thinking, streaming, columns);
  return (preview.header ? 1 : 0) + preview.lines.length;
}

export const LiveOutput = memo(function LiveOutput({
  thinking,
  streaming,
  columns,
}: {
  thinking: string;
  streaming: string;
  columns: number;
}) {
  const preview = livePreview(thinking, streaming, columns);
  if (!preview.header && preview.lines.length === 0) return null;

  return (
    <box flexDirection="column" flexShrink={0} paddingX={1}>
      {preview.header ? (
        <text fg={colors.accentDim} attributes={TextAttributes.ITALIC}>
          {preview.header}
        </text>
      ) : null}
      {preview.lines.map((line, index) => (
        <text
          // Rows are positional: the tail slides, so the text is not an identity.
          key={index}
          fg={preview.header ? colors.faint : colors.text}
          attributes={preview.header ? TextAttributes.ITALIC : TextAttributes.NONE}
        >
          {line.length > 0 ? line : " "}
        </text>
      ))}
    </box>
  );
});
