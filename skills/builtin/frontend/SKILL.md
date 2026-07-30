---
name: frontend
description: React/Next (and similar) UI patterns — components, forms, data fetching boundaries. Use for frontend feature planning and implementation.
triggers: [frontend, react, next, ui, page, component]
detect: [frontend, react, next]
---

# Frontend

## Boundaries

- **Server vs client**: default to server components / server data loading when the stack supports it; push `"use client"` to leaves.
- **Data**: fetch close to the owner (RSC, loader, or query hook already used in the repo). Do not introduce a second data library.
- **Routing**: follow existing app/pages router conventions; colocate feature UI with the route when that is the project norm.

## UI structure

- One clear composition per view; avoid dashboard clutter on marketing/simple screens.
- Reuse design-system / shadcn primitives when present (load the `shadcn` skill).
- Prefer focused components over mega-files; extract hooks for reusable stateful logic.

## Forms & feedback

- Validate on the boundary the project already uses (zod schemas, server actions, API).
- Show loading and error states consistent with neighboring screens.
- Optimistic updates only when the codebase already patterns them.

## Plan checklist

- [ ] Where does data come from? Who owns mutations?
- [ ] Server/client split
- [ ] Existing components and layout shells to reuse
- [ ] Empty, loading, and error states
- [ ] Verification: typecheck / lint / relevant UI test
