import { join } from "node:path";

/** Cheap filesystem signals → stack tags (no network). */
export async function detectStack(cwd: string): Promise<string[]> {
  const tags = new Set<string>();

  const pkg = await readJson(join(cwd, "package.json"));
  if (pkg) {
    tags.add("node");
    tags.add("javascript");
    const deps = {
      ...asRecord(pkg.dependencies),
      ...asRecord(pkg.devDependencies),
      ...asRecord(pkg.peerDependencies),
    };
    const names = Object.keys(deps);

    if (hasAny(names, ["react", "react-dom"])) tags.add("react");
    if (hasAny(names, ["next"])) tags.add("next");
    if (hasAny(names, ["vue", "nuxt"])) tags.add("vue");
    if (hasAny(names, ["svelte", "@sveltejs/kit"])) tags.add("svelte");
    if (hasAny(names, ["tailwindcss"])) tags.add("tailwind");
    if (hasAny(names, ["shadcn", "shadcn-ui"])) tags.add("shadcn");
    if (hasAny(names, ["@radix-ui/react-slot", "class-variance-authority", "lucide-react"])) {
      // Common shadcn companion deps — soft signal when components.json also present
      tags.add("radix");
    }
    if (hasAny(names, ["prisma", "@prisma/client"])) tags.add("prisma");
    if (hasAny(names, ["drizzle-orm", "drizzle-kit"])) tags.add("drizzle");
    if (hasAny(names, ["express", "fastify", "hono", "koa"])) tags.add("api");
    if (hasAny(names, ["vitest", "jest", "@playwright/test", "mocha"])) tags.add("testing");
    if (hasAny(names, ["typescript"]) || (await exists(join(cwd, "tsconfig.json")))) {
      tags.add("typescript");
    }
    if (hasAny(names, ["bun-types", "@types/bun"]) || (await exists(join(cwd, "bun.lock")))) {
      tags.add("bun");
    }
  }

  if (await exists(join(cwd, "components.json"))) tags.add("shadcn");
  if (await exists(join(cwd, "next.config.js")) || (await exists(join(cwd, "next.config.mjs"))) || (await exists(join(cwd, "next.config.ts")))) {
    tags.add("next");
  }
  if (await exists(join(cwd, "prisma", "schema.prisma"))) tags.add("prisma");
  if (
    (await exists(join(cwd, "drizzle.config.ts"))) ||
    (await exists(join(cwd, "drizzle.config.js")))
  ) {
    tags.add("drizzle");
  }
  if (await exists(join(cwd, "Dockerfile"))) tags.add("docker");
  if (await exists(join(cwd, "go.mod"))) tags.add("go");
  if (await exists(join(cwd, "Cargo.toml"))) tags.add("rust");
  if (
    (await exists(join(cwd, "pyproject.toml"))) ||
    (await exists(join(cwd, "requirements.txt")))
  ) {
    tags.add("python");
  }
  if ((await exists(join(cwd, "Gemfile"))) || (await exists(join(cwd, "Rakefile")))) {
    tags.add("ruby");
  }

  // Frontend skill when any UI framework present
  if (
    tags.has("react") ||
    tags.has("next") ||
    tags.has("vue") ||
    tags.has("svelte") ||
    tags.has("shadcn")
  ) {
    tags.add("frontend");
  }

  if (tags.has("prisma") || tags.has("drizzle")) tags.add("database");

  return [...tags].sort();
}

/** Default tag → skill recommendations (also merged with skill frontmatter detect). */
export const TAG_TO_SKILLS: Record<string, string[]> = {
  shadcn: ["shadcn", "frontend"],
  frontend: ["frontend"],
  react: ["frontend"],
  next: ["frontend"],
  vue: ["frontend"],
  svelte: ["frontend"],
  api: ["api"],
  prisma: ["database"],
  drizzle: ["database"],
  database: ["database"],
  testing: ["testing"],
  python: ["api", "testing"],
  go: ["api", "testing"],
  rust: ["api", "testing"],
};

export function recommendSkillsFromTags(
  tags: string[],
  skillDetectMap?: Map<string, string[]>,
): string[] {
  const recommended = new Set<string>();
  for (const tag of tags) {
    for (const skill of TAG_TO_SKILLS[tag] ?? []) {
      recommended.add(skill);
    }
    if (skillDetectMap) {
      for (const [skillName, detectTags] of skillDetectMap) {
        if (detectTags.includes(tag)) recommended.add(skillName);
      }
    }
  }
  return [...recommended].sort();
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasAny(names: string[], needles: string[]): boolean {
  const set = new Set(names);
  return needles.some((n) => set.has(n));
}
