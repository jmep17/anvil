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
| Glob / Grep | Find files and search contents |
| Bash | Shell commands (permission-gated) |
| WebSearch / WebFetch | Online docs and research |
| TodoWrite | Task checklist |
| Task | Isolated subagent |
| Skill | On-demand markdown playbooks |
| MCP `mcp_<server>_*` | External tools from config |

## Modes

- **build** (default): full tools with permission prompts for Write/Edit/Bash
- **plan**: read-only (no Write/Edit/Bash) — `/mode plan`

Esc interrupts a running turn in the TUI. The interactive TUI uses the terminal alternate screen (fullscreen).

### TUI keybinds

| Key | Action |
|-----|--------|
| Enter | Send message |
| Ctrl+J / Shift+Enter | Insert newline |
| Arrow keys / Home / End | Move cursor in the prompt |
| Ctrl+A / Ctrl+E | Line start / end |
| Ctrl+G | Edit prompt in `$VISUAL` / `$EDITOR` / nvim |
| Esc | Interrupt (busy); in Vim insert → normal; otherwise clear input |
| PgUp / PgDn | Browse the full transcript; PgDn returns to live output |
| Shift+Tab | Toggle plan ↔ build |
| a / A / d | Allow once / allow the exact same action for this session / deny |
| `/config` | Interactive settings panel (model, editor mode, …) |
| `/retry` | Recheck the configured model server after an offline error |

Paste inserts at the cursor (bracketed paste). Large pastes show a short status notice.

Write and Edit actions are restricted to the project directory by default, including
symlink-aware checks. Approval prompts show a compact content/diff preview before
the action runs. Resumed TUI sessions restore their visual transcript when it is
available; older sessions still retain their model conversation context.

**Vim mode** (`ui.editorMode: "vim"` via `/config` or `anvil config set ui.editorMode vim`): Esc enters normal mode (`hjkl`, `i`/`a`/`I`/`A`, `x`, `dd`, `w`/`b`, `o`/`O`).

## Config

Prefer the TUI `/config` panel or the CLI (writes `~/.anvil/config.json` by default):

```bash
anvil config                          # effective values + which file won
anvil config set model qwen/qwen3.6-27b
anvil config set ui.editorMode vim
anvil config set ui.editor nvim
anvil config set contextLength 65536
anvil config unset model --project    # stop a repo from overriding global
anvil config edit                     # open global config in $EDITOR
```

Precedence: **default → global → project → env → CLI (`-m`)**.

Example `~/.anvil/config.json`:

```json
{
  "baseURL": "http://localhost:1234/v1",
  "model": "qwen/qwen3.6-27b",
  "contextLength": 65536,
  "maxSteps": 40,
  "ui": {
    "editorMode": "emacs",
    "editor": "nvim"
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
anvil --base-url http://localhost:1234/v1
```

## Stack

Bun + TypeScript, Vercel AI SDK (`streamText` + tools), Ink TUI, MCP SDK, LM Studio OpenAI-compatible API.
