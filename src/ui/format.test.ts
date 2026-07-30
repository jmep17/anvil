import { describe, expect, test } from "bun:test";
import {
  formatToolDuration,
  headDisplayLines,
  summarizeToolInput,
  tailDisplayLines,
  truncateDisplay,
  wrapDisplayLines,
} from "./format.ts";

describe("truncateDisplay", () => {
  test("returns short strings unchanged", () => {
    expect(truncateDisplay("hello", 10)).toBe("hello");
  });

  test("collapses whitespace and truncates", () => {
    expect(truncateDisplay("a\n\nb   c", 4)).toBe("a b…");
  });
});

describe("summarizeToolInput", () => {
  test("prefers path", () => {
    expect(summarizeToolInput({ path: "src/ui/App.tsx", offset: 1 })).toBe(
      "src/ui/App.tsx",
    );
  });

  test("prefers command", () => {
    expect(summarizeToolInput({ command: "ls -la" })).toBe("ls -la");
  });

  test("string input", () => {
    expect(summarizeToolInput("plain")).toBe("plain");
  });

  test("falls back to JSON", () => {
    expect(summarizeToolInput({ foo: 1 })).toBe('{"foo":1}');
  });

  test("respects max", () => {
    expect(summarizeToolInput({ path: "abcdefghijklmnopqrstuvwxyz" }, 8)).toBe(
      "abcdefg…",
    );
  });
});

describe("formatToolDuration", () => {
  test("empty for missing", () => {
    expect(formatToolDuration()).toBe("");
    expect(formatToolDuration(undefined)).toBe("");
  });

  test("ms under a second", () => {
    expect(formatToolDuration(42)).toBe("42ms");
  });

  test("seconds", () => {
    expect(formatToolDuration(1500)).toBe("1.5s");
  });
});

describe("terminal display excerpts", () => {
  test("wraps at word boundaries before splitting words", () => {
    expect(wrapDisplayLines("one two three", 7)).toEqual(["one two", "three"]);
  });

  test("tail excerpts keep complete, recent display rows", () => {
    expect(tailDisplayLines("one two three four", 7, 2)).toEqual({
      lines: ["… three", "four"],
      hiddenLines: 1,
    });
  });

  test("completed excerpts say when additional rows are hidden", () => {
    expect(headDisplayLines("one two three four", 12, 1)).toEqual({
      lines: ["one two … +1"],
      hiddenLines: 1,
    });
  });
});
