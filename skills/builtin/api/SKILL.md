---
name: api
description: HTTP/route handler design — validation, errors, auth boundaries. Use when adding or changing API endpoints or server actions.
triggers: [api, endpoint, route, handler, rest, rpc]
detect: [api]
---

# API design

## Shape

- Follow existing route layout (e.g. `app/api`, `server/`, Hono/Express routers).
- One resource concern per handler group; keep auth and validation at the edge.
- Prefer typed inputs (zod / schema already in repo) and stable JSON error shapes.

## Do

- Validate and sanitize all external input before business logic.
- Return appropriate status codes; reuse the project’s error helper if one exists.
- Keep secrets and privileged checks on the server; never trust client role flags alone.
- Make handlers idempotent when retries are likely (webhooks, payments).

## Don't

- Leak stack traces or internal IDs in production responses.
- Duplicate business logic in multiple handlers — extract a shared service/module.
- Add a new framework when a thin route in the current stack suffices.

## Plan checklist

- [ ] Method, path, auth requirement
- [ ] Request/response schema
- [ ] Error cases and status codes
- [ ] Side effects (DB, queues, email) and transaction boundaries
- [ ] How to verify (curl, test, or existing API test harness)
