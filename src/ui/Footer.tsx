import React from "react";
import { Box, Text } from "ink";
import type { EditorMode } from "../config/types.ts";
import type { VimMode } from "./usePromptInput.ts";

export function Footer({
  busy,
  editorMode,
  vimMode,
  showConfig,
  browsingHistory,
}: {
  busy: boolean;
  editorMode?: EditorMode;
  vimMode?: VimMode;
  showConfig?: boolean;
  browsingHistory?: boolean;
}) {
  let hint: string;
  if (showConfig) {
    hint = "↑/↓ · Enter · Esc";
  } else if (busy) {
    hint = "Esc interrupt";
  } else if (browsingHistory) {
    hint = "PgUp/PgDn transcript · PgDn returns live · Enter send · /config /exit";
  } else if (editorMode === "vim" && vimMode === "normal") {
    hint = "hjkl move · i insert · Enter send · Ctrl+G editor · /config";
  } else {
    hint =
      "Enter send · PgUp/PgDn transcript · Ctrl+J newline · Ctrl+G editor · Esc clear · /config /retry /exit";
  }

  return (
    <Box paddingX={1} flexShrink={0}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
