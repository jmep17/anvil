---
name: docs
description: Research library documentation with WebSearch and WebFetch. Use for API/library/version questions.
triggers: [docs, documentation, api reference, library]
detect: []
---

# Docs research

1. Use WebSearch with the library name + version + topic.
2. WebFetch the official docs URL from the results.
3. Summarize only what is needed for the current task.
4. Cite URLs in the final answer.

## Do

- Prefer official docs over blog posts when both appear.
- Pin version in the search query when the project lockfile implies one.
- Keep excerpts short; quote only critical signatures or config keys.

## Don't

- Dump entire fetched pages into the reply.
- Invent APIs when fetch fails — say what you could not verify.
