---
name: shadcn
description: Build UI with shadcn/ui — components.json, CLI add, composition, theming, accessibility. Use when the project has components.json or shadcn/Radix UI.
triggers: [shadcn, components.json, radix, ui component]
detect: [shadcn]
---

# shadcn/ui

## Workflow

1. Read `components.json` for aliases (`@/components`), style, RSC, and Tailwind paths.
2. Prefer existing components under the configured UI path before adding new ones.
3. Add missing primitives with the project’s package manager, e.g. `npx shadcn@latest add button`.
4. Compose pages from primitives; do not reimplement Button/Dialog/Form from scratch.

## Do

- Match existing spacing, typography, and `cn()` / CVA patterns in the repo.
- Keep server/client boundaries: mark interactive pieces `"use client"` only when needed.
- Wire forms with the project’s form library if already present (e.g. react-hook-form + zod).
- Preserve accessibility: labels, focus, keyboard, `Dialog`/`Sheet` titles.

## Don't

- Invent a parallel design system beside shadcn.
- Copy large example pages from docs without adapting to local layout and tokens.
- Skip checking whether a component is already installed.

## Plan checklist

- [ ] Confirm `components.json` and alias paths
- [ ] List components to reuse vs `shadcn add`
- [ ] Note client boundaries and data-fetching ownership
- [ ] Theme/tokens: CSS variables in globals, not one-off colors
