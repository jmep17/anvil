import { describe, expect, test } from "bun:test";
import { nextStepInstructions } from "./discipline.ts";

describe("nextStepInstructions", () => {
  test("adds a decision checkpoint only after tool use", () => {
    expect(nextStepInstructions("base instructions", false)).toBeUndefined();
    const instructions = nextStepInstructions("base instructions", true);
    expect(instructions).toContain("base instructions");
    expect(instructions).toContain("Goal, Evidence, Decision, Next action");
  });
});
