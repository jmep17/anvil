import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_SKILLS_CONFIG,
  DEFAULT_UI_CONFIG,
  type AnvilConfig,
  type ContextConfig,
  type McpServerConfig,
  type SkillsConfig,
  type UiConfig,
} from "./types.ts";

export function anvilHome(): string {
  if (process.env.ANVIL_HOME) return process.env.ANVIL_HOME;
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".anvil");
}

export function projectSettingsPath(cwd: string): string {
  return join(cwd, ".anvil", "settings.json");
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeSkills(
  base: SkillsConfig,
  partial: unknown,
): SkillsConfig {
  if (!partial || typeof partial !== "object") return base;
  const p = partial as Record<string, unknown>;
  return {
    autoDetect: typeof p.autoDetect === "boolean" ? p.autoDetect : base.autoDetect,
    always: Array.isArray(p.always)
      ? p.always.filter((x): x is string => typeof x === "string")
      : base.always,
    recommendOnly:
      typeof p.recommendOnly === "boolean" ? p.recommendOnly : base.recommendOnly,
    maxInjectSkills:
      typeof p.maxInjectSkills === "number" ? p.maxInjectSkills : base.maxInjectSkills,
    maxInjectChars:
      typeof p.maxInjectChars === "number" ? p.maxInjectChars : base.maxInjectChars,
  };
}

function mergeContext(
  base: ContextConfig,
  partial: unknown,
): ContextConfig {
  if (!partial || typeof partial !== "object") return base;
  const p = partial as Record<string, unknown>;
  return {
    anvilMd: typeof p.anvilMd === "boolean" ? p.anvilMd : base.anvilMd,
    projectContext:
      typeof p.projectContext === "boolean" ? p.projectContext : base.projectContext,
    localContext:
      typeof p.localContext === "boolean" ? p.localContext : base.localContext,
    maxChars: typeof p.maxChars === "number" ? p.maxChars : base.maxChars,
  };
}

function mergeUi(base: UiConfig, partial: unknown): UiConfig {
  if (!partial || typeof partial !== "object") return base;
  const p = partial as Record<string, unknown>;
  const next: UiConfig = { ...base };
  if (p.editorMode === "emacs" || p.editorMode === "vim") next.editorMode = p.editorMode;
  if (typeof p.editor === "string") {
    next.editor = p.editor.trim() ? p.editor : undefined;
  } else if ("editor" in p && (p.editor === null || p.editor === undefined)) {
    delete next.editor;
  }
  return next;
}

function mergePartial(base: AnvilConfig, partial: Record<string, unknown> | null): AnvilConfig {
  if (!partial) return base;
  const next = {
    ...base,
    skills: { ...base.skills },
    context: { ...base.context },
    ui: { ...base.ui },
  };
  if (typeof partial.baseURL === "string") next.baseURL = partial.baseURL;
  if (typeof partial.apiKey === "string") next.apiKey = partial.apiKey;
  if (typeof partial.model === "string") next.model = partial.model;
  if (typeof partial.contextLength === "number") next.contextLength = partial.contextLength;
  if (typeof partial.maxSteps === "number") next.maxSteps = partial.maxSteps;
  if (partial.mode === "plan" || partial.mode === "build") next.mode = partial.mode;
  if (partial.mcpServers && typeof partial.mcpServers === "object") {
    next.mcpServers = {
      ...next.mcpServers,
      ...(partial.mcpServers as Record<string, McpServerConfig>),
    };
  }
  if ("skills" in partial) next.skills = mergeSkills(base.skills, partial.skills);
  if ("context" in partial) next.context = mergeContext(base.context, partial.context);
  if ("ui" in partial) next.ui = mergeUi(base.ui, partial.ui);
  return next;
}

export async function loadConfig(cwd: string, overrides: Partial<AnvilConfig> = {}): Promise<AnvilConfig> {
  const globalCfg = await readJsonIfExists(join(anvilHome(), "config.json"));
  const projectCfg = await readJsonIfExists(projectSettingsPath(cwd));
  let cfg = mergePartial(
    {
      ...DEFAULT_CONFIG,
      skills: { ...DEFAULT_SKILLS_CONFIG },
      context: { ...DEFAULT_CONTEXT_CONFIG },
      ui: { ...DEFAULT_UI_CONFIG },
    },
    globalCfg,
  );
  cfg = mergePartial(cfg, projectCfg);

  // Deep-merge nested overrides
  cfg = {
    ...cfg,
    ...overrides,
    skills: overrides.skills
      ? mergeSkills(cfg.skills, overrides.skills)
      : cfg.skills,
    context: overrides.context
      ? mergeContext(cfg.context, overrides.context)
      : cfg.context,
    ui: overrides.ui ? mergeUi(cfg.ui, overrides.ui) : cfg.ui,
  };

  if (process.env.ANVIL_BASE_URL) cfg.baseURL = process.env.ANVIL_BASE_URL;
  if (process.env.ANVIL_MODEL) cfg.model = process.env.ANVIL_MODEL;
  if (process.env.ANVIL_API_KEY) cfg.apiKey = process.env.ANVIL_API_KEY;

  return cfg;
}

export async function ensureAnvilHome(): Promise<void> {
  await Bun.$`mkdir -p ${anvilHome()}/projects ${anvilHome()}/skills`.quiet();
}
