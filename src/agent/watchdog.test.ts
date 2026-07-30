import { describe, expect, test } from "bun:test";
import type { TimeoutConfig } from "../config/types.ts";
import { StallDetector, formatStallDuration, stallMessage } from "./watchdog.ts";

const BUDGET: TimeoutConfig = { firstChunkMs: 1_000, chunkMs: 100, toolMs: 500 };

describe("StallDetector", () => {
  test("waits the generous first-token budget before giving up", () => {
    const stall = new StallDetector(BUDGET, 0);
    expect(stall.overdue(999)).toBeNull();
    expect(stall.overdue(1_001)).toBe(1_001);
  });

  test("holds the first-token budget through non-content chunks", () => {
    const stall = new StallDetector(BUDGET, 0);
    // A stream that has opened but produced nothing is still prompt-processing.
    stall.beat(50);
    expect(stall.overdue(1_000)).toBeNull();
    expect(stall.overdue(1_060)).toBe(1_010);
  });

  test("tightens to the between-token budget once tokens flow", () => {
    const stall = new StallDetector(BUDGET, 0);
    stall.beat(50, "chunk");
    expect(stall.overdue(140)).toBeNull();
    expect(stall.overdue(200)).toBe(150);
  });

  test("a running tool gets its own budget, then the model gets the first-token one back", () => {
    const stall = new StallDetector(BUDGET, 0);
    stall.beat(0, "tool");
    expect(stall.overdue(400)).toBeNull();
    expect(stall.overdue(600)).toBe(600);

    stall.beat(600, "first-chunk");
    expect(stall.overdue(1_500)).toBeNull();
  });

  test("every beat pushes the deadline out", () => {
    const stall = new StallDetector(BUDGET, 0);
    for (let at = 0; at <= 10_000; at += 90) {
      stall.beat(at, "chunk");
      expect(stall.overdue(at)).toBeNull();
    }
  });
});

describe("the message a stalled turn ends with", () => {
  test("names what it was waiting on and how long", () => {
    const message = stallMessage("first-chunk", 3_680_000);
    expect(message).toContain("waiting for the model to start responding");
    expect(message).toContain("61m 20s");
    // It has to say what to do next, not just that something went wrong.
    expect(message).toContain("timeouts");
  });

  test("reads as a duration at either scale", () => {
    expect(formatStallDuration(45_000)).toBe("45s");
    expect(formatStallDuration(120_000)).toBe("2m");
    expect(formatStallDuration(125_000)).toBe("2m 5s");
  });
});
