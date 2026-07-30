import type { SkillMeta } from "./types.ts";

/** Minimal YAML-ish frontmatter parser for skill SKILL.md files. */
export function parseFrontmatter(text: string): {
  meta: Partial<SkillMeta>;
  body: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const yaml = match[1] ?? "";
  const body = match[2] ?? "";
  const meta: Partial<SkillMeta> = {};

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "name" || key === "description") {
      meta[key] = value;
    } else if (key === "triggers" || key === "detect") {
      meta[key] = parseStringList(value);
    }
  }

  return { meta, body };
}

function parseStringList(value: string): string[] {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function skillMetaFromParsed(
  name: string,
  meta: Partial<SkillMeta>,
): SkillMeta {
  return {
    name: meta.name?.trim() || name,
    description: meta.description?.trim() || "",
    triggers: meta.triggers ?? [],
    detect: meta.detect ?? [],
  };
}
