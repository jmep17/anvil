import { describe, expect, test } from "bun:test";
import { CONFIG_FIELD_COUNT, configVisibleRange } from "./ConfigPanel.tsx";

describe("configVisibleRange", () => {
  test("shows every field when the panel has room", () => {
    const range = configVisibleRange(0, CONFIG_FIELD_COUNT + 5, 80);

    expect(range.start).toBe(0);
    expect(range.end).toBe(CONFIG_FIELD_COUNT);
  });

  test("keeps the selected field visible in a short terminal", () => {
    const last = CONFIG_FIELD_COUNT - 1;
    const range = configVisibleRange(last, 4, 80);

    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBe(CONFIG_FIELD_COUNT);
    expect(range.end - range.start).toBeGreaterThan(0);
  });

  test("prioritizes options over help text when space is scarce", () => {
    const range = configVisibleRange(0, 2, 12);

    expect(range.hintLines).toEqual([]);
    expect(range.end - range.start).toBe(1);
  });
});
