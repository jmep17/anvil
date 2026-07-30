#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { ensureAnvilHome, loadConfig } from "./config/load.ts";
import type { AgentMode } from "./config/types.ts";
import { SessionStore } from "./session/store.ts";
import { runRepl } from "./ui/repl.ts";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
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

function printHelp(): void {
  console.log(`anvil — local Claude Code–like coding agent

Usage:
  anvil                     Interactive session (TUI if tty, else REPL)
  anvil -p "prompt"         One-shot prompt (auto-approve tools)
  anvil --repl              Force classic REPL
  anvil --tui               Force Ink TUI
  anvil --mode plan|build   Start in plan (read-only) or build mode
  anvil -m <model>          Override model id
  anvil --resume <id>       Resume a session id
  anvil --base-url <url>    LM Studio OpenAI base URL
  anvil --cwd <path>        Working directory

Environment:
  ANVIL_BASE_URL  ANVIL_MODEL  ANVIL_API_KEY

Config:
  ~/.anvil/config.json
  .anvil/settings.json
  ANVIL.md / .anvil/CONTEXT.md
  ~/.anvil/projects/<hash>/CONTEXT.md  (local notes)
  Skills: builtin + ~/.anvil/skills + .anvil/skills
`);
}

async function main(): Promise<void> {
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

  const session = values.resume
    ? await SessionStore.open(cwd, String(values.resume))
    : await SessionStore.create(cwd);

  const prompt = values.print
    ? positionals.join(" ").trim() || undefined
    : positionals.length
      ? positionals.join(" ").trim()
      : undefined;

  const yes = Boolean(values.yes) || Boolean(values.print);
  const wantTui =
    Boolean(values.tui) ||
    (!values.repl && !values.print && process.stdout.isTTY && !prompt);

  if (wantTui && !values.repl) {
    try {
      const { runTui } = await import("./ui/App.tsx");
      await runTui({ config, cwd, session, yes, prompt });
      return;
    } catch (err) {
      console.error("TUI failed, falling back to REPL:", err instanceof Error ? err.message : err);
    }
  }

  await runRepl({
    config,
    cwd,
    session,
    prompt: prompt || (values.print ? "" : undefined),
    yes,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
