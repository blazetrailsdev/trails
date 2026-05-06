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

| ID       | Description                                         | Status                                                  |
| -------- | --------------------------------------------------- | ------------------------------------------------------- |
| TS-1     | `defineSchema()` test helper                        | ✅ #1201                                                |
| TS-2     | `dropAllTables()` test helper                       | ✅ #1202                                                |
| TS-3     | `AR_NO_AUTO_SCHEMA` env flag                        | ✅ #1203                                                |
| TS-3-fix | env flag read per-call so `vi.stubEnv` engages      | ✅ #1216                                                |
| TS-4a    | Migrate `join-model.test.ts` (canary)               | ✅ #1204                                                |
| TS-4a-2  | Flip env flag for join-model + drop #1200 hacks     | ✅ #1215                                                |
| TS-4b    | validations batch (7 files)                         | ✅ #1206                                                |
| TS-4c    | timestamp + serialization (2 files)                 | ✅ #1210                                                |
| TS-4d    | callbacks (1 file)                                  | ✅ #1211                                                |
| TS-4e    | transactions (1 file)                               | ✅ #1212                                                |
| TS-4f    | small-file batch (12 files)                         | ✅ #1213                                                |
| TS-4g    | medium-file batch (10 files)                        | ✅ #1214                                                |
| TS-4h    | small/medium batch (10 files)                       | ✅ #1217                                                |
| TS-4i    | test-databases/defaults/explain/json-ser. (6 files) | ✅ #1218                                                |
| TS-4j    | dirty/store/serialized-attribute (3 files)          | ✅ #1219                                                |
| TS-4l    | `relation.test.ts` (1 file)                         | ✅ #1221                                                |
| TS-4m    | `base.test.ts` (1 file, biggest)                    | ✅ #1234                                                |
| TS-4…    | remaining association / large-file batches          | ⏳ in flight (48 / 162 files migrated as of 2026-05-06) |
| TS-final | Delete dynamic adapter + HABTM shims                | ⏳ blocked on TS-4 completion                           |

## Known flaky tests (resolved)

The flaky `AssociationsJoinModelTest` cases that motivated this work were not, in the end, caused by the dynamic test-adapter's recovery path. The real cause was diagnosed in [docs/ar-test-parallelism-plan.md](./ar-test-parallelism-plan.md): vitest's `--no-file-parallelism` flag had been silently dropped (PR #1092), workers monotonic-incrementing `VITEST_WORKER_ID` modulo-collided onto the same `rails_js_test_N` DB, and worker B's `dropAllTables` afterAll landed inside worker A's `defineSchema` sequence. Fixed by the PR-P1..P6 advisory-lock parallelism work (#1222–#1228).

The schema-migration plan still stands on its own merits — explicit schema is clearer, kills the recovery-path-masks-bugs problem, and lets `test-adapter.ts` shrink to ≤200 LOC. But the original "join-model PG flake" is no longer a TS-final blocker.

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

### Resolved limitation (TS-3 #1203)

The TS-4a canary documented a redundant-ALTER noise problem: `defineSchema()` wrote DDL through `SchemaAdapter`, which only recorded the `id` column in `_createdColumns`, so the next `processPendingModels` pass re-issued `ALTER TABLE ADD COLUMN` for every declared column (each erroring "column already exists" and being caught silently). TS-3 (`AR_NO_AUTO_SCHEMA=1`) eliminates this entirely — with the flag on, `processPendingModels` short-circuits and the redundant ALTERs never run. Migrated files now set the flag at module load (`vi.stubEnv("AR_NO_AUTO_SCHEMA", "1")`); see TS-3-fix #1216 for the per-call read that makes `vi.stubEnv` engage.
