/** Summarize tool input for compact TUI / REPL display. */
export function summarizeToolInput(input: unknown, max = 80): string {
  if (input == null) return "";
  if (typeof input === "string") return truncateDisplay(input, max);

  if (typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    for (const key of ["path", "file_path", "command", "pattern", "query", "url", "name"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) {
        return truncateDisplay(v, max);
      }
    }
  }

  try {
    return truncateDisplay(JSON.stringify(input), max);
  } catch {
    return truncateDisplay(String(input), max);
  }
}

export function truncateDisplay(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1))}…`;
}

export function formatToolDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
