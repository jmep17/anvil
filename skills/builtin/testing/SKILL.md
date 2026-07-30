---
name: testing
description: What and how to test — unit, integration, e2e — and the verify-after-change loop. Use when adding features or fixing bugs.
triggers: [test, testing, vitest, jest, playwright, coverage]
detect: [testing]
---

# Testing

## Strategy

- Prefer tests that lock behavior at the right layer: pure logic unit tests; API/DB integration where boundaries matter; e2e sparingly for critical flows.
- Mirror the project’s runner (vitest, jest, bun test, playwright) and folder layout (`*.test.ts`, `__tests__`, `e2e/`).

## After code changes

1. Run the narrowest relevant test or typecheck first.
2. Expand to the package/app suite if the change crosses modules.
3. Fix failures before declaring done.

## Do

- Test edge cases and error paths for new logic.
- Use existing fixtures/factories/mocks; do not invent a parallel test util stack.
- Keep tests deterministic (no flaky sleeps; mock time/network).

## Don't

- Snapshot huge UI trees unless the repo already relies on them.
- Skip verification because “it looks right.”
- Add e2e for every unit-sized change.

## Plan checklist

- [ ] What behavior must not regress?
- [ ] Unit vs integration vs e2e
- [ ] Commands to run (`bun test`, `npm test`, etc.)
- [ ] New fixtures or mocks needed
