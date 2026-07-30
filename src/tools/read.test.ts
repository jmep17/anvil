import { describe, expect, test } from "bun:test";
import { DEFAULT_LINE_LIMIT, MAX_LINE_CHARS, renderFile } from "./read.ts";
import { toolOutputBudget } from "./types.ts";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

describe("renderFile", () => {
  test("numbers every line of a short file", () => {
    const { text, shown, total } = renderFile("alpha\nbeta\n");
    expect(text).toContain("     1|alpha");
    expect(text).toContain("     2|beta");
    expect(shown).toBe(2);
    expect(total).toBe(2);
    // Nothing was left out, so nothing is claimed to be.
    expect(text).not.toContain("showing lines");
  });

  test("a trailing newline is not counted as an extra line", () => {
    expect(renderFile("only\n").total).toBe(1);
    expect(renderFile("only").total).toBe(1);
  });

  test("caps an unbounded read instead of returning the whole file", () => {
    const { text, shown, total } = renderFile(lines(5_000));
    expect(shown).toBe(DEFAULT_LINE_LIMIT);
    expect(total).toBe(5_000);
    expect(text).toContain(`line ${DEFAULT_LINE_LIMIT}`);
    expect(text).not.toContain(`line ${DEFAULT_LINE_LIMIT + 1}`);
  });

  test("says what was omitted and how to continue", () => {
    const { text } = renderFile(lines(5_000));
    expect(text).toContain(`showing lines 1-${DEFAULT_LINE_LIMIT} of 5000`);
    expect(text).toContain(`offset=${DEFAULT_LINE_LIMIT + 1}`);
  });

  test("offset and limit select a window, numbered from the real position", () => {
    const { text, shown } = renderFile(lines(100), { offset: 10, limit: 3 });
    expect(shown).toBe(3);
    expect(text).toContain("    10|line 10");
    expect(text).toContain("    12|line 12");
    expect(text).not.toContain("|line 9");
    expect(text).not.toContain("|line 13");
  });

  test("the final window reports no remainder", () => {
    const { text } = renderFile(lines(10), { offset: 8 });
    expect(text).toContain("    10|line 10");
    expect(text).not.toContain("showing lines");
  });

  test("a minified line cannot consume the whole budget", () => {
    const huge = "x".repeat(50_000);
    const { text } = renderFile(`short\n${huge}\n`);
    expect(text.length).toBeLessThan(MAX_LINE_CHARS + 500);
    expect(text).toContain("(+48000 chars)");
  });

  test("an out-of-range offset explains itself rather than returning nothing", () => {
    const { text, shown } = renderFile(lines(5), { offset: 99 });
    expect(shown).toBe(0);
    expect(text).toContain("the file has 5 lines");
  });

  test("an empty file is reported as empty", () => {
    expect(renderFile("").text).toBe("(empty file)");
    expect(renderFile("").total).toBe(0);
  });

  test("an explicit limit is honoured above the default", () => {
    expect(renderFile(lines(4_000), { limit: 3_000 }).shown).toBe(3_000);
  });
});

describe("toolOutputBudget", () => {
  test("scales with the context window", () => {
    // A 16k window: one result may use ~4k tokens, not 12.5k.
    expect(toolOutputBudget(16_384)).toBe(16_384);
    expect(toolOutputBudget(65_536)).toBe(50_000);
  });

  test("never returns so little that a result is useless", () => {
    expect(toolOutputBudget(1_000)).toBe(8_000);
    expect(toolOutputBudget(0)).toBe(50_000);
    expect(toolOutputBudget(Number.NaN)).toBe(50_000);
  });

  test("stays within the absolute cap for very large windows", () => {
    expect(toolOutputBudget(1_000_000)).toBe(50_000);
  });

  test("one read cannot dominate a small window", () => {
    const budget = toolOutputBudget(16_384);
    // ~4 chars per token: a quarter of the window, not most of it.
    expect(budget / 4 / 16_384).toBeLessThanOrEqual(0.26);
  });
});
