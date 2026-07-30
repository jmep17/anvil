import { describe, expect, test } from "bun:test";
import { configVisibleRange } from "./ConfigPanel.tsx";

describe("configVisibleRange", () => {
  test("shows every field when the panel has room", () => {
    const range = configVisibleRange(0, 12, 80);

    expect(range.start).toBe(0);
    expect(range.end).toBe(7);
  });

  test("keeps the selected field visible in a short terminal", () => {
    const range = configVisibleRange(6, 4, 80);

    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBe(7);
    expect(range.end - range.start).toBeGreaterThan(0);
  });

  test("prioritizes options over help text when space is scarce", () => {
    const range = configVisibleRange(0, 2, 12);

    expect(range.hintLines).toEqual([]);
    expect(range.end - range.start).toBe(1);
  });
});
