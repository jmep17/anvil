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
    expect(prompt).toContain("PlanRoute → repository search → file read → SubmitPlan");
    expect(prompt).toContain("Loaded skills (always/auto)");
    expect(prompt).toContain("### Skill: docs");
  });
});
