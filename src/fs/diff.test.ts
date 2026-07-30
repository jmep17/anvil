import { describe, expect, test } from "bun:test";
import { summarizeDiff, unifiedDiff } from "./diff.ts";

describe("unifiedDiff", () => {
  test("identical input produces no diff", () => {
    expect(unifiedDiff("a.ts", "one\ntwo\n", "one\ntwo\n")).toBe("");
  });

  test("marks changed lines and keeps surrounding context", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const after = ["a", "b", "c", "d", "CHANGED", "f", "g", "h", "i"].join("\n");
    const diff = unifiedDiff("a.ts", before, after);

    expect(diff).toContain("--- a.ts");
    expect(diff).toContain("-e");
    expect(diff).toContain("+CHANGED");
    // Three lines of context on each side, and nothing beyond them.
    expect(diff).toContain(" b");
    expect(diff).toContain(" h");
    expect(diff).not.toContain("\n a");
    expect(diff).not.toContain("\n i");
  });

  test("hunk header counts each side", () => {
    const diff = unifiedDiff("a.ts", "one\ntwo\n", "one\ntwo\nthree\n");
    expect(diff).toContain("@@ -1,2 +1,3 @@");
  });

  test("pure insertion into an empty file is all additions", () => {
    const diff = unifiedDiff("new.ts", "", "hello\nworld\n");
    expect(diff).toContain("+hello");
    expect(diff).toContain("+world");
    expect(diff).not.toContain("\n-");
  });

  test("oversized input falls back to a summary rather than a full diff", () => {
    const big = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const diff = unifiedDiff("big.ts", big, `${big}\nextra`, { maxLines: 10 });
    expect(diff).toContain("file too large to diff");
    expect(diff).not.toContain("+extra");
  });

  test("a trailing newline is not counted as an extra line", () => {
    expect(unifiedDiff("a.ts", "one\n", "one")).toBe("");
  });
});

describe("summarizeDiff", () => {
  test("counts additions and removals without the file headers", () => {
    const diff = unifiedDiff("a.ts", "one\ntwo\n", "one\nTWO\nthree\n");
    expect(summarizeDiff(diff)).toBe("2 additions, 1 removal");
  });

  test("reports no changes for an empty diff", () => {
    expect(summarizeDiff("")).toBe("no changes");
  });
});
