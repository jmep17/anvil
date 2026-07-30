import React from "react";
import { Box, Text } from "ink";
import { wrapDisplayLines } from "./format.ts";
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

export function InputBox({
  value,
  cursor,
  busy,
  pending,
  vimMode,
  editorMode,
  pasteHint,
  columns,
}: {
  value: string;
  cursor: number;
  busy: boolean;
  pending?: { toolName: string; detail: string; preview?: string } | null;
  vimMode?: VimMode;
  editorMode?: "emacs" | "vim";
  pasteHint?: string | null;
  columns: number;
}) {
  if (pending) {
    const width = Math.max(12, columns - 4);
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column" flexShrink={0}>
        {wrapDisplayLines(`Permission required · ${pending.toolName}`, width).map((line, index) => (
          <Text key={`title-${index}`} bold color="yellow">{line}</Text>
        ))}
        {wrapDisplayLines(pending.detail, width).map((line, index) => (
          <Text key={`detail-${index}`} dimColor>{line}</Text>
        ))}
        {pending.preview ? wrapDisplayLines(pending.preview, width).map((line, index) => (
          <Text key={`preview-${index}`} color="cyan">{line}</Text>
        )) : null}
        {wrapDisplayLines("[a] allow once · [A] same action this session · [d] deny", width).map((line, index) => (
          <Text key={`actions-${index}`} dimColor>{line}</Text>
        ))}
      </Box>
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
    <Box flexDirection="column" borderStyle="round" borderColor={busy ? "yellow" : "cyan"} paddingX={1} flexShrink={0}>
      <Text bold color={busy ? "yellow" : "cyan"}>PROMPT{busy ? " · AGENT WORKING" : ""}</Text>
      {editorMode === "vim" ? <Text dimColor>{vimMode === "normal" ? "-- NORMAL --" : "-- INSERT --"}</Text> : null}
      {pasteHint ? <Text color="cyan">{pasteHint}</Text> : null}
      {lines.flatMap((line, lineIndex) => {
        const chunks = softWrap(line, width);
        return chunks.map((chunk, chunkIndex) => {
          const start = chunkIndex * width;
          const active = !busy && lineIndex === cursorLine && cursorCol >= start && cursorCol <= start + chunk.length;
          const localCursor = Math.max(0, Math.min(chunk.length, cursorCol - start));
          const prefix = lineIndex === 0 && chunkIndex === 0 ? "› " : "· ";
          if (!active) {
            return <Box key={`${lineIndex}-${chunkIndex}`}><Text color="green">{prefix}</Text><Text>{chunk || " "}</Text></Box>;
          }
          const before = chunk.slice(0, localCursor);
          const at = chunk.slice(localCursor, localCursor + 1) || " ";
          const after = chunk.slice(localCursor + 1);
          return (
            <Box key={`${lineIndex}-${chunkIndex}`}>
              <Text color="green">{prefix}</Text><Text>{before}</Text><Text inverse>{at}</Text><Text>{after}</Text>
            </Box>
          );
        });
      })}
    </Box>
  );
}
