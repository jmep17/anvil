import { describe, expect, test } from "bun:test";
import { planProposalSchema, planRouteSchema } from "./plan.ts";

describe("plan harness schemas", () => {
  test("requires a complete structured proposal", () => {
    expect(
      planProposalSchema.safeParse({
        summary: "Short",
        changes: [],
        steps: [],
        verification: [],
      }).success,
    ).toBe(false);
    expect(
      planProposalSchema.safeParse({
        summary: "Add a reliable structured plan review workflow.",
        changes: [{ path: "src/agent/loop.ts", intent: "Force structured plan submission." }],
        steps: ["Add the plan harness."],
        verification: ["Run tests."],
        risks: [],
        assumptions: [],
      }).success,
    ).toBe(true);
  });

  test("requires either research details or one clarification", () => {
    expect(planRouteSchema.safeParse({ kind: "research", goal: "Research the feature" }).success).toBe(true);
    expect(
      planRouteSchema.safeParse({
        kind: "clarify",
        question: "Which runtime should this target?",
        reason: "The request does not identify its runtime.",
      }).success,
    ).toBe(true);
  });
});
