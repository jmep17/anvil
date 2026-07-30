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

function countLines(text: string): number {
  const trimmed = text.replace(/\n+$/, "");
  return trimmed ? trimmed.split("\n").length : 0;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * One-line headline for a completed tool, in place of its raw output. Mirrors
 * the shape of each tool's own return value, falling back to a line count.
 */
export function summarizeToolResult(
  name: string,
  output: string | undefined,
  error?: boolean,
): string {
  if (output == null) return "";
  const text = output.trim();
  if (!text) return "(no output)";
  if (error) return text.split("\n")[0] ?? "failed";
  if (text.startsWith("Error:")) return text.split("\n")[0] ?? "failed";

  switch (name) {
    case "Read":
      return plural(countLines(text), "line");
    case "Glob":
      return text === "No files matched." ? "No files matched" : plural(countLines(text), "file");
    case "Grep":
      return text === "No matches found."
        ? "No matches"
        : plural(countLines(text), "match", "matches");
    case "Bash": {
      const code = /^exit_code: (-?\d+)$/m.exec(text)?.[1];
      const stdout = /stdout:\n([\s\S]*?)(?:\n\nstderr:|$)/.exec(text)?.[1] ?? "";
      const lines = countLines(stdout);
      const status = /^status: (.+)$/m.exec(text)?.[1];
      if (status) return status;
      return `exit ${code ?? "?"} · ${plural(lines, "line")}`;
    }
    case "Write":
    case "Edit":
      return text.split("\n")[0] ?? "";
    case "TodoWrite":
      return text.split("\n")[0] ?? "";
    default: {
      const lines = countLines(text);
      if (lines <= 1) return text.length > 96 ? `${text.slice(0, 95)}…` : text;
      return plural(lines, "line");
    }
  }
}

/**
 * Durations are only worth a column when they are long enough to have been
 * felt. Stamping "40ms" on every row is noise, so anything quick renders
 * blank.
 */
export const SLOW_TOOL_MS = 1_000;

export function formatToolDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms) || ms < SLOW_TOOL_MS) return "";
  return `${(ms / 1000).toFixed(1)}s`;
}
