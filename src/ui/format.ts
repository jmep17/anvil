/** Render the complete tool payload for a transcript detail block. */
export function formatToolInput(input: unknown): string {
  if (input == null) return "(no input)";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2) ?? String(input);
  } catch {
    return String(input);
  }
}

const SUMMARY_KEYS = [
  "command",
  "path",
  "file_path",
  "filePath",
  "pattern",
  "query",
  "url",
  "content",
] as const;

/** One-line preview for a collapsed tool row. */
export function summarizeToolInput(input: unknown, maxLen = 72): string {
  const limit = Math.max(8, Math.floor(maxLen));
  const clip = (s: string) => {
    const one = s.replace(/\s+/g, " ").trim();
    if (one.length <= limit) return one;
    return `${one.slice(0, Math.max(1, limit - 1))}…`;
  };

  if (input == null) return "";
  if (typeof input === "string") return clip(input);
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of SUMMARY_KEYS) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return clip(value);
    }
    for (const value of Object.values(obj)) {
      if (typeof value === "string" && value.trim()) return clip(value);
    }
  }
  try {
    return clip(JSON.stringify(input) ?? "");
  } catch {
    return clip(String(input));
  }
}

/**
 * Wrap text ourselves instead of relying on Ink's implicit wrapping. That keeps
 * a changing streamed response from being clipped at an arbitrary character.
 * This deliberately preserves explicit newlines and as much indentation as
 * will fit on a terminal row.
 */
export function wrapDisplayLines(text: string, width: number): string[] {
  const limit = Math.max(1, Math.floor(width));
  const out: string[] = [];

  for (const source of text.replace(/\r/g, "").split("\n")) {
    let remaining = source.replace(/\t/g, "  ");
    if (remaining.length === 0) {
      out.push("");
      continue;
    }

    while (remaining.length > limit) {
      const candidate = remaining.slice(0, limit + 1);
      const breakAt = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\t"));
      if (breakAt > 0) {
        out.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
      } else {
        // Long paths and hashes have no sensible word boundary. Split only
        // those so a single token cannot corrupt the terminal layout.
        out.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
      }
    }
    out.push(remaining);
  }

  return out;
}

export function formatToolDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
