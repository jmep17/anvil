import type { ToolSet } from "ai";

export interface PlanClarification {
  question: string;
  reason: string;
}

export interface PlanRoute {
  kind: "research" | "clarify";
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
  | "finding_evidence"
  | "reading_evidence"
  | "composing_plan"
  | "complete";

export interface PlanStepControl {
  stage: PlanStage;
  activeTools: string[];
  toolChoice: "required" | { type: "tool"; toolName: string };
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

  get stage(): PlanStage {
    if (!this.routeValue) return "routing";
    if (this.clarification) return "clarifying";
    if (!this.evidenceValue.some((item) => item.tool === "Glob" || item.tool === "Grep")) {
      return "finding_evidence";
    }
    if (!this.evidenceValue.some((item) => item.tool === "Read")) return "reading_evidence";
    if (!this.proposalValue) return "composing_plan";
    return "complete";
  }

  nextStep(): PlanStepControl | undefined {
    switch (this.stage) {
      case "routing":
        return {
          stage: "routing",
          activeTools: ["PlanRoute"],
          toolChoice: { type: "tool", toolName: "PlanRoute" },
          instruction:
            "Classify the request now. Ask one clarification only when a decision-critical requirement is missing; otherwise state the implementation goal and success criteria.",
        };
      case "clarifying":
      case "complete":
        return undefined;
      case "finding_evidence":
        return {
          stage: "finding_evidence",
          activeTools: ["Glob", "Grep"],
          toolChoice: "required",
          instruction:
            "Find relevant repository evidence with Glob or Grep. Do not draft a plan yet.",
        };
      case "reading_evidence":
        return {
          stage: "reading_evidence",
          activeTools: ["Read"],
          toolChoice: { type: "tool", toolName: "Read" },
          instruction:
            "Read one file identified by the search result. Do not draft a plan yet.",
        };
      case "composing_plan":
        return {
          stage: "composing_plan",
          activeTools: ["SubmitPlan"],
          toolChoice: { type: "tool", toolName: "SubmitPlan" },
          instruction:
            "Use SubmitPlan now. Populate every field from the request and the repository evidence; do not emit prose instead.",
        };
    }
  }
}

export function formatReviewedPlan(plan: ReviewedPlan): string {
  const { proposal, evidence } = plan;
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return [
    "## Summary",
    proposal.summary,
    "",
    "## Evidence consulted",
    list(evidence.map((item) => `\`${item.tool}\` — \`${item.target}\``)),
    "",
    "## Changes",
    list(proposal.changes.map((change) => `\`${change.path}\` — ${change.intent}`)),
    "",
    "## Implementation steps",
    proposal.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
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
