# Anvil project notes

This repository is the Anvil coding agent itself.

- Prefer Bun for scripts and the CLI (`bun run anvil`).
- Keep the agent loop thin; tools live under `src/tools/`.
- Do not add LangChain.
