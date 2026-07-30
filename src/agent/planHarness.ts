import type { ToolSet } from "ai";

export interface PlanClarification {
  question: string;
  reason: string;
}

/**
 * - `research` — the user wants something changed, so the deliverable is an
 *   implementation plan to approve.
 * - `review` — the user wants existing code assessed, explained or audited.
 *   The deliverable is the findings themselves; forcing a plan here answers
 *   "how I would review this" instead of doing the review.
 * - `clarify` — a decision-critical requirement is missing.
 */
export interface PlanRoute {
  kind: "research" | "review" | "clarify";
  goal?: string;
  successCriteria?: string[];
  clarification?: PlanClarification;
}

export interface PlanChange {
  path: string;
  intent: string;
}

export interface PlanProposal {
  summary: string;
  changes: PlanChange[];
  steps: string[];
  verification: string[];
  risks: string[];
  assumptions: string[];
}

export interface PlanEvidence {
  tool: "Glob" | "Grep" | "Read";
  target: string;
}

export interface ReviewedPlan {
  proposal: PlanProposal;
  evidence: PlanEvidence[];
}

export type PlanStage =
  | "routing"
  | "clarifying"
  | "reviewing"
  | "finding_evidence"
  | "reading_evidence"
  | "composing_plan"
  | "complete";

/** Searches required before the harness will let a plan be drafted. */
const MIN_SEARCHES = 1;
/** Files that must be read before drafting. One is not a basis for a plan. */
const MIN_READS = 2;
/**
 * Past this much evidence the harness stops offering more investigation and
 * insists on a plan, so a model that likes looking around cannot loop.
 */
const EVIDENCE_BUDGET = 14;

export interface PlanStepControl {
  stage: PlanStage;
  activeTools: string[];
  instruction: string;
}

function targetFor(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const values = input as Record<string, unknown>;
  if (toolName === "Read" && typeof values.path === "string") return values.path;
  if (toolName === "Glob" && typeof values.pattern === "string") return values.pattern;
  if (toolName === "Grep" && typeof values.pattern === "string") {
    return values.path ? `${values.pattern} in ${values.path}` : values.pattern;
  }
  return null;
}

export class PlanHarness {
  private routeValue: PlanRoute | null = null;
  private proposalValue: PlanProposal | null = null;
  private readonly evidenceValue: PlanEvidence[] = [];

  setRoute(route: PlanRoute): void {
    this.routeValue = route;
  }

  recordEvidence(toolName: string, input: unknown): void {
    if (toolName !== "Glob" && toolName !== "Grep" && toolName !== "Read") return;
    const target = targetFor(toolName, input);
    if (!target) return;
    if (!this.evidenceValue.some((item) => item.tool === toolName && item.target === target)) {
      this.evidenceValue.push({ tool: toolName, target });
    }
  }

  submit(proposal: PlanProposal): void {
    this.proposalValue = proposal;
  }

  get clarification(): PlanClarification | undefined {
    return this.routeValue?.kind === "clarify" ? this.routeValue.clarification : undefined;
  }

  get reviewedPlan(): ReviewedPlan | undefined {
    return this.proposalValue
      ? { proposal: this.proposalValue, evidence: [...this.evidenceValue] }
      : undefined;
  }

  get isComplete(): boolean {
    return Boolean(this.clarification || this.reviewedPlan);
  }

  /**
   * Whether this turn owes the user a structured plan. A review answers in
   * prose, so its turn ending without a SubmitPlan is success, not failure.
   */
  get expectsPlan(): boolean {
    return this.routeValue === null || this.routeValue.kind === "research";
  }

  private count(...tools: PlanEvidence["tool"][]): number {
    return this.evidenceValue.filter((item) => tools.includes(item.tool)).length;
  }

  get stage(): PlanStage {
    if (!this.routeValue) return "routing";
    if (this.clarification) return "clarifying";
    if (this.routeValue.kind === "review") return "reviewing";
    if (this.count("Glob", "Grep") < MIN_SEARCHES) return "finding_evidence";
    if (this.count("Read") < MIN_READS) return "reading_evidence";
    if (!this.proposalValue) return "composing_plan";
    return "complete";
  }

  nextStep(): PlanStepControl | undefined {
    switch (this.stage) {
      case "routing":
        return {
          stage: "routing",
          activeTools: ["PlanRoute"],
          instruction:
            "Classify the request now. Choose review when the user asks you to review, audit, explain or assess existing code — the deliverable is your findings. Choose research when the user wants something changed and needs an implementation plan. Ask one clarification only when a decision-critical requirement is missing.",
        };
      // The harness stops steering these: a clarification is already the
      // answer, a review is answered in prose, and a submitted plan is done.
      case "clarifying":
      case "reviewing":
      case "complete":
        return undefined;
      case "finding_evidence":
        return {
          stage: "finding_evidence",
          activeTools: ["Grep", "Glob"],
          instruction:
            "Locate the relevant code with a targeted Grep or Glob. Do not draft a plan yet.",
        };
      case "reading_evidence":
        return {
          stage: "reading_evidence",
          // Searching stays available: reading one file usually reveals the
          // next thing worth finding.
          activeTools: ["Read", "Grep", "Glob"],
          instruction: `Read the files the search identified — at least ${MIN_READS} before planning. Search again if a file points somewhere you have not looked. Do not draft a plan yet.`,
        };
      case "composing_plan": {
        const exhausted = this.evidenceValue.length >= EVIDENCE_BUDGET;
        return {
          stage: "composing_plan",
          // Keep investigation available so a genuinely missing detail can be
          // checked, rather than guessed at inside the plan.
          activeTools: exhausted
            ? ["SubmitPlan"]
            : ["SubmitPlan", "Read", "Grep", "Glob"],
          instruction: exhausted
            ? "You have gathered enough evidence. Call SubmitPlan now; do not emit prose instead."
            : "You have the minimum evidence for a plan. Call SubmitPlan now unless a decision-critical detail is still unverified — in that case check it first, then submit. Do not emit prose instead of SubmitPlan.",
        };
      }
    }
  }
}

/**
 * Models often number or bullet their own list items. Adding our marker on top
 * of theirs produces "1. 1. do the thing", so strip any leading markers first.
 * Requires trailing whitespace, so "1.5x faster" is left alone.
 */
export function stripListMarker(text: string): string {
  let out = text.trim();
  let previous: string;
  do {
    previous = out;
    out = out.replace(/^(?:\d+[.)]|[-*•+]|[a-z][.)])\s+/i, "").trimStart();
  } while (out !== previous && out.length > 0);
  return out || text.trim();
}

export function formatReviewedPlan(plan: ReviewedPlan): string {
  const { proposal, evidence } = plan;
  const list = (items: string[]) =>
    items.map((item) => `- ${stripListMarker(item)}`).join("\n");
  return [
    "## Summary",
    proposal.summary,
    "",
    "## Evidence consulted",
    list(evidence.map((item) => `\`${item.tool}\` — \`${item.target}\``)),
    "",
    "## Changes",
    list(proposal.changes.map((change) => `\`${change.path}\` — ${stripListMarker(change.intent)}`)),
    "",
    "## Implementation steps",
    proposal.steps.map((step, index) => `${index + 1}. ${stripListMarker(step)}`).join("\n"),
    "",
    "## Verification",
    list(proposal.verification),
    "",
    "## Risks",
    list(proposal.risks.length ? proposal.risks : ["None identified."]),
    "",
    "## Assumptions",
    list(proposal.assumptions.length ? proposal.assumptions : ["None."]),
  ].join("\n");
}

export function planHarnessTools<T extends ToolSet>(
  tools: T,
  control: PlanStepControl | undefined,
): string[] | undefined {
  if (!control) return undefined;
  return control.activeTools.filter((name) => name in tools);
}
