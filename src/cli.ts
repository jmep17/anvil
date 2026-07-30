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
  const session = values.resume
    ? await SessionStore.open(cwd, String(values.resume))
    : await SessionStore.create(cwd);

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
  anvil --tui               Force Ink TUI
  anvil --mode plan|build   Start in plan (read-only) or build mode
  anvil -m <model>          Override model id for this run
  anvil --resume <id>       Resume a session id
  anvil --base-url <url>    LM Studio OpenAI base URL
  anvil --cwd <path>        Working directory

  anvil config              Show effective settings (no agent session)
  anvil config set model <id>
  anvil config set contextLength 65536
  anvil config unset model --project

Environment:
  ANVIL_BASE_URL  ANVIL_MODEL  ANVIL_API_KEY

Config files:
  ~/.anvil/config.json      Global (preferred for model / context)
  .anvil/settings.json      Project overrides (wins over global)
`);
}
