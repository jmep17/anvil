import { describe, expect, test } from "bun:test";
import { PlanHarness } from "../agent/planHarness.ts";
import { createPlanHarnessTools, planProposalSchema, planRouteSchema } from "./plan.ts";

const execOpts = {
  toolCallId: "1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

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

  test("accepts the review route", () => {
    expect(
      planRouteSchema.safeParse({ kind: "review", goal: "Assess the agent loop for defects" })
        .success,
    ).toBe(true);
  });

  test("rejects a route kind it does not know", () => {
    expect(planRouteSchema.safeParse({ kind: "wander", goal: "somewhere" }).success).toBe(false);
  });
});

describe("PlanRoute tool", () => {
  test("a review route is recorded and asks for findings, not a plan", async () => {
    const harness = new PlanHarness();
    const tools = createPlanHarnessTools(harness);

    const out = String(
      await tools.PlanRoute.execute!(
        { kind: "review", goal: "Review the agent loop and suggest improvements" },
        execOpts,
      ),
    );

    expect(out).toContain("Do not call SubmitPlan");
    expect(harness.stage).toBe("reviewing");
    expect(harness.expectsPlan).toBe(false);
    // Nothing forces the model down a planning path.
    expect(harness.nextStep()).toBeUndefined();
  });

  test("a review without a goal is rejected", async () => {
    const harness = new PlanHarness();
    const tools = createPlanHarnessTools(harness);
    const out = String(await tools.PlanRoute.execute!({ kind: "review" }, execOpts));

    expect(out).toContain("Error");
    expect(harness.stage).toBe("routing");
  });

  test("a research route still gates on evidence", async () => {
    const harness = new PlanHarness();
    const tools = createPlanHarnessTools(harness);
    await tools.PlanRoute.execute!(
      { kind: "research", goal: "Add a feature", successCriteria: ["It works"] },
      execOpts,
    );

    expect(harness.expectsPlan).toBe(true);
    expect(harness.nextStep()?.stage).toBe("finding_evidence");
  });
});
