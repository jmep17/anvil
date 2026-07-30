import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { glob } from "glob";
import { loadIgnore } from "../fs/ignore.ts";

const CACHE_TTL_MS = 30_000;
const MAX_RESULTS = 12;

/** The user's home, preferring their environment over the passwd entry. */
function defaultHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/** Expand a leading `~` to the home directory. */
export function expandHome(path: string, home = defaultHome()): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

/**
 * True when a mention points outside the project — `~/…`, an absolute path, or
 * an explicit `./` or `../`. Those are browsed directly instead of being
 * matched against the project index.
 */
export function isExternalQuery(query: string): boolean {
  return /^(~($|\/)|\/|\.\.?\/)/.test(query);
}

/**
 * Directory listing for an external mention. Keeps the form the user typed —
 * a `~` stays a `~` — so the inserted mention is short and portable.
 * Directories come back with a trailing slash so browsing can continue.
 */
export async function listExternalMatches(
  query: string,
  limit = MAX_RESULTS,
  home = defaultHome(),
): Promise<string[]> {
  // A trailing slash means "inside this directory"; otherwise the last segment
  // is a partial name to filter on.
  const endsWithSlash = query.endsWith("/");
  const prefix = endsWithSlash ? query : query.slice(0, query.lastIndexOf("/") + 1);
  const partial = endsWithSlash ? "" : query.slice(query.lastIndexOf("/") + 1);
  const dir = resolve(expandHome(prefix || "/", home));

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    // Not a directory, or not readable — offer nothing rather than throwing.
    return [];
  }

  const lower = partial.toLowerCase();
  const out: string[] = [];
  for (const entry of entries) {
    // Hidden entries only surface once the user types the dot.
    if (entry.name.startsWith(".") && !partial.startsWith(".")) continue;
    if (lower && !entry.name.toLowerCase().startsWith(lower)) continue;
    out.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);
  }

  // Directories first so browsing deeper is the easy default.
  out.sort((a, b) => {
    const aDir = a.endsWith("/");
    const bDir = b.endsWith("/");
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.localeCompare(b);
  });
  return out.slice(0, limit);
}

interface CacheEntry {
  files: string[];
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** List project files under cwd, respecting gitignore-style ignores. */
export async function listProjectFiles(cwd: string, opts?: { force?: boolean }): Promise<string[]> {
  const now = Date.now();
  const hit = cache.get(cwd);
  if (!opts?.force && hit && now - hit.loadedAt < CACHE_TTL_MS) {
    return hit.files;
  }

  const ig = await loadIgnore(cwd);
  const matches = await glob("**/*", {
    cwd,
    nodir: true,
    dot: false,
    absolute: false,
  });
  const files = matches.filter((m) => !ig.ignores(m)).sort();
  cache.set(cwd, { files, loadedAt: now });
  return files;
}

export function clearFileIndexCache(cwd?: string): void {
  if (cwd) cache.delete(cwd);
  else cache.clear();
}

interface Scored {
  path: string;
  score: number;
}

/**
 * Case-insensitive fuzzy filter. Prefer basename prefix, then path prefix,
 * then substring matches. Cap at MAX_RESULTS.
 */
export function filterFiles(query: string, files: string[], limit = MAX_RESULTS): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return files.slice(0, limit);

  const scored: Scored[] = [];
  for (const path of files) {
    const lower = path.toLowerCase();
    const base = basename(path).toLowerCase();
    let score = -1;
    if (base.startsWith(q)) score = 300 - Math.min(base.length, 100);
    else if (lower.startsWith(q)) score = 200 - Math.min(lower.length, 100);
    else if (base.includes(q)) score = 100 - Math.min(base.indexOf(q), 50);
    else if (lower.includes(q)) score = 50 - Math.min(lower.indexOf(q), 40);
    else {
      // subsequence match: every query char appears in order
      let qi = 0;
      for (let i = 0; i < lower.length && qi < q.length; i++) {
        if (lower[i] === q[qi]) qi++;
      }
      if (qi === q.length) score = 10;
    }
    if (score >= 0) scored.push({ path, score });
  }

  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, limit).map((s) => s.path);
}
