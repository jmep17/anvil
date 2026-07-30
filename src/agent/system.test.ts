import { describe, expect, test } from "bun:test";
import { DEFAULT_SKILLS_CONFIG } from "../config/types.ts";
import type { SkillInfo } from "../skills/types.ts";
import { DEFAULT_TIMEZONE, describeToday } from "./datetime.ts";
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
      today: "Thursday, 30 July 2026 · 2026-07-30 · Europe/London",
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
      today: "Thursday, 30 July 2026 · 2026-07-30 · Europe/London",
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
      today: "Thursday, 30 July 2026 · 2026-07-30 · Europe/London",
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
      today: "Thursday, 30 July 2026 · 2026-07-30 · Europe/London",
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

/**
 * The system prompt is the prompt prefix, and a local inference server keeps
 * its cached KV state only while that prefix is byte-identical. Anything in
 * here that moves with the clock costs a full re-encode of the whole context —
 * prompt, tool schemas and conversation — before a single token comes back.
 */
describe("the system prompt as a cache prefix", () => {
  const build = (at: Date) =>
    buildSystemPrompt({
      cwd: "/tmp/app",
      mode: "build",
      today: describeToday(at, DEFAULT_TIMEZONE),
      skills: sampleSkills,
      repoContext: "Project instructions (ANVIL.md):\nUse Bun.",
      detectedStack: ["next"],
      recommendedSkills: ["shadcn"],
      injectedSkills: "",
      skillsConfig: { ...DEFAULT_SKILLS_CONFIG },
    });

  test("is identical for two turns on the same day", () => {
    // Minutes apart, and hours apart: neither may change a single byte.
    expect(build(new Date("2026-07-30T16:42:00Z"))).toBe(
      build(new Date("2026-07-30T16:43:00Z")),
    );
    expect(build(new Date("2026-07-30T06:00:00Z"))).toBe(
      build(new Date("2026-07-30T21:30:00Z")),
    );
  });

  test("contains no clock time anywhere", () => {
    expect(build(new Date("2026-07-30T16:42:00Z"))).not.toMatch(/\d{2}:\d{2}/);
  });

  test("does still turn over to the next day", () => {
    expect(build(new Date("2026-07-30T12:00:00Z"))).not.toBe(
      build(new Date("2026-07-31T12:00:00Z")),
    );
  });
});
