import { tool } from "ai";
import { z } from "zod";
import type { PlanHarness, PlanProposal, PlanRoute } from "../agent/planHarness.ts";

const text = z.string().trim().min(8).max(800);

// Keep this schema deliberately flat. Some local OpenAI-compatible servers
// reject the `oneOf`/`const` schema emitted for a Zod discriminated union.
export const planRouteSchema = z.object({
  kind: z.enum(["research", "review", "clarify"]),
  goal: text.optional(),
  successCriteria: z.array(text).min(1).max(5).optional(),
  question: text.optional(),
  reason: text.optional(),
});

export const planProposalSchema = z.object({
  summary: text,
  changes: z.array(z.object({ path: z.string().trim().min(1).max(500), intent: text })).min(1).max(20),
  steps: z.array(text).min(1).max(20),
  verification: z.array(text).min(1).max(10),
  risks: z.array(text).max(10),
  assumptions: z.array(text).max(10),
});

export function createPlanHarnessTools(harness: PlanHarness) {
  return {
    PlanRoute: tool({
      description:
        "Required first step in plan mode. Choose review when the user asks you to review, audit, assess, explain or find problems in existing code — the deliverable is your findings, not a plan to go and look. Choose research when the user wants something changed and needs an implementation plan to approve. Choose clarify only when a decision-critical requirement is missing.",
      inputSchema: planRouteSchema,
      execute: async (input) => {
        let route: PlanRoute;
        if (input.kind === "research") {
          if (!input.goal || !input.successCriteria) {
            return "Error: research requires goal and successCriteria.";
          }
          route = { kind: "research", goal: input.goal, successCriteria: input.successCriteria };
        } else if (input.kind === "review") {
          if (!input.goal) {
            return "Error: review requires goal (what you are assessing).";
          }
          route = { kind: "review", goal: input.goal };
        } else {
          if (!input.question || !input.reason) {
            return "Error: clarify requires question and reason.";
          }
          route = {
            kind: "clarify",
            clarification: { question: input.question, reason: input.reason },
          };
        }
        harness.setRoute(route);
        if (input.kind === "review") {
          return (
            "Review route accepted. Investigate the code with Read, Grep and Glob, then answer " +
            "with your findings directly. Do not call SubmitPlan — a review is not an " +
            "implementation plan. Recommend changes as part of the findings; the user will ask " +
            "for a plan if they want one."
          );
        }
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
