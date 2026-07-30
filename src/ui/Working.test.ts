import { describe, expect, test } from "bun:test";
import { ACTIVITY_HINT_MS, workingLabel } from "./Working.tsx";

describe("the working indicator", () => {
  test("says what it is waiting on", () => {
    const label = workingLabel("✻", "Wrangling", 3_680_000, {
      activity: "waiting for the model",
      activityMs: 3_680_000,
    });
    expect(label).toContain("waiting for the model 61m 20s");
    expect(label).toContain("esc to interrupt");
  });

  test("leaves the duration off a phase that has only just started", () => {
    const label = workingLabel("✻", "Working", 2_000, {
      activity: "Read",
      activityMs: ACTIVITY_HINT_MS - 1,
    });
    expect(label).toContain("Read");
    expect(label).not.toMatch(/Read \d/);
  });

  test("still reads the same without an activity", () => {
    expect(workingLabel("✻", "Working", 12_000, { tokens: 1_400, queued: 2 })).toBe(
      "✻ Working… (12s · 1.4k tokens · 2 queued · esc to interrupt)",
    );
  });
});
