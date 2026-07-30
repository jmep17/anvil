export type SkillSource = "builtin" | "user" | "project";

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  detect: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
  path: string;
  triggers: string[];
  detect: string[];
}

export interface SkillContent extends SkillInfo {
  body: string;
  raw: string;
}
