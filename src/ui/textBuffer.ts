export interface TextBuffer {
  value: string;
  cursor: number;
  /** Preferred column for vertical moves (null = use current). */
  preferredCol?: number | null;
}

export function createBuffer(value = "", cursor?: number): TextBuffer {
  const c = cursor ?? value.length;
  return { value, cursor: clamp(c, 0, value.length), preferredCol: null };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function lineInfo(buf: TextBuffer): {
  lineStart: number;
  lineEnd: number;
  col: number;
  lineIndex: number;
} {
  const { value, cursor } = buf;
  let lineStart = 0;
  let lineIndex = 0;
  for (let i = 0; i < cursor; i++) {
    if (value[i] === "\n") {
      lineStart = i + 1;
      lineIndex++;
    }
  }
  let lineEnd = value.indexOf("\n", cursor);
  if (lineEnd < 0) lineEnd = value.length;
  return { lineStart, lineEnd, col: cursor - lineStart, lineIndex };
}

export function insert(buf: TextBuffer, text: string): TextBuffer {
  const value = buf.value.slice(0, buf.cursor) + text + buf.value.slice(buf.cursor);
  return {
    value,
    cursor: buf.cursor + text.length,
    preferredCol: null,
  };
}

export function backspace(buf: TextBuffer): TextBuffer {
  if (buf.cursor <= 0) return buf;
  const value = buf.value.slice(0, buf.cursor - 1) + buf.value.slice(buf.cursor);
  return { value, cursor: buf.cursor - 1, preferredCol: null };
}

export function del(buf: TextBuffer): TextBuffer {
  if (buf.cursor >= buf.value.length) return buf;
  const value = buf.value.slice(0, buf.cursor) + buf.value.slice(buf.cursor + 1);
  return { value, cursor: buf.cursor, preferredCol: null };
}

export function moveLeft(buf: TextBuffer): TextBuffer {
  return {
    ...buf,
    cursor: clamp(buf.cursor - 1, 0, buf.value.length),
    preferredCol: null,
  };
}

export function moveRight(buf: TextBuffer): TextBuffer {
  return {
    ...buf,
    cursor: clamp(buf.cursor + 1, 0, buf.value.length),
    preferredCol: null,
  };
}

export function lineHome(buf: TextBuffer): TextBuffer {
  const { lineStart } = lineInfo(buf);
  return { ...buf, cursor: lineStart, preferredCol: null };
}

export function lineEnd(buf: TextBuffer): TextBuffer {
  const { lineEnd } = lineInfo(buf);
  return { ...buf, cursor: lineEnd, preferredCol: null };
}

export function moveHome(buf: TextBuffer): TextBuffer {
  return { ...buf, cursor: 0, preferredCol: null };
}

export function moveEnd(buf: TextBuffer): TextBuffer {
  return { ...buf, cursor: buf.value.length, preferredCol: null };
}

function moveToLine(buf: TextBuffer, targetLine: number, preferredCol: number): TextBuffer {
  const lines = buf.value.split("\n");
  if (targetLine < 0 || targetLine >= lines.length) return buf;
  let offset = 0;
  for (let i = 0; i < targetLine; i++) {
    offset += lines[i]!.length + 1;
  }
  const lineLen = lines[targetLine]!.length;
  const col = clamp(preferredCol, 0, lineLen);
  return { value: buf.value, cursor: offset + col, preferredCol };
}

export function moveUp(buf: TextBuffer): TextBuffer {
  const info = lineInfo(buf);
  if (info.lineIndex === 0) return lineHome(buf);
  const preferred = buf.preferredCol ?? info.col;
  return moveToLine(buf, info.lineIndex - 1, preferred);
}

export function moveDown(buf: TextBuffer): TextBuffer {
  const info = lineInfo(buf);
  const lines = buf.value.split("\n");
  if (info.lineIndex >= lines.length - 1) return lineEnd(buf);
  const preferred = buf.preferredCol ?? info.col;
  return moveToLine(buf, info.lineIndex + 1, preferred);
}

export function deleteWordBackward(buf: TextBuffer): TextBuffer {
  if (buf.cursor <= 0) return buf;
  let i = buf.cursor;
  while (i > 0 && /\s/.test(buf.value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(buf.value[i - 1]!)) i--;
  const value = buf.value.slice(0, i) + buf.value.slice(buf.cursor);
  return { value, cursor: i, preferredCol: null };
}

export function clearLine(buf: TextBuffer): TextBuffer {
  const { lineStart, lineEnd } = lineInfo(buf);
  if (lineStart === 0 && lineEnd === buf.value.length) {
    return createBuffer("");
  }
  // Remove the line including a following newline if present
  let end = lineEnd;
  if (buf.value[end] === "\n") end += 1;
  else if (lineStart > 0 && buf.value[lineStart - 1] === "\n") {
    // remove preceding newline instead when last line
    const value = buf.value.slice(0, lineStart - 1) + buf.value.slice(lineEnd);
    return { value, cursor: lineStart - 1, preferredCol: null };
  }
  const value = buf.value.slice(0, lineStart) + buf.value.slice(end);
  return { value, cursor: lineStart, preferredCol: null };
}

export function deleteLine(buf: TextBuffer): TextBuffer {
  return clearLine(buf);
}

export function wordForward(buf: TextBuffer): TextBuffer {
  let i = buf.cursor;
  const n = buf.value.length;
  while (i < n && !/\s/.test(buf.value[i]!)) i++;
  while (i < n && /\s/.test(buf.value[i]!)) i++;
  return { ...buf, cursor: i, preferredCol: null };
}

export function wordBackward(buf: TextBuffer): TextBuffer {
  let i = buf.cursor;
  while (i > 0 && /\s/.test(buf.value[i - 1]!)) i--;
  while (i > 0 && !/\s/.test(buf.value[i - 1]!)) i--;
  return { ...buf, cursor: i, preferredCol: null };
}

export function openLineBelow(buf: TextBuffer): TextBuffer {
  const atEnd = lineEnd(buf);
  return insert(atEnd, "\n");
}

export function openLineAbove(buf: TextBuffer): TextBuffer {
  const atHome = lineHome(buf);
  const next = insert(atHome, "\n");
  return { ...next, cursor: atHome.cursor };
}

/** Normalize paste: strip one trailing newline if the paste is otherwise single-line. */
export function normalizePaste(text: string): string {
  if (!text.includes("\n")) return text;
  if (text.endsWith("\n") && !text.slice(0, -1).includes("\n")) {
    return text.slice(0, -1);
  }
  return text;
}
