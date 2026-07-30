import { resolve } from "node:path";
import { MAX_TOOL_OUTPUT, truncate } from "../tools/types.ts";
import { expandHome } from "./fileIndex.ts";

export interface ActiveMention {
  /** Index of the `@` in value. */
  start: number;
  /** Text after `@` up to cursor (no whitespace). */
  query: string;
  /** End index of the mention token (exclusive); usually the cursor. */
  end: number;
}

/**
 * Detect an active `@…` token ending at (or containing) the cursor.
 * Paths are whitespace-delimited.
 */
export function activeMention(value: string, cursor: number): ActiveMention | null {
  const c = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, c);
  const match = before.match(/(^|[\s])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = before.length - query.length - 1;
  // Mentions stay active while the cursor is inside the token (including just after @).
  const after = value.slice(c);
  const rest = after.match(/^[^\s]*/)?.[0] ?? "";
  return { start, query: query + rest, end: c + rest.length };
}

/** When typing, query is only the part before the cursor (for filtering). */
export function activeMentionQuery(value: string, cursor: number): ActiveMention | null {
  const c = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, c);
  const match = before.match(/(^|[\s])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = before.length - query.length - 1;
  return { start, query, end: c };
}

const MENTION_RE = /@([^\s@]+)/g;

export function findMentions(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    const path = m[1]!;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export interface ExpandedMentions {
  displayText: string;
  modelText: string;
}

/**
 * Expand `@path` mentions into inline file bodies for the model.
 * Timeline/display keeps the original short text.
 */
export async function expandFileMentions(
  text: string,
  cwd: string,
  opts?: { maxChars?: number },
): Promise<ExpandedMentions> {
  const displayText = text;
  const paths = findMentions(text);
  if (paths.length === 0) return { displayText, modelText: text };

  const maxChars = opts?.maxChars ?? MAX_TOOL_OUTPUT;
  const blocks: string[] = [];

  for (const rel of paths) {
    // `~` and absolute paths reference files outside the project; anything
    // else stays relative to it.
    const abs = resolve(cwd, expandHome(rel));
    try {
      const file = Bun.file(abs);
      if (!(await file.exists())) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      if (looksBinary(buf)) {
        blocks.push(`<file path="${rel}">\n(binary file omitted)\n</file>`);
        continue;
      }
      const content = truncate(new TextDecoder().decode(buf), maxChars);
      blocks.push(`<file path="${rel}">\n${content}\n</file>`);
    } catch {
      blocks.push(`<file path="${rel}">\n(unreadable)\n</file>`);
    }
  }

  if (blocks.length === 0) return { displayText, modelText: text };

  const modelText = `${text}\n\nReferenced files:\n\n${blocks.join("\n\n")}`;
  return { displayText, modelText };
}

/** Replace the active `@query` span with `@path ` (trailing space). */
export function applyMentionSelection(
  value: string,
  mention: ActiveMention,
  path: string,
): { value: string; cursor: number } {
  // A directory is a step on the way somewhere, so leave the cursor against it
  // rather than closing the mention with a space.
  const insertion = path.endsWith("/") ? `@${path}` : `@${path} `;
  const next = value.slice(0, mention.start) + insertion + value.slice(mention.end);
  return { value: next, cursor: mention.start + insertion.length };
}
