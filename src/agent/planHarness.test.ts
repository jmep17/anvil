import { describe, expect, test } from "bun:test";
import {
  formatReviewedPlan,
  PlanHarness,
  stripListMarker,
  type PlanProposal,
} from "./planHarness.ts";

const proposal: PlanProposal = {
  summary: "Add a validated plan submission flow for the local agent.",
  changes: [{ path: "src/agent/loop.ts", intent: "Drive planning through the structured harness." }],
  steps: ["Create the harness and force its tool stages."],
  verification: ["Run the agent and UI test suites."],
  risks: ["Older local models may return an invalid tool payload."],
  assumptions: ["The model server supports the existing tool-calling interface."],
};

/** Drive a research route up to the point where a plan may be submitted. */
function researchToComposing(harness: PlanHarness): void {
  harness.setRoute({
    kind: "research",
    goal: "Improve planning",
    successCriteria: ["Plans are structured"],
  });
  harness.recordEvidence("Grep", { pattern: "runAgent", path: "src" });
  harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
  harness.recordEvidence("Read", { path: "src/agent/system.ts" });
}

describe("PlanHarness research route", () => {
  test("requires route, search, reads, then structured submission", () => {
    const harness = new PlanHarness();
    expect(harness.nextStep()?.stage).toBe("routing");

    harness.setRoute({
      kind: "research",
      goal: "Improve planning",
      successCriteria: ["Plans are structured"],
    });
    expect(harness.nextStep()?.stage).toBe("finding_evidence");
    expect(harness.nextStep()?.activeTools).toEqual(["Grep", "Glob"]);

    harness.recordEvidence("Grep", { pattern: "runAgent", path: "src" });
    expect(harness.nextStep()?.stage).toBe("reading_evidence");

    // One file is not a basis for a plan; the harness keeps reading.
    harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
    expect(harness.nextStep()?.stage).toBe("reading_evidence");

    harness.recordEvidence("Read", { path: "src/agent/system.ts" });
    expect(harness.nextStep()?.stage).toBe("composing_plan");

    harness.submit(proposal);
    expect(harness.isComplete).toBe(true);
    expect(harness.reviewedPlan?.evidence).toHaveLength(3);
  });

  test("searching stays available while reading, so a lead can be followed", () => {
    const harness = new PlanHarness();
    harness.setRoute({
      kind: "research",
      goal: "Improve planning",
      successCriteria: ["Plans are structured"],
    });
    harness.recordEvidence("Grep", { pattern: "runAgent" });
    expect(harness.nextStep()?.activeTools).toEqual(["Read", "Grep", "Glob"]);
  });

  test("more investigation is allowed while composing, not cut off", () => {
    const harness = new PlanHarness();
    researchToComposing(harness);
    const step = harness.nextStep()!;
    expect(step.stage).toBe("composing_plan");
    expect(step.activeTools).toContain("SubmitPlan");
    // The old harness allowed SubmitPlan only, forcing a plan off one read.
    expect(step.activeTools).toContain("Read");
    expect(step.activeTools).toContain("Grep");
  });

  test("past the evidence budget it insists on a plan", () => {
    const harness = new PlanHarness();
    researchToComposing(harness);
    for (let i = 0; i < 20; i++) harness.recordEvidence("Read", { path: `src/file-${i}.ts` });

    const step = harness.nextStep()!;
    expect(step.activeTools).toEqual(["SubmitPlan"]);
    expect(step.instruction).toContain("SubmitPlan now");
  });

  test("a turn that owes a plan is flagged when none arrives", () => {
    const harness = new PlanHarness();
    researchToComposing(harness);
    expect(harness.expectsPlan).toBe(true);
    expect(harness.isComplete).toBe(false);
  });
});

describe("PlanHarness review route", () => {
  test("does not steer the model into producing a plan", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "review", goal: "Assess the agent loop for defects" });

    // No forced tool stages: the model investigates and answers.
    expect(harness.stage).toBe("reviewing");
    expect(harness.nextStep()).toBeUndefined();
    expect(harness.reviewedPlan).toBeUndefined();
  });

  test("finishing without a plan is success, not a harness failure", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "review", goal: "Assess the agent loop for defects" });
    expect(harness.expectsPlan).toBe(false);
    // isComplete stays false so the run is not stopped the moment it is routed.
    expect(harness.isComplete).toBe(false);
  });

  test("evidence is still recorded during a review", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "review", goal: "Assess the agent loop" });
    harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
    expect(harness.nextStep()).toBeUndefined();
  });
});

describe("PlanHarness clarify route", () => {
  test("stops on a clarification without opening review", () => {
    const harness = new PlanHarness();
    harness.setRoute({
      kind: "clarify",
      clarification: {
        question: "Which runtime should this target?",
        reason: "The request names no runtime.",
      },
    });
    expect(harness.isComplete).toBe(true);
    expect(harness.expectsPlan).toBe(false);
    expect(harness.nextStep()).toBeUndefined();
    expect(harness.reviewedPlan).toBeUndefined();
  });
});

describe("stripListMarker", () => {
  test("removes a marker the model added itself", () => {
    expect(stripListMarker("1. insert step here")).toBe("insert step here");
    expect(stripListMarker("2) do the thing")).toBe("do the thing");
    expect(stripListMarker("- a bullet")).toBe("a bullet");
    expect(stripListMarker("• a bullet")).toBe("a bullet");
    expect(stripListMarker("a) lettered")).toBe("lettered");
  });

  test("removes repeated markers", () => {
    expect(stripListMarker("1. 1. insert step here")).toBe("insert step here");
    expect(stripListMarker("- 1. mixed")).toBe("mixed");
  });

  test("leaves ordinary prose alone", () => {
    expect(stripListMarker("Run the suite")).toBe("Run the suite");
    // A decimal is not a list marker: no space after the dot.
    expect(stripListMarker("1.5x faster after the change")).toBe("1.5x faster after the change");
    expect(stripListMarker("v2. is not a marker")).toBe("v2. is not a marker");
  });

  test("never strips an item down to nothing", () => {
    expect(stripListMarker("1.")).toBe("1.");
    expect(stripListMarker("- ")).toBe("-");
  });
});

describe("formatReviewedPlan", () => {
  test("formats the proposal with its recorded evidence", () => {
    const harness = new PlanHarness();
    harness.setRoute({
      kind: "research",
      goal: "Improve planning",
      successCriteria: ["Plans are structured"],
    });
    harness.recordEvidence("Glob", { pattern: "src/**/*.ts" });
    harness.recordEvidence("Read", { path: "src/agent/loop.ts" });
    harness.submit(proposal);
    const text = formatReviewedPlan(harness.reviewedPlan!);
    expect(text).toContain("## Evidence consulted");
    expect(text).toContain("`Read` — `src/agent/loop.ts`");
    expect(text).toContain("## Verification");
  });

  test("does not double up numbering the model already wrote", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "research", goal: "g", successCriteria: ["c"] });
    harness.submit({
      ...proposal,
      steps: ["1. First the one thing", "2. Then the other thing"],
      verification: ["- Run the tests"],
      risks: ["1. Something might break"],
      assumptions: [],
    });

    const text = formatReviewedPlan(harness.reviewedPlan!);
    expect(text).toContain("1. First the one thing");
    expect(text).toContain("2. Then the other thing");
    expect(text).not.toContain("1. 1.");
    expect(text).not.toContain("2. 2.");
    expect(text).not.toContain("- - ");
    expect(text).toContain("- Run the tests");
    expect(text).toContain("- Something might break");
  });

  test("numbers steps in order regardless of what the model supplied", () => {
    const harness = new PlanHarness();
    harness.setRoute({ kind: "research", goal: "g", successCriteria: ["c"] });
    harness.submit({ ...proposal, steps: ["3. out of order", "1. first"] });

    const text = formatReviewedPlan(harness.reviewedPlan!);
    expect(text).toContain("1. out of order");
    expect(text).toContain("2. first");
  });
});
