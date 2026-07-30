import type { AgentMode, SkillsConfig } from "../config/types.ts";
import type { SkillInfo } from "../skills/types.ts";

export interface SystemPromptOptions {
  cwd: string;
  mode: AgentMode;
  skills: SkillInfo[];
  /** Truncated combined repo context (ANVIL.md, .anvil/CONTEXT.md, local notes). */
  repoContext: string;
  detectedStack: string[];
  recommendedSkills: string[];
  /** Injected skill bodies (always + optional recommended). */
  injectedSkills: string;
  skillsConfig: SkillsConfig;
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const catalog =
    opts.skills.length > 0
      ? [
          "Available skills (load with Skill tool):",
          ...opts.skills.map((s) => {
            const desc = s.description || "(no description)";
            return `- ${s.name} — ${desc}`;
          }),
        ].join("\n")
      : "No skills installed yet. Users can add markdown playbooks under ~/.anvil/skills/<name>/SKILL.md";

  const stackLines: string[] = [];
  if (opts.skillsConfig.autoDetect && opts.detectedStack.length > 0) {
    stackLines.push(`Detected stack: ${opts.detectedStack.join(", ")}`);
  }
  if (opts.recommendedSkills.length > 0) {
    stackLines.push(
      `Recommended skills: ${opts.recommendedSkills.join(", ")} — load with Skill before planning related work.`,
    );
  }

  const planNudge =
    opts.mode === "plan"
      ? "\n- In plan mode: before proposing an implementation plan, load recommended or relevant skills with the Skill tool. End with a self-contained plan covering the files to change, implementation steps, verification, and material risks. Do not claim implementation has started; wait for the user to approve the plan."
      : "";

  const injected =
    opts.injectedSkills.trim().length > 0
      ? `\n\nLoaded skills (always/auto):\n${opts.injectedSkills.trim()}`
      : "";

  const repo =
    opts.repoContext.trim().length > 0
      ? opts.repoContext.trim()
      : "No project context found (ANVIL.md, .anvil/CONTEXT.md, or local CONTEXT.md).";

  return `You are Anvil, a local AI coding agent similar to Claude Code.
You work in the user's project directory and use tools to gather context, take action, and verify results.

Working directory: ${opts.cwd}
Mode: ${opts.mode}${opts.mode === "plan" ? " (read-only: no Write/Edit/Bash)" : ""}

Guidelines:
- Prefer Read/Glob/Grep over Bash for exploring code.
- Read only the context needed for the next action. Do not repeat an identical Read unless a tool has changed that file or you need a different line range.
- In build mode, when the user asks for a change, make the edit once you have enough context; do not stop after saying what you intend to implement. If you cannot proceed, state the concrete blocker instead.
- Make focused edits with Edit; use Write for new files.
- After code changes, verify with tests or typechecks when appropriate.
- Be concise. Do not dump huge irrelevant file contents into your final answer.
- For library/docs questions, use WebSearch and WebFetch.
- Use TodoWrite for multi-step tasks.
- Use Task to delegate isolated research subtasks.
- Load domain skills with the Skill tool when planning or implementing specialized work (UI, API, database, testing, docs).${planNudge}

${catalog}
${stackLines.length ? `\n${stackLines.join("\n")}` : ""}

${repo}${injected}
`;
}
