import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, type AnvilConfig } from "./types.ts";
import { anvilHome, loadConfig, projectSettingsPath } from "./load.ts";

export function globalConfigPath(): string {
  return join(anvilHome(), "config.json");
}

export async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  try {
    const data = await file.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    // corrupt → start fresh on write
  }
  return {};
}

export async function writeJsonObject(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

const SCALAR_KEYS = new Set([
  "baseURL",
  "apiKey",
  "model",
  "contextLength",
  "maxSteps",
  "mode",
]);

/** Parse CLI key like model, contextLength, skills.autoDetect */
export function parseConfigKey(key: string): string[] {
  return key.split(".").filter(Boolean);
}

export function getAtPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const part of path) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setAtPath(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i]!;
    const next = cur[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

export function deleteAtPath(obj: Record<string, unknown>, path: string[]): boolean {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i]!;
    const next = cur[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) return false;
    cur = next as Record<string, unknown>;
  }
  const last = path[path.length - 1]!;
  if (!(last in cur)) return false;
  delete cur[last];
  return true;
}

export function coerceConfigValue(keyPath: string[], raw: string): unknown {
  const leaf = keyPath[keyPath.length - 1] ?? "";
  const joined = keyPath.join(".");

  if (raw === "true") return true;
  if (raw === "false") return false;

  if (
    leaf === "contextLength" ||
    leaf === "maxSteps" ||
    leaf === "maxInjectSkills" ||
    leaf === "maxInjectChars" ||
    leaf === "maxChars"
  ) {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${joined} must be a number`);
    return n;
  }

  if (leaf === "always") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to CSV
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (leaf === "mode" && raw !== "plan" && raw !== "build") {
    throw new Error("mode must be plan or build");
  }

  if (leaf === "editorMode" && raw !== "emacs" && raw !== "vim") {
    throw new Error("ui.editorMode must be emacs or vim");
  }

  if (leaf === "theme" && raw !== "auto" && raw !== "dark" && raw !== "light") {
    throw new Error("ui.theme must be auto, dark or light");
  }

  return raw;
}

export type ConfigScope = "global" | "project";

export async function configFilePath(scope: ConfigScope, cwd: string): Promise<string> {
  return scope === "global" ? globalConfigPath() : projectSettingsPath(cwd);
}

export async function setConfigValue(
  scope: ConfigScope,
  cwd: string,
  key: string,
  rawValue: string,
): Promise<{ path: string; value: unknown }> {
  const filePath = await configFilePath(scope, cwd);
  const data = await readJsonObject(filePath);
  const keyPath = parseConfigKey(key);
  if (keyPath.length === 0) throw new Error("empty config key");
  if (keyPath[0] === "mcpServers") {
    throw new Error("use an editor for mcpServers (nested object)");
  }
  const value = coerceConfigValue(keyPath, rawValue);
  setAtPath(data, keyPath, value);
  await writeJsonObject(filePath, data);
  return { path: filePath, value };
}

export async function unsetConfigValue(
  scope: ConfigScope,
  cwd: string,
  key: string,
): Promise<{ path: string; removed: boolean }> {
  const filePath = await configFilePath(scope, cwd);
  const data = await readJsonObject(filePath);
  const keyPath = parseConfigKey(key);
  const removed = deleteAtPath(data, keyPath);
  if (removed) await writeJsonObject(filePath, data);
  return { path: filePath, removed };
}

export type ValueSource = "default" | "global" | "project" | "env" | "cli";

export async function explainConfig(cwd: string): Promise<{
  effective: AnvilConfig;
  globalPath: string;
  projectPath: string;
  global: Record<string, unknown>;
  project: Record<string, unknown>;
  sources: Record<string, ValueSource>;
}> {
  const globalPath = globalConfigPath();
  const projectPath = projectSettingsPath(cwd);
  const global = await readJsonObject(globalPath);
  const project = await readJsonObject(projectPath);
  const effective = await loadConfig(cwd);

  const sources: Record<string, ValueSource> = {};
  for (const key of SCALAR_KEYS) {
    if (key === "baseURL" && process.env.ANVIL_BASE_URL) sources[key] = "env";
    else if (key === "model" && process.env.ANVIL_MODEL) sources[key] = "env";
    else if (key === "apiKey" && process.env.ANVIL_API_KEY) sources[key] = "env";
    else if (key in project) sources[key] = "project";
    else if (key in global) sources[key] = "global";
    else sources[key] = "default";
  }

  return { effective, globalPath, projectPath, global, project, sources };
}

export function formatConfigShow(info: Awaited<ReturnType<typeof explainConfig>>): string {
  const { effective, sources, globalPath, projectPath, global, project } = info;
  const lines: string[] = [
    "Effective config (what Anvil will use):",
    `  model:          ${effective.model}  [${sources.model}]`,
    `  contextLength:  ${effective.contextLength}  [${sources.contextLength}]`,
    `  baseURL:        ${effective.baseURL}  [${sources.baseURL}]`,
    `  maxSteps:       ${effective.maxSteps}  [${sources.maxSteps}]`,
    `  mode:           ${effective.mode}  [${sources.mode}]`,
    `  apiKey:         ${effective.apiKey === "lmstudio" ? "lmstudio" : "(set)"}  [${sources.apiKey}]`,
    "",
    "Files:",
    `  global:  ${globalPath}${Object.keys(global).length ? "" : "  (empty/missing)"}`,
    `  project: ${projectPath}${Object.keys(project).length ? "" : "  (empty/missing)"}`,
    "",
    "Precedence: default < global < project < env (ANVIL_*) < CLI (-m / --base-url)",
  ];

  if (sources.model === "project" && "model" in global && global.model !== effective.model) {
    lines.push(
      "",
      `Note: project settings override global model (${JSON.stringify(global.model)} → ${JSON.stringify(effective.model)}).`,
      `      Fix: anvil config unset model --project`,
      `        or: anvil config set model <id> --project`,
    );
  }

  return lines.join("\n");
}

export async function runConfigCommand(
  cwd: string,
  args: string[],
): Promise<number> {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const a of args) {
    if (a === "--global" || a === "--project" || a === "-h" || a === "--help") flags.add(a);
    else positional.push(a);
  }

  if (flags.has("-h") || flags.has("--help") || positional[0] === "help") {
    printConfigHelp();
    return 0;
  }

  const scope: ConfigScope = flags.has("--project") ? "project" : "global";
  const cmd = positional[0] ?? "show";

  if (cmd === "show" || cmd === "list") {
    console.log(formatConfigShow(await explainConfig(cwd)));
    return 0;
  }

  if (cmd === "path" || cmd === "paths") {
    console.log(`global\t${globalConfigPath()}`);
    console.log(`project\t${projectSettingsPath(cwd)}`);
    return 0;
  }

  if (cmd === "get") {
    const key = positional[1];
    if (!key) {
      console.error("usage: anvil config get <key>");
      return 1;
    }
    const cfg = await loadConfig(cwd);
    const value = getAtPath(cfg, parseConfigKey(key));
    if (value === undefined) {
      console.error(`unknown key: ${key}`);
      return 1;
    }
    console.log(typeof value === "string" ? value : JSON.stringify(value));
    return 0;
  }

  if (cmd === "set") {
    const key = positional[1];
    const value = positional.slice(2).join(" ").trim();
    if (!key || !value) {
      console.error("usage: anvil config set <key> <value> [--global|--project]");
      return 1;
    }
    try {
      const { path, value: written } = await setConfigValue(scope, cwd, key, value);
      console.log(`set ${key}=${JSON.stringify(written)} in ${path}`);
      if (scope === "global") {
        const project = await readJsonObject(projectSettingsPath(cwd));
        if (key === "model" && "model" in project) {
          console.log(
            `warning: project .anvil/settings.json still sets model=${JSON.stringify(project.model)} (overrides global).`,
          );
          console.log(`         run: anvil config unset model --project`);
        }
      }
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  if (cmd === "unset") {
    const key = positional[1];
    if (!key) {
      console.error("usage: anvil config unset <key> [--global|--project]");
      return 1;
    }
    const { path, removed } = await unsetConfigValue(scope, cwd, key);
    console.log(removed ? `removed ${key} from ${path}` : `${key} not set in ${path}`);
    return 0;
  }

  if (cmd === "edit") {
    const path = await configFilePath(scope, cwd);
    await mkdir(dirname(path), { recursive: true });
    if (!(await Bun.file(path).exists())) {
      await writeJsonObject(path, scope === "global" ? { model: DEFAULT_CONFIG.model } : {});
    }
    const editor = process.env.EDITOR || process.env.VISUAL || "nano";
    const proc = Bun.spawn([editor, path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const code = await proc.exited;
    return code;
  }

  console.error(`unknown config command: ${cmd}`);
  printConfigHelp();
  return 1;
}

function printConfigHelp(): void {
  console.log(`anvil config — view and edit settings

Usage:
  anvil config                         Show effective config + sources
  anvil config get <key>               Print one effective value
  anvil config set <key> <value>       Write to ~/.anvil/config.json (global)
  anvil config set <key> <value> --project
  anvil config unset <key> [--project]
  anvil config path                    Print config file paths
  anvil config edit [--project]        Open file in $EDITOR

Common keys:
  model  contextLength  baseURL  maxSteps  mode  apiKey
  skills.autoDetect  skills.always  context.maxChars

Examples:
  anvil config set model qwen/qwen3.6-27b
  anvil config set contextLength 65536
  anvil config unset model --project
`);
}
