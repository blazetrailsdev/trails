# Explicit test schema migration plan

The dynamic test-adapter (`packages/activerecord/src/test-adapter.ts`) creates
tables on demand from model `attribute()` introspection and recovers from
missing-table / missing-column errors by parsing the failing SQL and issuing
ALTER TABLE. That works in isolation but is fragile across files in a shared
worker — PG and MariaDB both share a singleton `_sharedAdapter` per worker, so
any drift in `_declaredColumns` or in the recovery-path heuristics can survive
into the next file's tests.

The plan is to migrate test files to declare their schema explicitly via
`defineSchema()`, so the dynamic CREATE-IF-NOT-EXISTS path becomes a no-op
and the recovery path never needs to fire.

## Tickets

| ID    | Description                                          | Status          |
| ----- | ---------------------------------------------------- | --------------- |
| TS-1  | `defineSchema()` test helper                         | ✅ #1201        |
| TS-2  | `dropAllTables()` test helper                        | 🟡 #1202 (open) |
| TS-3  | Env flag to disable the dynamic auto-schema path     | ⏳ not started  |
| TS-4a | Migrate `join-model.test.ts` (canary)                | ✅ this PR      |
| TS-4… | Migrate remaining association/STI/polymorphic suites | ⏳ scheduled    |

## Known flaky tests

| Test                                                                      | Diagnosed root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Fix                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `AssociationsJoinModelTest > has many with multiple authors` (PG/MariaDB) | **Partially diagnosed.** Initial hypothesis was cross-file `_declaredColumns` drift in the recovery path, but on the shared CI PG instance, removing PR #1200's id-set filter caused all three assertions to deterministically return empty result sets — not extra rows, not wrong types. defineSchema is necessary but not sufficient; some additional cross-file mechanism (likely modelRegistry STI scoping or shared adapter state) is also at play. Pending TS-3 (env flag to disable the dynamic adapter) for full removal of the workaround. | TS-3 (workaround retained for now) |

## Migration pattern (TS-4a canary)

```ts
import { defineSchema } from "../test-helpers/define-schema.js";

beforeEach(async () => {
  adapter = createTestAdapter();
  await defineSchema(adapter, {
    authors: { name: "string" },
    posts: { author_id: "integer", title: "string", body: "string", type: "string" },
    tags: { name: "string" },
    taggings: { tag_id: "integer", taggable_id: "integer", taggable_type: "string" },
  });
  // ...attach adapter and registerModel
});
```

After this, `_declaredColumns` is irrelevant for the named tables — the
schema is whatever `defineSchema` wrote, not whatever sibling files happened
to register first.

### Known limitation (deferred to TS-3)

`defineSchema()` writes DDL through `SchemaAdapter`, which only records
the `id` column in `_createdColumns`. The next `processPendingModels`
pass therefore emits a redundant `ALTER TABLE ADD COLUMN` per declared
column; each errors with "column already exists" and is caught silently.
This is benign (savepoint-wrapped, no transaction poisoning) but adds
noise. Fixing it cleanly requires either bypassing `SchemaAdapter` to
the inner driver, or letting `defineSchema` populate the tracking maps —
both of which need changes inside `test-adapter.ts`. That file is
reserved for TS-3, so the optimization rides along when TS-3 lands the
env flag to disable the dynamic adapter path entirely.
