import { basename } from "node:path";
import { glob } from "glob";
import { loadIgnore } from "../fs/ignore.ts";

const CACHE_TTL_MS = 30_000;
const MAX_RESULTS = 12;

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
