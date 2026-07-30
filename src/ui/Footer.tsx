import React from "react";
import { Box, Text } from "ink";
import type { EditorMode } from "../config/types.ts";
import type { VimMode } from "./usePromptInput.ts";

export function Footer({
  busy,
  editorMode,
  vimMode,
  showConfig,
}: {
  busy: boolean;
  editorMode?: EditorMode;
  vimMode?: VimMode;
  showConfig?: boolean;
}) {
  let hint: string;
  if (showConfig) {
    hint = "↑/↓ · Enter · Esc";
  } else if (busy) {
    hint = "Esc interrupt";
  } else if (editorMode === "vim" && vimMode === "normal") {
    hint = "hjkl move · i insert · Enter send · Ctrl+G editor · /config";
  } else {
    hint =
      "Enter send · arrows move · Ctrl+J newline · Ctrl+G editor · Esc clear · /config /exit";
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
