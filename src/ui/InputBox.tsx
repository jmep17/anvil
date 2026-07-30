import React from "react";
import { Box, Text } from "ink";
import type { VimMode } from "./usePromptInput.ts";

export function InputBox({
  value,
  cursor,
  busy,
  pending,
  vimMode,
  editorMode,
  pasteHint,
}: {
  value: string;
  cursor: number;
  busy: boolean;
  pending?: { toolName: string; detail: string } | null;
  vimMode?: VimMode;
  editorMode?: "emacs" | "vim";
  pasteHint?: string | null;
}) {
  if (pending) {
    return (
      <Box
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        flexDirection="column"
        flexShrink={0}
      >
        <Text color="yellow">
          Allow {pending.toolName}? {pending.detail.slice(0, 80)}
        </Text>
        <Text dimColor>[a] allow · [A] always · [d] deny</Text>
      </Box>
    );
  }

  const lines = value.length === 0 ? [""] : value.split("\n");
  // Map cursor to line/col
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
    remaining -= len + 1; // +1 for newline
    if (i === lines.length - 1) {
      cursorLine = i;
      cursorCol = len;
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexShrink={0}
    >
      {editorMode === "vim" ? (
        <Text dimColor>{vimMode === "normal" ? "-- NORMAL --" : "-- INSERT --"}</Text>
      ) : null}
      {pasteHint ? <Text color="cyan">{pasteHint}</Text> : null}
      {lines.map((line, i) => {
        const prefix =
          i === 0 ? <Text color="green">› </Text> : <Text>  </Text>;

        if (busy || i !== cursorLine) {
          return (
            <Box key={`l-${i}`}>
              {prefix}
              <Text>{line}</Text>
            </Box>
          );
        }

        const before = line.slice(0, cursorCol);
        const at = line.slice(cursorCol, cursorCol + 1) || " ";
        const after = line.slice(cursorCol + 1);
        return (
          <Box key={`l-${i}`}>
            {prefix}
            <Text>{before}</Text>
            <Text inverse>{at === "\t" ? " " : at}</Text>
            <Text>{after}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
