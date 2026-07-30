import { tool } from "ai";
import { z } from "zod";
import type { PlanHarness, PlanProposal, PlanRoute } from "../agent/planHarness.ts";

const text = z.string().trim().min(8).max(800);

export const planRouteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("research"),
    goal: text,
    successCriteria: z.array(text).min(1).max(5),
  }),
  z.object({
    kind: z.literal("clarify"),
    question: text,
    reason: text,
  }),
]);

export const planProposalSchema = z.object({
  summary: text,
  changes: z.array(z.object({ path: z.string().trim().min(1).max(500), intent: text })).min(1).max(20),
  steps: z.array(text).min(1).max(20),
  verification: z.array(text).min(1).max(10),
  risks: z.array(text).max(10).default([]),
  assumptions: z.array(text).max(10).default([]),
});

export function createPlanHarnessTools(harness: PlanHarness) {
  return {
    PlanRoute: tool({
      description:
        "Required first step in plan mode. Choose research when the request has a concrete goal, or clarify only when a decision-critical requirement is missing.",
      inputSchema: planRouteSchema,
      execute: async (input) => {
        const route: PlanRoute =
          input.kind === "research"
            ? { kind: "research", goal: input.goal, successCriteria: input.successCriteria }
            : {
                kind: "clarify",
                clarification: { question: input.question, reason: input.reason },
              };
        harness.setRoute(route);
        return input.kind === "research" ? "Research route accepted." : "Clarification requested.";
      },
    }),
    SubmitPlan: tool({
      description:
        "Submit the complete, evidence-grounded implementation plan. Use only after the required repository search and file read have completed.",
      inputSchema: planProposalSchema,
      execute: async (input) => {
        harness.submit(input as PlanProposal);
        return "Structured plan submitted for review.";
      },
    }),
  };
}
