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

export interface DisplayExcerpt {
  lines: string[];
  hiddenLines: number;
}

/** Return complete terminal rows from the end of a growing response. */
export function tailDisplayLines(
  text: string,
  width: number,
  maxLines: number,
): DisplayExcerpt {
  const all = wrapDisplayLines(text, width);
  const take = Math.max(1, maxLines);
  const hiddenLines = Math.max(0, all.length - take);
  const lines = all.slice(-take);
  if (hiddenLines > 0 && lines.length > 0) {
    const marker = "… ";
    lines[0] = `${marker}${lines[0]!.slice(0, Math.max(0, width - marker.length))}`;
  }
  return { lines, hiddenLines };
}

/** Return complete terminal rows from the beginning of a completed response. */
export function headDisplayLines(
  text: string,
  width: number,
  maxLines: number,
): DisplayExcerpt {
  const all = wrapDisplayLines(text, width);
  const take = Math.max(1, maxLines);
  const hiddenLines = Math.max(0, all.length - take);
  const lines = all.slice(0, take);
  if (hiddenLines > 0 && lines.length > 0) {
    // Keep the indicator compact enough to fit even in a narrow terminal.
    const suffix = ` … +${hiddenLines}`;
    const last = lines.length - 1;
    const available = Math.max(0, width - suffix.length);
    lines[last] = `${lines[last]!.slice(0, available).trimEnd()}${suffix}`;
  }
  return { lines, hiddenLines };
}

export function formatToolDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
