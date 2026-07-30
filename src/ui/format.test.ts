import { describe, expect, test } from "bun:test";
import {
  formatToolDuration,
  formatToolInput,
  summarizeToolInput,
  wrapDisplayLines,
} from "./format.ts";

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
  test("formats missing, millisecond, and second durations", () => {
    expect(formatToolDuration()).toBe("");
    expect(formatToolDuration(42)).toBe("42ms");
    expect(formatToolDuration(1500)).toBe("1.5s");
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
