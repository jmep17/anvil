import { describe, expect, test } from "bun:test";
import { DEFAULT_SKILLS_CONFIG } from "../config/types.ts";
import type { SkillInfo } from "../skills/types.ts";
import { buildSystemPrompt } from "./system.ts";

const sampleSkills: SkillInfo[] = [
  {
    name: "shadcn",
    description: "Build UI with shadcn/ui",
    source: "builtin",
    path: "/x",
    triggers: [],
    detect: ["shadcn"],
  },
  {
    name: "docs",
    description: "Research docs",
    source: "builtin",
    path: "/y",
    triggers: [],
    detect: [],
  },
];

describe("buildSystemPrompt", () => {
  test("includes skill catalog with descriptions", () => {
    const prompt = buildSystemPrompt({
      cwd: "/tmp/app",
      mode: "build",
      skills: sampleSkills,
      repoContext: "Project instructions (ANVIL.md):\nUse Bun.",
      detectedStack: ["next", "shadcn"],
      recommendedSkills: ["shadcn", "frontend"],
      injectedSkills: "",
      skillsConfig: { ...DEFAULT_SKILLS_CONFIG },
    });
    expect(prompt).toContain("- shadcn — Build UI with shadcn/ui");
    expect(prompt).toContain("Detected stack: next, shadcn");
    expect(prompt).toContain("Recommended skills: shadcn, frontend");
    expect(prompt).toContain("Use Bun");
    expect(prompt).toContain("Do not repeat an identical Read");
    expect(prompt).toContain("Goal → Evidence → Decision → Next action");
    expect(prompt).toContain("do not stop after saying what you intend to implement");
  });

  test("plan mode nudges skill loading", () => {
    const prompt = buildSystemPrompt({
      cwd: "/tmp/app",
      mode: "plan",
      skills: sampleSkills,
      repoContext: "",
      detectedStack: [],
      recommendedSkills: ["shadcn"],
      injectedSkills: "### Skill: docs\nbody",
      skillsConfig: { ...DEFAULT_SKILLS_CONFIG },
    });
    expect(prompt).toContain("read-only");
    expect(prompt).toContain("PlanRoute");
    expect(prompt).toContain("Loaded skills (always/auto)");
    expect(prompt).toContain("### Skill: docs");
  });

  test("plan mode distinguishes reviewing from planning a change", () => {
    const prompt = buildSystemPrompt({
      cwd: "/tmp/app",
      mode: "plan",
      skills: sampleSkills,
      repoContext: "",
      detectedStack: [],
      recommendedSkills: [],
      injectedSkills: "",
      skillsConfig: { ...DEFAULT_SKILLS_CONFIG },
    });

    // A review request must be answered, not turned into a plan to review.
    expect(prompt).toContain("**review**");
    expect(prompt).toContain("Do not call SubmitPlan");
    expect(prompt).toContain("never produce a plan describing how you would review");
    expect(prompt).toContain("**research**");
    expect(prompt).toContain("**clarify**");
    // And the model should not add its own list markers on top of ours.
    expect(prompt).toContain('do not start an item with "1." or "-"');
  });

  test("build mode carries no plan-route instructions", () => {
    const prompt = buildSystemPrompt({
      cwd: "/tmp/app",
      mode: "build",
      skills: sampleSkills,
      repoContext: "",
      detectedStack: [],
      recommendedSkills: [],
      injectedSkills: "",
      skillsConfig: { ...DEFAULT_SKILLS_CONFIG },
    });
    expect(prompt).not.toContain("PlanRoute");
    expect(prompt).not.toContain("SubmitPlan");
  });
});
