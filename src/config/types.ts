export type AgentMode = "plan" | "build";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SkillsConfig {
  /** Scan the repo for stack tags and recommend matching skills. Default true. */
  autoDetect: boolean;
  /** Skill names always injected into the system prompt. */
  always: string[];
  /**
   * When true (default), only recommend detected skills in the prompt.
   * When false, also inject recommended skill bodies (subject to caps).
   */
  recommendOnly: boolean;
  /** Max skill bodies to inject. Default 3. */
  maxInjectSkills: number;
  /** Max chars for injected skill bodies. Default 8000. */
  maxInjectChars: number;
}

export interface ContextConfig {
  /** Load ANVIL.md / anvil.md. Default true. */
  anvilMd: boolean;
  /** Load committed .anvil/CONTEXT.md. Default true. */
  projectContext: boolean;
  /** Load ~/.anvil/projects/<hash>/CONTEXT.md. Default true. */
  localContext: boolean;
  /** Max chars for combined repo context. Default 6000. */
  maxChars: number;
}

export interface AnvilConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  contextLength: number;
  maxSteps: number;
  mode: AgentMode;
  mcpServers: Record<string, McpServerConfig>;
  skills: SkillsConfig;
  context: ContextConfig;
}

export const DEFAULT_SKILLS_CONFIG: SkillsConfig = {
  autoDetect: true,
  always: [],
  recommendOnly: true,
  maxInjectSkills: 3,
  maxInjectChars: 8000,
};

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  anvilMd: true,
  projectContext: true,
  localContext: true,
  maxChars: 6000,
};

export const DEFAULT_CONFIG: AnvilConfig = {
  baseURL: "http://localhost:1234/v1",
  apiKey: "lmstudio",
  model: "qwen/qwen3.5-9b",
  contextLength: 16384,
  maxSteps: 40,
  mode: "build",
  mcpServers: {},
  skills: { ...DEFAULT_SKILLS_CONFIG },
  context: { ...DEFAULT_CONTEXT_CONFIG },
};
