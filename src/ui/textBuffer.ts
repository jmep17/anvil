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

/**
 * A vim register. `linewise` is not decoration: it decides whether a put opens
 * a new line or splices into the current one, and getting it wrong is the
 * difference between `p` behaving like vim and behaving like a paste.
 */
export interface Register {
  text: string;
  linewise: boolean;
}

/** The current line with its trailing newline — what `yy` and `dd` take. */
export function lineAt(buf: TextBuffer): string {
  const { lineStart, lineEnd } = lineInfo(buf);
  return `${buf.value.slice(lineStart, lineEnd)}\n`;
}

/** The character under the cursor — what `x` takes. Empty at end of buffer. */
export function charAt(buf: TextBuffer): string {
  return buf.value[buf.cursor] ?? "";
}

/** Split a register's text into whole lines, dropping the trailing empty. */
function registerLines(register: Register): string {
  return register.text.endsWith("\n") ? register.text : `${register.text}\n`;
}

/** `p` — linewise opens a line below, charwise inserts after the cursor. */
export function putAfter(buf: TextBuffer, register: Register | null): TextBuffer {
  if (!register?.text) return buf;
  if (!register.linewise) {
    // vim puts after the character the cursor sits on; at end of line there is
    // no such character, so it lands where the cursor already is.
    const at = Math.min(buf.value.length, buf.cursor + (charAt(buf) ? 1 : 0));
    const value = buf.value.slice(0, at) + register.text + buf.value.slice(at);
    return { value, cursor: at + register.text.length - 1, preferredCol: null };
  }
  const { lineEnd } = lineInfo(buf);
  const text = registerLines(register);
  // Splice in after this line's newline, adding one if the buffer lacks it.
  const hasNewline = buf.value[lineEnd] === "\n";
  const at = hasNewline ? lineEnd + 1 : lineEnd;
  const inserted = hasNewline ? text : `\n${text.replace(/\n$/, "")}`;
  const value = buf.value.slice(0, at) + inserted + buf.value.slice(at);
  return {
    value,
    cursor: at + (hasNewline ? 0 : 1),
    preferredCol: null,
  };
}

/** `P` — linewise opens a line above, charwise inserts at the cursor. */
export function putBefore(buf: TextBuffer, register: Register | null): TextBuffer {
  if (!register?.text) return buf;
  if (!register.linewise) {
    const value =
      buf.value.slice(0, buf.cursor) + register.text + buf.value.slice(buf.cursor);
    return {
      value,
      cursor: buf.cursor + register.text.length - 1,
      preferredCol: null,
    };
  }
  const { lineStart } = lineInfo(buf);
  const value =
    buf.value.slice(0, lineStart) + registerLines(register) + buf.value.slice(lineStart);
  return { value, cursor: lineStart, preferredCol: null };
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

/**
 * Tidy a paste for a prompt: drop leading blank lines, and one trailing newline
 * if the paste is otherwise single-line.
 *
 * The leading newlines matter more than they look. Selecting whole lines in an
 * editor usually starts the selection at the end of the line above, so the
 * clipboard begins with `\n`. Pasted into the prompt that pushes the entire
 * block down a row, and every row below the first carries the continuation
 * gutter — which reads as the pasted text having been indented.
 */
export function normalizePaste(text: string): string {
  const body = text.replace(/^\n+/, "");
  if (!body.includes("\n")) return body;
  if (body.endsWith("\n") && !body.slice(0, -1).includes("\n")) {
    return body.slice(0, -1);
  }
  return body;
}
