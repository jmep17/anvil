import { TextAttributes } from "@opentui/core";
import { summarizeDiff } from "../fs/diff.ts";
import { DiffView, diffHeight } from "./DiffView.tsx";
import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";
import type { VimMode } from "./usePromptInput.ts";

/** Choices offered for a pending tool approval, in display order. */
export const PERMISSION_CHOICES = ["allow", "always", "deny"] as const;
export type PermissionChoice = (typeof PERMISSION_CHOICES)[number];

export const PLAN_CHOICES = ["approve", "decline"] as const;
export type PlanChoice = (typeof PLAN_CHOICES)[number];

export interface PendingPermission {
  toolName: string;
  detail: string;
  preview?: string;
}

const MAX_PREVIEW_ROWS = 16;
/** Fewer rows than this and a diff conveys nothing; show a summary instead. */
const MIN_PREVIEW_ROWS = 4;

function softWrap(line: string, width: number): string[] {
  const text = line.replace(/\t/g, "  ");
  if (!text) return [""];
  const out: string[] = [];
  for (let start = 0; start < text.length; start += width) {
    out.push(text.slice(start, start + width));
  }
  return out;
}

/** Number of prompt body rows, after terminal wrapping. */
export function inputContentRows(value: string, columns: number): number {
  const width = Math.max(8, columns - 6);
  return Math.max(
    1,
    value.split("\n").reduce((total, line) => total + softWrap(line, width).length, 0),
  );
}

function permissionQuestion(toolName: string): string {
  switch (toolName) {
    case "Edit":
      return "Do you want to make this edit?";
    case "Write":
      return "Do you want to create this file?";
    case "Bash":
      return "Do you want to run this command?";
    default:
      return `Do you want to allow ${toolName}?`;
  }
}

function permissionOptions(toolName: string): string[] {
  const scope =
    toolName === "Bash" ? "for commands like this" : "for this file";
  return [
    "Yes",
    `Yes, and don't ask again ${scope} this session`,
    "No, and tell Anvil what to do differently (esc)",
  ];
}

export interface PermissionLayout {
  /** Rows the diff may occupy; 0 when it must collapse to a summary. */
  previewRows: number;
  /** True when the diff was cut and needs its "… N more lines" row. */
  truncated: boolean;
  /** Total content rows, excluding the box border. */
  contentRows: number;
}

/**
 * Fit the prompt to the space available. The question and its options are the
 * only actionable part, so they are budgeted first and the diff takes what is
 * left — a long file used to push the options off the bottom of the screen.
 */
export function permissionLayout(
  pending: PendingPermission,
  columns: number,
  maxRows: number,
): PermissionLayout {
  const width = Math.max(12, columns - 4);
  const detailRows = wrapDisplayLines(pending.detail, width).length;
  const optionRows = permissionOptions(pending.toolName).length;
  // title + detail + question + options, plus the box border.
  const fixed = 1 + detailRows + 1 + optionRows;
  const budget = Math.max(0, maxRows - 2 - fixed);

  if (!pending.preview) return { previewRows: 0, truncated: false, contentRows: fixed };

  const wanted = Math.min(diffHeight(pending.preview, MAX_PREVIEW_ROWS), MAX_PREVIEW_ROWS);
  const total = pending.preview.split("\n").length;

  // Below a few rows a diff says nothing useful; a one-line summary does.
  if (budget < MIN_PREVIEW_ROWS) {
    return { previewRows: 0, truncated: false, contentRows: fixed + 1 };
  }
  if (wanted <= budget && wanted >= total) {
    return { previewRows: wanted, truncated: false, contentRows: fixed + wanted };
  }
  // Cut, so reserve the row that says how much was left out.
  const previewRows = Math.max(MIN_PREVIEW_ROWS - 1, Math.min(wanted, budget) - 1);
  return { previewRows, truncated: true, contentRows: fixed + previewRows + 1 };
}

export function permissionContentRows(
  pending: PendingPermission,
  columns: number,
  maxRows: number,
): number {
  return permissionLayout(pending, columns, maxRows).contentRows;
}

export function planReviewContentRows(
  phase: "ready" | "denying",
  value: string,
  columns: number,
): number {
  if (phase === "ready") return 1 + 1 + PLAN_CHOICES.length;
  return inputContentRows(value, columns) + 1;
}

function OptionList({
  options,
  selected,
  accent,
}: {
  options: string[];
  selected: number;
  accent: string;
}) {
  return (
    <>
      {options.map((option, index) => {
        const active = index === selected;
        return (
          <text
            key={index}
            fg={active ? accent : colors.muted}
            attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            {`${active ? "❯" : " "} ${index + 1}. ${option}`}
          </text>
        );
      })}
    </>
  );
}

export function InputBox({
  value,
  cursor,
  busy,
  pending,
  pendingChoice = 0,
  planReview,
  planChoice = 0,
  vimMode,
  editorMode,
  pasteHint,
  columns,
  maxRows = 24,
}: {
  value: string;
  cursor: number;
  busy: boolean;
  pending?: PendingPermission | null;
  pendingChoice?: number;
  planReview?: "ready" | "denying" | null;
  planChoice?: number;
  vimMode?: VimMode;
  editorMode?: "emacs" | "vim";
  pasteHint?: string | null;
  columns: number;
  /** Rows the prompt may occupy before it would push its options off screen. */
  maxRows?: number;
}) {
  if (pending) {
    const width = Math.max(12, columns - 4);
    const { previewRows, truncated } = permissionLayout(pending, columns, maxRows);
    const totalDiffRows = pending.preview ? pending.preview.split("\n").length : 0;
    const hidden = truncated ? Math.max(0, totalDiffRows - previewRows) : 0;

    return (
      <box
        border
        borderStyle="rounded"
        borderColor={colors.warning}
        paddingX={1}
        flexDirection="column"
        flexShrink={0}
      >
        <box flexDirection="row">
          <text fg={colors.warning} attributes={TextAttributes.BOLD}>
            {pending.toolName}
          </text>
          <text fg={colors.muted}>{`  ${pending.detail}`}</text>
        </box>
        {pending.preview && previewRows > 0 ? (
          <DiffView diff={pending.preview} path={pending.detail} maxHeight={previewRows} />
        ) : null}
        {pending.preview && previewRows === 0 ? (
          // Too little room for a diff, so state the shape of the change.
          <text fg={colors.muted}>{`  ${summarizeDiff(pending.preview)}`}</text>
        ) : null}
        {hidden > 0 ? (
          <text fg={colors.faint}>{`  … ${hidden} more diff line${hidden === 1 ? "" : "s"}`}</text>
        ) : null}
        <text fg={colors.text}>{wrapDisplayLines(permissionQuestion(pending.toolName), width)[0]}</text>
        <OptionList
          options={permissionOptions(pending.toolName)}
          selected={pendingChoice}
          accent={colors.warning}
        />
      </box>
    );
  }

  if (planReview === "ready") {
    return (
      <box
        border
        borderStyle="rounded"
        borderColor={colors.success}
        paddingX={1}
        flexDirection="column"
        flexShrink={0}
      >
        <text fg={colors.text}>Ready to implement this plan?</text>
        <OptionList
          options={["Yes, implement it", "No, let me give feedback"]}
          selected={planChoice}
          accent={colors.success}
        />
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

  const empty = value.length === 0;
  const borderColor =
    planReview === "denying" ? colors.success : busy ? colors.accentDim : colors.border;

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      paddingX={1}
      flexShrink={0}
    >
      {planReview === "denying" ? (
        <text fg={colors.muted}>
          What should change? Enter sends the feedback.
        </text>
      ) : null}
      {editorMode === "vim" && vimMode === "normal" ? (
        <text fg={colors.muted}>
          -- NORMAL --
        </text>
      ) : null}
      {pasteHint ? (
        <text fg={colors.accent}>
          {pasteHint}
        </text>
      ) : null}
      {lines.flatMap((line, lineIndex) => {
        const chunks = softWrap(line, width);
        return chunks.map((chunk, chunkIndex) => {
          const start = chunkIndex * width;
          const active =
            lineIndex === cursorLine && cursorCol >= start && cursorCol <= start + chunk.length;
          const localCursor = Math.max(0, Math.min(chunk.length, cursorCol - start));
          const prefix = lineIndex === 0 && chunkIndex === 0 ? "> " : "  ";

          if (empty && lineIndex === 0 && chunkIndex === 0) {
            return (
              <box key="placeholder" flexDirection="row">
                <text fg={colors.accent}>{prefix}</text>
                <text attributes={TextAttributes.INVERSE}>{" "}</text>
                <text fg={colors.faint}>
                  {busy ? "" : " Ask Anvil to build, explain or fix something"}
                </text>
              </box>
            );
          }
          if (!active) {
            return (
              <box key={`${lineIndex}-${chunkIndex}`} flexDirection="row">
                <text fg={colors.accent}>{prefix}</text>
                <text fg={colors.text}>{chunk || " "}</text>
              </box>
            );
          }
          const before = chunk.slice(0, localCursor);
          const at = chunk.slice(localCursor, localCursor + 1) || " ";
          const after = chunk.slice(localCursor + 1);
          return (
            <box key={`${lineIndex}-${chunkIndex}`} flexDirection="row">
              <text fg={colors.accent}>{prefix}</text>
              <text fg={colors.text}>{before}</text>
              <text attributes={TextAttributes.INVERSE}>{at}</text>
              <text fg={colors.text}>{after}</text>
            </box>
          );
        });
      })}
    </box>
  );
}
