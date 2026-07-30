import { describe, expect, test } from "bun:test";
import { formatReviewedPlan, PlanHarness, type PlanProposal } from "./planHarness.ts";

const proposal: PlanProposal = {
  summary: "Add a validated plan submission flow for the local agent.",
  changes: [{ path: "src/agent/loop.ts", intent: "Drive planning through the structured harness." }],
  steps: ["Create the harness and force its tool stages."],
  verification: ["Run the agent and UI test suites."],
  risks: ["Older local models may return an invalid tool payload."],
  assumptions: ["The model server supports the existing tool-calling interface."],
};

describe("PlanHarness", () => {
  test("requires route, search, read, then structured submission", () => {
    const harness = new PlanHarness();
    expect(harness.nextStep()?.stage).toBe("routing");

    harness.setRoute({ kind: "research", goal: "Improve planning", successCriteria: ["Plans are structured"] });
    expect(harness.nextStep()?.stage).toBe("finding_evidence");

    harness.recordEvidence("Grep", { pattern: "runAgent", path: "src" });
    expect(harness.nextStep()?.stage).toBe("reading_evidence");

    harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
    expect(harness.nextStep()?.stage).toBe("composing_plan");
    expect(harness.nextStep()?.activeTools).toEqual(["SubmitPlan"]);

    harness.submit(proposal);
    expect(harness.isComplete).toBe(true);
    expect(harness.reviewedPlan?.evidence).toEqual([
      { tool: "Grep", target: "runAgent in src" },
      { tool: "Read", target: "src/agent/loop.ts" },
    ]);
  });

  test("stops on a clarification without opening review", () => {
    const harness = new PlanHarness();
    harness.setRoute({
      kind: "clarify",
      clarification: { question: "Which runtime should this target?", reason: "The request names no runtime." },
    });
    expect(harness.isComplete).toBe(true);
    expect(harness.nextStep()).toBeUndefined();
    expect(harness.reviewedPlan).toBeUndefined();
  });

  test("formats the proposal with its recorded evidence", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "research", goal: "Improve planning", successCriteria: ["Plans are structured"] });
    harness.recordEvidence("Glob", { pattern: "src/**/*.ts" });
    harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
    harness.submit(proposal);
    const text = formatReviewedPlan(harness.reviewedPlan!);
    expect(text).toContain("## Evidence consulted");
    expect(text).toContain("`Read` — `src/agent/loop.ts`");
    expect(text).toContain("## Verification");
  });
});
