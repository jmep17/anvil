import { TextAttributes } from "@opentui/core";
import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";
import type { VimMode } from "./usePromptInput.ts";

function softWrap(line: string, width: number): string[] {
  const text = line.replace(/\t/g, "  ");
  if (!text) return [""];
  const out: string[] = [];
  for (let start = 0; start < text.length; start += width) {
    out.push(text.slice(start, start + width));
  }
  return out;
}

/** Number of prompt body rows, including its label, after terminal wrapping. */
export function inputContentRows(value: string, columns: number): number {
  const width = Math.max(8, columns - 6);
  return 1 + Math.max(1, value.split("\n").reduce((total, line) => total + softWrap(line, width).length, 0));
}

export function permissionContentRows(
  pending: { toolName: string; detail: string; preview?: string },
  columns: number,
): number {
  const width = Math.max(12, columns - 4);
  const text = [
    `Permission required · ${pending.toolName}`,
    pending.detail,
    ...(pending.preview ? [pending.preview] : []),
    "[a] allow once · [A] same action this session · [d] deny",
  ];
  return text.reduce((total, line) => total + wrapDisplayLines(line, width).length, 0);
}

export function planReviewContentRows(
  phase: "ready" | "denying",
  value: string,
  columns: number,
): number {
  if (phase === "ready") return 2;
  return inputContentRows(value, columns) + 1;
}

export function InputBox({
  value,
  cursor,
  busy,
  pending,
  vimMode,
  editorMode,
  pasteHint,
  planReview,
  columns,
}: {
  value: string;
  cursor: number;
  busy: boolean;
  pending?: { toolName: string; detail: string; preview?: string } | null;
  vimMode?: VimMode;
  editorMode?: "emacs" | "vim";
  pasteHint?: string | null;
  planReview?: "ready" | "denying" | null;
  columns: number;
}) {
  if (pending) {
    const width = Math.max(12, columns - 4);
    return (
      <box
        border
        borderStyle="rounded"
        borderColor={colors.yellow}
        backgroundColor={colors.surfaceRaised}
        paddingX={1}
        flexDirection="column"
        flexShrink={0}
      >
        {wrapDisplayLines(`Permission required · ${pending.toolName}`, width).map((line, index) => (
          <text key={`title-${index}`} fg={colors.yellow} attributes={TextAttributes.BOLD}>
            {line}
          </text>
        ))}
        {wrapDisplayLines(pending.detail, width).map((line, index) => (
          <text key={`detail-${index}`} fg={colors.muted} attributes={TextAttributes.DIM}>
            {line}
          </text>
        ))}
        {pending.preview
          ? wrapDisplayLines(pending.preview, width).map((line, index) => (
              <text key={`preview-${index}`} fg={colors.cyan}>
                {line}
              </text>
            ))
          : null}
        {wrapDisplayLines("[a] allow once · [A] same action this session · [d] deny", width).map(
          (line, index) => (
            <text key={`actions-${index}`} fg={colors.muted} attributes={TextAttributes.DIM}>
              {line}
            </text>
          ),
        )}
      </box>
    );
  }

  if (planReview === "ready") {
    const width = Math.max(12, columns - 4);
    return (
      <box border borderStyle="rounded" borderColor={colors.green} backgroundColor={colors.surfaceRaised} paddingX={1} flexDirection="column" flexShrink={0}>
        <text fg={colors.green} attributes={TextAttributes.BOLD}>PLAN READY FOR REVIEW</text>
        {wrapDisplayLines("[a] approve & implement · [d] decline with feedback", width).map((line, index) => (
          <text key={index} fg={colors.muted} attributes={TextAttributes.DIM}>{line}</text>
        ))}
      </box>
    );
  }

  const lines = value.length === 0 ? [""] : value.split("\n");
  const width = Math.max(8, columns - 6);
  let remaining = cursor;
  let cursorLine = 0;
  let cursorCol = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (remaining <= len) {
      cursorLine = i;
      cursorCol = remaining;
      break;
    }
    remaining -= len + 1;
    if (i === lines.length - 1) {
      cursorLine = i;
      cursorCol = len;
    }
  }

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={busy ? colors.yellow : colors.cyan}
      backgroundColor={colors.surface}
      paddingX={1}
      flexShrink={0}
    >
      <text fg={busy ? colors.yellow : colors.cyan} attributes={TextAttributes.BOLD}>
        {busy ? "REQUEST · AGENT WORKING" : planReview === "denying" ? "PLAN FEEDBACK · WHY REVISE?" : "REQUEST · READY"}
      </text>
      {planReview === "denying" ? (
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          Describe what to change, then press Enter to request a revised plan.
        </text>
      ) : null}
      {editorMode === "vim" ? (
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {vimMode === "normal" ? "-- NORMAL --" : "-- INSERT --"}
        </text>
      ) : null}
      {pasteHint ? <text fg={colors.cyan}>{pasteHint}</text> : null}
      {lines.flatMap((line, lineIndex) => {
        const chunks = softWrap(line, width);
        return chunks.map((chunk, chunkIndex) => {
          const start = chunkIndex * width;
          const active =
            !busy && lineIndex === cursorLine && cursorCol >= start && cursorCol <= start + chunk.length;
          const localCursor = Math.max(0, Math.min(chunk.length, cursorCol - start));
          const prefix = lineIndex === 0 && chunkIndex === 0 ? "› " : "· ";
          if (!active) {
            return (
              <box key={`${lineIndex}-${chunkIndex}`} flexDirection="row">
                <text fg={colors.green}>{prefix}</text>
                <text>{chunk || " "}</text>
              </box>
            );
          }
          const before = chunk.slice(0, localCursor);
          const at = chunk.slice(localCursor, localCursor + 1) || " ";
          const after = chunk.slice(localCursor + 1);
          return (
            <box key={`${lineIndex}-${chunkIndex}`} flexDirection="row">
              <text fg={colors.green}>{prefix}</text>
              <text>{before}</text>
              <text attributes={TextAttributes.INVERSE}>{at}</text>
              <text>{after}</text>
            </box>
          );
        });
      })}
    </box>
  );
}
