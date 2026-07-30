import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import {
  HISTORY_VISIBLE,
  HistoryPicker,
  historyLabel,
  historyPickerRows,
  historyWindow,
} from "./HistoryPicker.tsx";

/**
 * Keyboard interaction is not covered here for the same reason as
 * `SessionPicker.render.test.tsx`: mock key events do not reach `useKeyboard`
 * under the OpenTUI test renderer. What is covered is what the picker draws
 * and the height it claims for it.
 */

const COLUMNS = 80;

async function frameFor(entries: string[], selected: number): Promise<string> {
  const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(
    <HistoryPicker entries={entries} selected={selected} columns={COLUMNS} />,
    { width: COLUMNS, height: 20 },
  );
  try {
    await waitForVisualIdle();
    return captureCharFrame();
  } finally {
    renderer.destroy();
  }
}

function contentRows(frame: string): number {
  return frame.split("\n").filter((line) => line.trim().length > 0).length;
}

describe("history picker", () => {
  test("marks the selected prompt", async () => {
    const frame = await frameFor(["older prompt", "newest prompt"], 1);
    const rows = frame.split("\n");
    expect(rows.find((r) => r.includes("newest prompt"))).toContain("›");
    expect(rows.find((r) => r.includes("older prompt"))).not.toContain("›");
  });

  test("reports an empty state rather than an empty box", async () => {
    const frame = await frameFor([], 0);
    expect(frame).toContain("No earlier prompts");
  });

  test("counts the whole history in the title, not just what fits", async () => {
    const entries = Array.from({ length: 25 }, (_, i) => `prompt ${i}`);
    expect(await frameFor(entries, 24)).toContain("(25)");
  });

  test("draws exactly the rows it reserves", async () => {
    for (const count of [0, 1, 3, HISTORY_VISIBLE, HISTORY_VISIBLE + 12]) {
      const entries = Array.from({ length: count }, (_, i) => `prompt ${i}`);
      const frame = await frameFor(entries, Math.max(0, count - 1));
      expect(contentRows(frame)).toBe(historyPickerRows(count));
    }
  });

  test("scrolls to keep the selection visible in a long history", async () => {
    const entries = Array.from({ length: 40 }, (_, i) => `prompt ${i}`);
    const frame = await frameFor(entries, 39);
    expect(frame).toContain("prompt 39");
    expect(frame).not.toContain("prompt 0\n");
  });

  test("the window stays in bounds at either end", () => {
    const count = 40;
    for (const selected of [0, 1, 20, 38, 39]) {
      const { start, end } = historyWindow(count, selected);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(count);
      expect(end - start).toBe(HISTORY_VISIBLE);
      expect(selected).toBeGreaterThanOrEqual(start);
      expect(selected).toBeLessThan(end);
    }
  });

  test("a multi-line prompt still occupies one row", () => {
    expect(historyLabel("review this\nthen fix it")).toBe("review this ⏎ then fix it");
  });
});
