import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import type { AgentMode, EditorMode } from "../config/types.ts";
import { colors } from "./theme.ts";
import type { VimMode } from "./usePromptInput.ts";

export interface FooterState {
  busy: boolean;
  editorMode?: EditorMode;
  vimMode?: VimMode;
  showConfig?: boolean;
  browsingHistory?: boolean;
  filePicker?: boolean;
  commandPicker?: boolean;
  planReview?: "ready" | "denying";
  queued?: number;
}

export interface FooterStatus {
  mode: AgentMode;
  model: string;
  /** Fraction of the context window in use, 0–1. */
  contextUsed?: number;
  online?: boolean;
}

/**
 * A single short hint. The full key list lives in `/help` — a footer that wraps
 * onto a second line costs a transcript row on every frame.
 */
export function footerHint({
  busy,
  editorMode,
  vimMode,
  showConfig,
  browsingHistory,
  filePicker,
  commandPicker,
  planReview,
  queued,
}: FooterState): string {
  if (showConfig) return "↑↓ navigate · enter edit · esc close";
  if (planReview === "ready") return "[a] approve & implement · [d] decline with feedback";
  if (planReview === "denying") return "describe changes · enter revise · esc back";
  if (filePicker) return "↑↓ files · tab select · esc dismiss";
  if (commandPicker) return "↑↓ commands · tab complete · esc dismiss";
  if (busy) {
    const suffix = queued ? ` · ${queued} queued` : "";
    return `esc interrupt · ctrl+o expand output${suffix}`;
  }
  if (browsingHistory) return "pgup/pgdn scroll · pgdn returns to live output";
  if (editorMode === "vim" && vimMode === "normal") return "-- NORMAL -- · i insert · ? for shortcuts";
  return "? for shortcuts";
}

/** `build · qwen/qwen3.5-9b · 34% context` */
export function footerStatus({ mode, model, contextUsed, online }: FooterStatus): string {
  const parts = [mode, model];
  if (contextUsed != null && contextUsed > 0) {
    parts.push(`${Math.min(100, Math.round(contextUsed * 100))}% context`);
  }
  if (online === false) parts.push("offline");
  return parts.join(" · ");
}

export function footerHeight(): number {
  // A single row plus its top rule, always — nothing here wraps.
  return 2;
}

export const Footer = memo(function Footer({
  columns,
  status,
  ...state
}: FooterState & { columns: number; status: FooterStatus }) {
  const hint = footerHint(state);
  const right = footerStatus(status);
  // Drop the status segment rather than wrap when the terminal is too narrow.
  const room = columns - 4;
  const showRight = hint.length + right.length + 2 <= room;
  const contextWarning = (status.contextUsed ?? 0) >= 0.8;

  return (
    <box
      border={["top"]}
      borderColor={colors.borderMuted}
      paddingX={1}
      flexDirection="row"
      flexShrink={0}
      width="100%"
    >
      <text fg={colors.faint}>
        {hint}
      </text>
      <box flexGrow={1} />
      {showRight ? (
        <text
          fg={
            status.online === false
              ? colors.danger
              : contextWarning
                ? colors.warning
                : colors.faint
          }
        >
          {right}
        </text>
      ) : null}
    </box>
  );
});
