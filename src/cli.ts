#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runConfigCommand } from "./config/cli.ts";
import { ensureAnvilHome, loadConfig } from "./config/load.ts";
import type { AgentMode } from "./config/types.ts";
import { SessionStore } from "./session/store.ts";

const VALUE_FLAGS = new Set([
  "-m",
  "--model",
  "--mode",
  "--resume",
  "--base-url",
  "--cwd",
]);

const SUBCOMMANDS = new Set(["config"]);

/** First bare positional if it is a known subcommand (skips flags and their values). */
export function findSubcommandIndex(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (VALUE_FLAGS.has(a)) {
      i += 1;
      continue;
    }
    if (a.startsWith("-")) continue;
    return SUBCOMMANDS.has(a) ? i : -1;
  }
  return -1;
}

/**
 * Pick the session this run should use. Returns null when the request cannot
 * be satisfied — a mistyped id used to silently start an empty session under
 * a new file, losing the conversation the user meant to continue.
 */
export async function openSession(
  cwd: string,
  values: { resume?: unknown; continue?: unknown },
): Promise<SessionStore | null> {
  const wantsContinue = Boolean(values.continue);
  // `--resume` with no value means "let me choose".
  const resumeId = typeof values.resume === "string" ? values.resume.trim() : "";
  const wantsPicker = values.resume === true || (Boolean(values.resume) && !resumeId);

  if (resumeId) {
    const store = await SessionStore.open(cwd, resumeId);
    if (await store.exists()) return store;
    console.error(`anvil: no session "${resumeId}" for this project.`);
    const known = await SessionStore.listIds(cwd);
    if (known.length) {
      console.error(`Recent sessions:\n${known.slice(0, 5).map((id) => `  ${id}`).join("\n")}`);
    }
    return null;
  }

  if (wantsContinue || wantsPicker) {
    const recent = await SessionStore.mostRecent(cwd);
    if (recent) return await SessionStore.open(cwd, recent);
    console.error("anvil: no earlier sessions for this project; starting a new one.");
  }

  return await SessionStore.create(cwd);
}

export async function runCli(argv: string[] = Bun.argv.slice(2)): Promise<void> {
  const subIdx = findSubcommandIndex(argv);

  if (subIdx >= 0 && argv[subIdx] === "config") {
    await ensureAnvilHome();
    const withoutSub = [...argv.slice(0, subIdx), ...argv.slice(subIdx + 1)];
    const cwd = (() => {
      const i = withoutSub.indexOf("--cwd");
      return i >= 0 && withoutSub[i + 1] ? withoutSub[i + 1]! : process.cwd();
    })();
    process.chdir(cwd);
    const configArgs = withoutSub.filter((a, i, arr) => {
      if (a === "--cwd") return false;
      if (arr[i - 1] === "--cwd") return false;
      return true;
    });
    process.exitCode = await runConfigCommand(cwd, configArgs);
    return;
  }

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: { type: "boolean", short: "h" },
      print: { type: "boolean", short: "p" },
      yes: { type: "boolean", short: "y" },
      tui: { type: "boolean" },
      repl: { type: "boolean" },
      model: { type: "string", short: "m" },
      mode: { type: "string" },
      resume: { type: "string" },
      continue: { type: "boolean", short: "c" },
      "base-url": { type: "string" },
      cwd: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printHelp();
    return;
  }

  await ensureAnvilHome();
  const cwd = values.cwd ? String(values.cwd) : process.cwd();
  process.chdir(cwd);

  const mode = values.mode === "plan" || values.mode === "build" ? (values.mode as AgentMode) : undefined;
  const config = await loadConfig(cwd, {
    ...(values.model ? { model: String(values.model) } : {}),
    ...(values["base-url"] ? { baseURL: String(values["base-url"]) } : {}),
    ...(mode ? { mode } : {}),
  });

  const prompt = values.print
    ? positionals.join(" ").trim() || undefined
    : positionals.length
      ? positionals.join(" ").trim()
      : undefined;

  const yes = Boolean(values.yes) || Boolean(values.print);
  const wantTui =
    Boolean(values.tui) ||
    (!values.repl && !values.print && process.stdout.isTTY && !prompt);

  // Sessions only for the agent — never for `anvil config`.
  const session = await openSession(cwd, values);
  if (!session) {
    process.exitCode = 1;
    return;
  }

  if (wantTui && !values.repl) {
    try {
      const { runTui } = await import("./ui/App.tsx");
      await runTui({ config, cwd, session, yes, prompt });
      return;
    } catch (err) {
      console.error("TUI failed, falling back to REPL:", err instanceof Error ? err.message : err);
    }
  }

  const { runRepl } = await import("./ui/repl.ts");
  await runRepl({
    config,
    cwd,
    session,
    prompt: prompt || (values.print ? "" : undefined),
    yes,
  });
}

function printHelp(): void {
  console.log(`anvil — local Claude Code–like coding agent

Usage:
  anvil                     Interactive session (TUI if tty, else REPL)
  anvil -p "prompt"         One-shot prompt (auto-approve tools)
  anvil --repl              Force classic REPL
  anvil --tui               Force the TUI
  anvil --mode plan|build   Start in plan (read-only) or build mode
  anvil -m <model>          Override model id for this run
  anvil --resume <id>       Resume a specific session id
  anvil -c, --continue      Resume the most recent session for this project
  anvil --base-url <url>    LM Studio OpenAI base URL
  anvil --cwd <path>        Working directory

  anvil config              Show effective settings (no agent session)
  anvil config set model <id>
  anvil config set contextLength 65536
  anvil config unset model --project

Inside the TUI, /resume lists earlier sessions to switch between.

Environment:
  ANVIL_BASE_URL  ANVIL_MODEL  ANVIL_API_KEY

Config files:
  ~/.anvil/config.json      Global (preferred for model / context)
  .anvil/settings.json      Project overrides (wins over global)
`);
}
