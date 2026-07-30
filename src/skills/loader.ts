import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anvilHome } from "../config/load.ts";
import { parseFrontmatter, skillMetaFromParsed } from "./frontmatter.ts";
import type { SkillContent, SkillInfo, SkillSource } from "./types.ts";

const SOURCE_PRIORITY: Record<SkillSource, number> = {
  builtin: 0,
  user: 1,
  project: 2,
};

export function packageRoot(): string {
  // src/skills/loader.ts → repo root
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function builtinSkillsDir(): string {
  return join(packageRoot(), "skills", "builtin");
}

async function skillDirs(cwd: string): Promise<Array<{ dir: string; source: SkillSource }>> {
  return [
    { dir: builtinSkillsDir(), source: "builtin" },
    { dir: join(anvilHome(), "skills"), source: "user" },
    { dir: join(cwd, ".anvil", "skills"), source: "project" },
  ];
}

async function discoverInDir(
  dir: string,
  source: SkillSource,
): Promise<SkillInfo[]> {
  const found: SkillInfo[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const path = join(dir, e.name, "SKILL.md");
        const file = Bun.file(path);
        if (!(await file.exists())) continue;
        const raw = await file.text();
        const { meta } = parseFrontmatter(raw);
        const parsed = skillMetaFromParsed(e.name, meta);
        found.push({
          name: parsed.name,
          description: parsed.description,
          source,
          path,
          triggers: parsed.triggers,
          detect: parsed.detect,
        });
      } else if (e.isFile() && e.name.endsWith(".md")) {
        const path = join(dir, e.name);
        const raw = await Bun.file(path).text();
        const { meta } = parseFrontmatter(raw);
        const fallbackName = e.name.replace(/\.md$/, "");
        const parsed = skillMetaFromParsed(fallbackName, meta);
        found.push({
          name: parsed.name,
          description: parsed.description,
          source,
          path,
          triggers: parsed.triggers,
          detect: parsed.detect,
        });
      }
    }
  } catch {
    // missing dir is fine
  }
  return found;
}

/** List skills with project > user > builtin override by name. */
export async function listSkills(cwd: string): Promise<SkillInfo[]> {
  const byName = new Map<string, SkillInfo>();
  for (const { dir, source } of await skillDirs(cwd)) {
    const skills = await discoverInDir(dir, source);
    for (const skill of skills) {
      const existing = byName.get(skill.name);
      if (!existing || SOURCE_PRIORITY[source] >= SOURCE_PRIORITY[existing.source]) {
        byName.set(skill.name, skill);
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** @deprecated Prefer listSkills which returns SkillInfo[]. */
export async function listSkillNames(cwd: string): Promise<string[]> {
  return (await listSkills(cwd)).map((s) => s.name);
}

export async function getSkillContent(
  cwd: string,
  name: string,
): Promise<string | null> {
  const skill = await getSkill(cwd, name);
  return skill?.raw ?? null;
}

export async function getSkill(
  cwd: string,
  name: string,
): Promise<SkillContent | null> {
  const skills = await listSkills(cwd);
  const info = skills.find((s) => s.name === name);
  if (!info) return null;
  const raw = await Bun.file(info.path).text();
  const { meta, body } = parseFrontmatter(raw);
  const parsed = skillMetaFromParsed(name, meta);
  return {
    ...info,
    name: parsed.name,
    description: parsed.description,
    triggers: parsed.triggers,
    detect: parsed.detect,
    body,
    raw,
  };
}

export async function loadSkillBodies(
  cwd: string,
  names: string[],
  opts: { maxSkills?: number; maxChars?: number } = {},
): Promise<string> {
  const maxSkills = opts.maxSkills ?? 3;
  const maxChars = opts.maxChars ?? 8000;
  const parts: string[] = [];
  let total = 0;
  let count = 0;

  for (const name of names) {
    if (count >= maxSkills) break;
    const skill = await getSkill(cwd, name);
    if (!skill) continue;
    const chunk = `### Skill: ${skill.name}\n${skill.raw.trim()}`;
    if (total + chunk.length > maxChars && parts.length > 0) break;
    const truncated =
      chunk.length > maxChars - total
        ? `${chunk.slice(0, Math.max(0, maxChars - total))}\n… truncated`
        : chunk;
    parts.push(truncated);
    total += truncated.length;
    count += 1;
  }

  return parts.join("\n\n");
}
