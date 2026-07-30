# Anvil

Local Claude Code–like coding agent. Own agent loop and tools, powered by **LM Studio** (MLX on Apple Silicon). No LangChain. No Anthropic API required.

## Install (available in any directory)

```bash
cd ~/src/anvil
./install.sh
```

That links `~/.local/bin/anvil` → this repo (already on PATH on this machine). Then from any project:

```bash
anvil
anvil -p -y "list files and summarize README.md"
```

Re-run `./install.sh` after pulling updates. Uninstall: `bun run unlink:global`.

## Quick start (without global install)

1. Start LM Studio’s server and load a coding model (Air profile: `qwen/qwen3.5-9b` or similar).
2. From this repo:

```bash
bun install
bun run anvil
```

One-shot:

```bash
bun run anvil -- -p -y "list files and summarize README.md"
```

## Tools

| Tool | Purpose |
|------|---------|
| Read / Write / Edit | File operations |
| Glob / Grep | Find files and search contents (Grep supports content / files / count modes and context lines) |
| Bash | Shell commands (permission-gated) |
| WebSearch / WebFetch | Online docs and research |
| TodoWrite | Task checklist |
| Task | Isolated subagent |
| Skill | On-demand markdown playbooks |
| MCP `mcp_<server>_*` | External tools from config (registered with each server's own argument schema; non-read-only tools are permission-gated) |

## Modes

- **build** (default): full tools with permission prompts for Write/Edit/Bash
- **plan**: read-only (no Write/Edit/Bash) — `/mode plan`. Anvil first classifies the request:
  - **review** — you asked it to review, audit, assess or explain existing code. It reads the code and answers with findings and recommendations. It does *not* produce a plan describing how it would review something.
  - **research** — you asked for a change. It gathers a repository search and reads at least two files (and may keep investigating) before submitting a structured **PLAN FOR REVIEW**. Approve switches to build mode and implements the validated plan; decline requests a revision.
  - **clarify** — one question, only when a decision-critical requirement is missing.

Esc (or Ctrl+C) interrupts a running turn in the TUI, killing any command it spawned.
The interactive TUI uses the terminal alternate screen (fullscreen) and inherits your
terminal's background rather than painting its own.

### Date and time

The model has no clock, and its training cutoff is not "now". Every turn's system
prompt carries the current date and time, so anything time-relative ("today",
"how old is this release") is grounded rather than guessed. It defaults to UK time
and follows GMT/BST automatically; set `timezone` to any IANA zone, or to `auto`
to follow the host. `/status` shows what it currently thinks the time is.

### Colours

Anvil does not assume a dark terminal. At startup it asks the terminal for its actual
background colour and tunes every palette role until it clears a minimum contrast
ratio against it — WCAG AAA (7:1) for body text, AA (4.5:1) for anything carrying
meaning, less for rules and separators that should recede. Hue and saturation are
preserved, so the palette keeps its character on either theme.

If your terminal doesn't answer the query, set it explicitly:

```bash
anvil config set ui.theme dark     # or light, or auto (default)
```

### Slash commands

Enter `/` to open a completion menu. The same commands work in the TUI and the REPL.

| Command | Action |
|---------|--------|
| `/help` | Commands and keyboard shortcuts |
| `/clear` | Clear the transcript and start a fresh context |
| `/compact` | Summarize the conversation to free up context |
| `/status` | Model, mode, context usage, session id |
| `/resume` | Switch to an earlier session in this project (TUI only) |
| `/mode plan\|build` | Switch modes |
| `/config` | Interactive settings panel (TUI only) |
| `/retry` | Recheck the configured model server after an offline error |
| `/exit` | Leave Anvil |

### TUI keybinds

| Key | Action |
|-----|--------|
| Enter | Send message (queued if the agent is still working) |
| `@` | Reference a file (fuzzy picker over the project; `@~/…`, `@/…` or `@../…` browses outside it) |
| `/` | Slash-command menu; Tab completes |
| Ctrl+J / Shift+Enter | Insert newline |
| ↑ / ↓ | Recall previous prompts (moves the cursor inside a multi-line draft) |
| Home / End, Ctrl+A / Ctrl+E | Line start / end |
| Ctrl+G | Edit prompt in `$VISUAL` / `$EDITOR` / nvim |
| Ctrl+O | Expand or collapse tool output |
| Esc | Interrupt (busy); dismiss a picker; in Vim insert → normal; otherwise clear input |
| Ctrl+C | Interrupt while busy; otherwise press twice to exit |
| PgUp / PgDn | Browse the full transcript; PgDn returns to live output |
| Shift+Tab | Toggle plan ↔ build (disabled while a plan is awaiting review) |
| ↑↓ + Enter, or 1 / 2 / 3 | Answer an approval prompt: allow once / don't ask again for this file or command / deny |

Paste inserts at the cursor (bracketed paste). Large pastes show a short status notice.

Write and Edit actions are restricted to the project directory by default, including
symlink-aware checks. Approval prompts show a syntax-highlighted unified diff of
exactly what will change before the action runs. Resumed TUI sessions restore their
visual transcript when it is available; older sessions still retain their model
conversation context.

**Vim mode** (`ui.editorMode: "vim"` via `/config` or `anvil config set ui.editorMode vim`): Esc enters normal mode (`hjkl`, `i`/`a`/`I`/`A`, `x`, `dd`, `w`/`b`, `o`/`O`).

## Config

Prefer the TUI `/config` panel or the CLI (writes `~/.anvil/config.json` by default):

```bash
anvil config                          # effective values + which file won
anvil config set model qwen/qwen3.6-27b
anvil config set ui.editorMode vim
anvil config set ui.editor nvim
anvil config set ui.theme auto        # auto | dark | light
anvil config set timezone Europe/London   # IANA zone, or "auto" for the host
anvil config set contextLength 65536
anvil config unset model --project    # stop a repo from overriding global
anvil config edit                     # open global config in $EDITOR
```

Precedence: **default → global → project → env → CLI (`-m`)**.

Example `~/.anvil/config.json`:

```json
{
  "baseURL": "http://localhost:1234/v1",
  "timezone": "Europe/London",
  "model": "qwen/qwen3.6-27b",
  "contextLength": 65536,
  "maxSteps": 40,
  "ui": {
    "editorMode": "emacs",
    "editor": "nvim",
    "theme": "auto"
  },
  "skills": {
    "autoDetect": true,
    "always": [],
    "recommendOnly": true,
    "maxInjectSkills": 3,
    "maxInjectChars": 8000
  },
  "context": {
    "anvilMd": true,
    "projectContext": true,
    "localContext": true,
    "maxChars": 6000
  },
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

Project overrides (optional): `.anvil/settings.json`

| Path | Purpose |
|------|---------|
| `ANVIL.md` | Committed project instructions (always in system prompt, truncated) |
| `.anvil/CONTEXT.md` | Optional committed extra context |
| `~/.anvil/projects/<hash>/CONTEXT.md` | Machine-only notes for this repo |
| `skills/builtin/…` | Shipped skill pack |
| `~/.anvil/skills/<name>/SKILL.md` | User skills |
| `.anvil/skills/<name>/SKILL.md` | Project skills (override user/builtin by name) |
| `~/.anvil/projects/<hash>/*.jsonl` | Sessions |

### Skills & stack detection

Anvil ships a curated pack: `docs`, `shadcn`, `frontend`, `api`, `database`, `testing`.

- The system prompt lists **name + description** only (token-cheap).
- The model loads full playbooks with the **Skill** tool when planning/implementing.
- With `skills.autoDetect` (default), Anvil scans `package.json`, `components.json`, Prisma/Drizzle configs, etc., then prints **Detected stack** and **Recommended skills**.
- `skills.always`: inject those skill bodies into every turn (capped by `maxInjectSkills` / `maxInjectChars`).
- `skills.recommendOnly: false`: also inject recommended skill bodies (same caps).

Skill resolution order (later wins): **builtin → user → project**.

### ANVIL.md template

```markdown
# Project notes

## Stack & commands
- Runtime / package manager
- Dev: `…`  Test: `…`  Typecheck: `…`

## Architecture
- App layout and important boundaries

## Conventions
- Naming, folders, do/don't

## Agent
- Prefer skills: … (or set `"skills": { "always": ["…"] }` in `.anvil/settings.json`)
```

## CLI

```
anvil                     # TUI when interactive
anvil --repl              # classic readline REPL
anvil -p "prompt"         # one-shot (implies -y)
anvil --mode plan
anvil -m <model>
anvil config
anvil config set model <id>
anvil --resume <session-id>
anvil -c                  # resume the most recent session here
anvil --base-url http://localhost:1234/v1
```

## Stack

Bun + TypeScript, Vercel AI SDK (`streamText` + tools), OpenTUI TUI, MCP SDK, LM Studio OpenAI-compatible API.
