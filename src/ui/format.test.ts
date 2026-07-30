import { describe, expect, test } from "bun:test";
import {
  formatToolDuration,
  formatToolInput,
  summarizeToolInput,
  summarizeToolResult,
  SLOW_TOOL_MS,
  wrapDisplayLines,
} from "./format.ts";

describe("summarizeToolResult", () => {
  test("counts what a Read returned", () => {
    expect(summarizeToolResult("Read", "     1|one\n     2|two\n")).toBe("2 lines");
    expect(summarizeToolResult("Read", "     1|only\n")).toBe("1 line");
  });

  test("counts files and matches, and names the empty cases", () => {
    expect(summarizeToolResult("Glob", "a.ts\nb.ts\nc.ts")).toBe("3 files");
    expect(summarizeToolResult("Glob", "No files matched.")).toBe("No files matched");
    expect(summarizeToolResult("Grep", "a.ts:1:hit\nb.ts:4:hit")).toBe("2 matches");
    expect(summarizeToolResult("Grep", "No matches found.")).toBe("No matches");
  });

  test("reports a Bash exit code with its output size", () => {
    expect(summarizeToolResult("Bash", "exit_code: 0\n\nstdout:\nline\nline")).toBe(
      "exit 0 · 2 lines",
    );
  });

  test("surfaces a Bash timeout instead of a bare exit code", () => {
    const output = "status: timed out after 500ms and was killed\n\nexit_code: 143\n\nstdout: (empty)";
    expect(summarizeToolResult("Bash", output)).toBe("timed out after 500ms and was killed");
  });

  test("an error shows its first line rather than a count", () => {
    expect(summarizeToolResult("Read", "Error: file not found: /x\ntrace", true)).toBe(
      "Error: file not found: /x",
    );
    expect(summarizeToolResult("Edit", "Error: old_string not found in file")).toBe(
      "Error: old_string not found in file",
    );
  });

  test("unknown tools fall back to a line count, or the text when it is short", () => {
    expect(summarizeToolResult("Whatever", "one\ntwo\nthree")).toBe("3 lines");
    expect(summarizeToolResult("Whatever", "short answer")).toBe("short answer");
  });

  test("missing output renders nothing", () => {
    expect(summarizeToolResult("Read", undefined)).toBe("");
    expect(summarizeToolResult("Read", "   ")).toBe("(no output)");
  });
});

describe("formatToolInput", () => {
  test("prints complete structured input without summary truncation", () => {
    const path = `src/${"very-long-directory/".repeat(8)}component.tsx`;
    expect(formatToolInput({ path, offset: 1 })).toBe(
      `{\n  "path": "${path}",\n  "offset": 1\n}`,
    );
  });

  test("preserves string input exactly", () => {
    expect(formatToolInput("line one\nline two")).toBe("line one\nline two");
  });
});

describe("summarizeToolInput", () => {
  test("prefers command for bash-like payloads", () => {
    expect(summarizeToolInput({ command: "ls -la", timeout_ms: 1000 })).toBe("ls -la");
  });

  test("prefers path and truncates long values", () => {
    const path = `src/${"deep/".repeat(20)}file.ts`;
    const summary = summarizeToolInput({ path, offset: 1 }, 24);
    expect(summary.length).toBeLessThanOrEqual(24);
    expect(summary.endsWith("…")).toBe(true);
  });

  test("returns empty for nullish input", () => {
    expect(summarizeToolInput(null)).toBe("");
  });
});

describe("formatToolDuration", () => {
  test("shows a duration only once it was long enough to feel", () => {
    expect(formatToolDuration(1500)).toBe("1.5s");
    expect(formatToolDuration(12_000)).toBe("12.0s");
  });

  test("stays blank for anything quick, so rows are not stamped with noise", () => {
    expect(formatToolDuration()).toBe("");
    expect(formatToolDuration(42)).toBe("");
    expect(formatToolDuration(999)).toBe("");
    expect(formatToolDuration(SLOW_TOOL_MS - 1)).toBe("");
  });

  test("ignores a nonsense value rather than printing NaN", () => {
    expect(formatToolDuration(Number.NaN)).toBe("");
    expect(formatToolDuration(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("terminal display wrapping", () => {
  test("wraps at word boundaries before splitting words", () => {
    expect(wrapDisplayLines("one two three", 7)).toEqual(["one two", "three"]);
  });

  test("keeps every character of a long unbroken token visible across rows", () => {
    const token = "a".repeat(37);
    expect(wrapDisplayLines(token, 8).join("")).toBe(token);
  });

  test("preserves explicit blank lines", () => {
    expect(wrapDisplayLines("first\n\nlast", 20)).toEqual(["first", "", "last"]);
  });
});
