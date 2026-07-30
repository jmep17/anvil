import { join } from "node:path";
import type { ContextConfig } from "../config/types.ts";
import { anvilHome } from "../config/load.ts";
import { projectHash } from "../session/store.ts";

export interface RepoContextParts {
  anvilMd: string | null;
  projectContext: string | null;
  localContext: string | null;
  /** Combined, truncated text ready for the system prompt (may be empty). */
  combined: string;
  truncated: boolean;
}

export function localContextPath(cwd: string): string {
  return join(anvilHome(), "projects", projectHash(cwd), "CONTEXT.md");
}

export async function loadAnvilMd(cwd: string): Promise<string | null> {
  for (const name of ["ANVIL.md", "anvil.md"]) {
    const path = join(cwd, name);
    const file = Bun.file(path);
    if (await file.exists()) return await file.text();
  }
  return null;
}

export async function loadRepoContext(
  cwd: string,
  config: ContextConfig,
): Promise<RepoContextParts> {
  const anvilMd = config.anvilMd ? await loadAnvilMd(cwd) : null;

  let projectContext: string | null = null;
  if (config.projectContext) {
    const path = join(cwd, ".anvil", "CONTEXT.md");
    const file = Bun.file(path);
    if (await file.exists()) projectContext = await file.text();
  }

  let localContext: string | null = null;
  if (config.localContext) {
    const path = localContextPath(cwd);
    const file = Bun.file(path);
    if (await file.exists()) localContext = await file.text();
  }

  const sections: string[] = [];
  if (anvilMd?.trim()) {
    sections.push(`Project instructions (ANVIL.md):\n${anvilMd.trim()}`);
  }
  if (projectContext?.trim()) {
    sections.push(`Project context (.anvil/CONTEXT.md):\n${projectContext.trim()}`);
  }
  if (localContext?.trim()) {
    sections.push(`Local notes (machine-only):\n${localContext.trim()}`);
  }

  let combined = sections.join("\n\n");
  let truncated = false;
  if (combined.length > config.maxChars) {
    combined = `${combined.slice(0, config.maxChars)}\n\n… truncated (repo context exceeded ${config.maxChars} chars)`;
    truncated = true;
  }

  return { anvilMd, projectContext, localContext, combined, truncated };
}
