import { TextAttributes } from "@opentui/core";
import type { EditorMode } from "../config/types.ts";
import { wrapDisplayLines } from "./format.ts";
import { colors } from "./theme.ts";
import type { VimMode } from "./usePromptInput.ts";

export interface FooterState {
  busy: boolean;
  editorMode?: EditorMode;
  vimMode?: VimMode;
  showConfig?: boolean;
  browsingHistory?: boolean;
  filePicker?: boolean;
}

export function footerHint({
  busy,
  editorMode,
  vimMode,
  showConfig,
  browsingHistory,
  filePicker,
}: FooterState): string {
  if (showConfig) return "↑/↓ navigate · Enter edit · Esc close";
  if (busy) return "PgUp/PgDn transcript · click tool to expand · Esc interrupt";
  if (filePicker) return "↑/↓ files · Tab/Enter select · Esc dismiss · type to filter";
  if (browsingHistory) return "PgUp/PgDn transcript · PgDn returns live · Enter send · /config /exit";
  if (editorMode === "vim" && vimMode === "normal") {
    return "hjkl move · i insert · Enter send · Ctrl+G editor · /config";
  }
  return "Enter send · @ file · click tool to expand · PgUp/PgDn · Ctrl+J newline · Ctrl+G editor · Esc clear · /config /retry /exit";
}

export function footerHeight(state: FooterState, columns: number): number {
  // One top border row; horizontal padding and the hint marker use four columns.
  return 1 + wrapDisplayLines(footerHint(state), Math.max(12, columns - 4)).length;
}

export function Footer({ columns, ...state }: FooterState & { columns: number }) {
  return (
    <box
      border={["top"]}
      borderColor={colors.borderMuted}
      backgroundColor={colors.surfaceMuted}
      paddingX={1}
      flexDirection="column"
      flexShrink={0}
    >
      {wrapDisplayLines(footerHint(state), Math.max(12, columns - 4)).map((line, index) => (
        <text key={index} fg={colors.muted} attributes={TextAttributes.DIM}>
          {`⌁  ${line}`}
        </text>
      ))}
    </box>
  );
}
