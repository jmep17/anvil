import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionDir } from "../session/store.ts";
import { MAX_HISTORY } from "./history.ts";

/**
 * Prompts the user has submitted in this project, so ↑ recall survives a
 * restart. Stored beside the project's sessions rather than globally: what you
 * typed in one repo is rarely what you want to recall in another.
 *
 * One JSON string per line — prompts are routinely multi-line, and a raw
 * newline-delimited file would split them into fragments on the way back in.
 */
export function promptHistoryPath(cwd: string): string {
  return join(sessionDir(cwd), "history");
}

function decodeEntry(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    // A hand-edited or half-written line is worth keeping as-is rather than
    // discarding the rest of the file with it.
    return trimmed;
  }
}

function encode(entries: string[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

/** Collapse consecutive repeats and keep only the newest `MAX_HISTORY`. */
function normalize(entries: string[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    const value = entry.trim();
    if (!value || out.at(-1) === value) continue;
    out.push(value);
  }
  return out.slice(-MAX_HISTORY);
}

/**
 * Previously submitted prompts, oldest first. A missing or unreadable file is
 * an empty history, never an error: recall is a convenience and must not be
 * able to stop the TUI starting.
 */
export async function loadPromptHistory(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(promptHistoryPath(cwd), "utf8");
    return normalize(raw.split("\n").map(decodeEntry).filter((v): v is string => v !== null));
  } catch {
    return [];
  }
}

/**
 * Record a submitted prompt and return the resulting history. The whole file is
 * rewritten rather than appended to, which is what keeps the cap honest — at
 * `MAX_HISTORY` short strings that costs nothing per prompt.
 */
export async function appendPromptHistory(cwd: string, text: string): Promise<string[]> {
  const value = text.trim();
  if (!value) return loadPromptHistory(cwd);
  const existing = await loadPromptHistory(cwd);
  if (existing.at(-1) === value) return existing;
  const next = normalize([...existing, value]);
  try {
    await mkdir(sessionDir(cwd), { recursive: true });
    await writeFile(promptHistoryPath(cwd), encode(next), "utf8");
  } catch {
    // Recall still works for the rest of this session even if the disk does not.
  }
  return next;
}
