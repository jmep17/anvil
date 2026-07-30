---
name: database
description: Schema, migrations, and query patterns (Prisma/Drizzle and similar). Use when changing models or data access.
triggers: [database, prisma, drizzle, sql, schema, migration]
detect: [database, prisma, drizzle]
---

# Database

## Schema & migrations

- Prefer additive, reversible migrations; never edit applied migration history casually.
- Name models/tables consistently with existing conventions.
- Add indexes for foreign keys and hot filter columns you actually query.

## Queries

- Load only needed columns/relations; avoid N+1 (use `include`/`with` or batching the project already uses).
- Keep write paths transactional when multiple rows must succeed or fail together.
- Put shared queries in a repository/data module if the repo already has that layer.

## Do

- Read the current schema file before proposing changes.
- Match the ORM already in the project (Prisma vs Drizzle vs raw SQL).
- Consider backfills for new non-null columns.

## Don't

- Run destructive migrations without an explicit user request and a rollback story.
- Embed complex business rules only in DB triggers unless the project already does.

## Plan checklist

- [ ] Schema diff and migration steps
- [ ] Query paths touched (read/write)
- [ ] Indexes and constraints
- [ ] Backfill / nullability
- [ ] How to verify (migrate + targeted test or script)
