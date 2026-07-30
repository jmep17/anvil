/**
 * Dependency-free unified diff, sized for approval previews rather than for
 * patch application. Large inputs fall back to a summary line so a whole-file
 * rewrite cannot flood the terminal or the model's context.
 */

export interface UnifiedDiffOptions {
  /** Lines of unchanged context kept around each hunk. */
  context?: number;
  /** Above this line count on either side, return a summary instead. */
  maxLines?: number;
}

const DEFAULT_CONTEXT = 3;
const DEFAULT_MAX_LINES = 4_000;

type Op = { type: "equal" | "add" | "remove"; text: string };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  // A trailing newline yields an empty final element that is not a real line.
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Longest common subsequence over line indices. O(n·m) memory, which is why
 * callers are capped by `maxLines`.
 */
function diffLines(before: string[], after: string[]): Op[] {
  // Trim the common prefix and suffix first: edits are usually local, and this
  // keeps the quadratic table small even for long files.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }

  const midBefore = before.slice(start, before.length - end);
  const midAfter = after.slice(start, after.length - end);

  const rows = midBefore.length;
  const cols = midAfter.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i]![j]! =
        midBefore[i] === midAfter[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const ops: Op[] = [];
  for (const text of before.slice(0, start)) ops.push({ type: "equal", text });

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (midBefore[i] === midAfter[j]) {
      ops.push({ type: "equal", text: midBefore[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      ops.push({ type: "remove", text: midBefore[i]! });
      i += 1;
    } else {
      ops.push({ type: "add", text: midAfter[j]! });
      j += 1;
    }
  }
  while (i < rows) ops.push({ type: "remove", text: midBefore[i++]! });
  while (j < cols) ops.push({ type: "add", text: midAfter[j++]! });

  for (const text of before.slice(before.length - end)) ops.push({ type: "equal", text });
  return ops;
}

interface Hunk {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
  lines: string[];
}

function buildHunks(ops: Op[], context: number): Hunk[] {
  const changed = ops.map((op) => op.type !== "equal");
  const keep = new Array<boolean>(ops.length).fill(false);
  for (const [index, isChanged] of changed.entries()) {
    if (!isChanged) continue;
    for (let k = Math.max(0, index - context); k <= Math.min(ops.length - 1, index + context); k++) {
      keep[k] = true;
    }
  }

  const hunks: Hunk[] = [];
  let beforeLine = 1;
  let afterLine = 1;
  let current: Hunk | null = null;

  for (const [index, op] of ops.entries()) {
    if (keep[index]) {
      if (!current) {
        current = {
          beforeStart: beforeLine,
          beforeCount: 0,
          afterStart: afterLine,
          afterCount: 0,
          lines: [],
        };
      }
      const sign = op.type === "add" ? "+" : op.type === "remove" ? "-" : " ";
      current.lines.push(`${sign}${op.text}`);
      if (op.type !== "add") current.beforeCount += 1;
      if (op.type !== "remove") current.afterCount += 1;
    } else if (current) {
      hunks.push(current);
      current = null;
    }

    if (op.type !== "add") beforeLine += 1;
    if (op.type !== "remove") afterLine += 1;
  }
  if (current) hunks.push(current);
  return hunks;
}

/**
 * Render a unified diff. Returns an empty string when the two sides are equal
 * so callers can treat "no diff" as a falsy value.
 */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
  options: UnifiedDiffOptions = {},
): string {
  if (before === after) return "";

  const context = options.context ?? DEFAULT_CONTEXT;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  if (beforeLines.length > maxLines || afterLines.length > maxLines) {
    return [
      `--- ${path}`,
      `+++ ${path}`,
      `@@ file too large to diff (${beforeLines.length} → ${afterLines.length} lines) @@`,
    ].join("\n");
  }

  const hunks = buildHunks(diffLines(beforeLines, afterLines), context);
  if (hunks.length === 0) return "";

  const out = [`--- ${path}`, `+++ ${path}`];
  for (const hunk of hunks) {
    out.push(
      `@@ -${hunk.beforeStart},${hunk.beforeCount} +${hunk.afterStart},${hunk.afterCount} @@`,
      ...hunk.lines,
    );
  }
  return out.join("\n");
}

/** `3 additions, 1 removal` — a one-line headline for a collapsed row. */
export function summarizeDiff(diff: string): string {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  const parts: string[] = [];
  if (added) parts.push(`${added} addition${added === 1 ? "" : "s"}`);
  if (removed) parts.push(`${removed} removal${removed === 1 ? "" : "s"}`);
  return parts.join(", ") || "no changes";
}
