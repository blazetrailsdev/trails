# Adapter → Connection Collapse Plan

Goal: eliminate the `adapter` concept entirely. Rails has no "adapter"
property on models — models have `connection` (returns an
`AbstractAdapter`). Our codebase has **two parallel checkout paths**:

1. `Base.adapter` (getter in `base.ts`) — the old path. Caches a checkout
   on `_adapter`, wires arel visitors, used by ~165 call sites across ~34
   source files.
2. `Base.connection` (from `connection-handling.ts`) — the newer pool-based
   path. Delegates to `connectionPool().leaseConnection()`, used by ~6
   source files.

The `adapter` getter, `_adapter` field, `DatabaseAdapter` interface, and
`adapter.ts` barrel are all trails-isms. They must go.

**Why now:** Phase D landed connection-handler resolution, but ~34 files
still route through the old `adapter` getter instead of the pool-based
`connection`. Two checkout paths = two caching strategies = subtle bugs
when they disagree.

**Done-when:**

- `Base.adapter` getter, `_adapter` field, and `set adapter()` are deleted.
- All call sites use `Base.connection` (the pool-based path).
- `DatabaseAdapter` interface is deleted; all types use `AbstractAdapter`.
- `adapter.ts` barrel is deleted; surviving exports relocate to
  `connection-adapters/`.
- No `as any` casts remain for connection access.

**Scale:** ~165 `.adapter` call sites in ~34 source files, ~7000 references
across ~182 test files, ~38 files import `DatabaseAdapter`.

**Test strategy:** Tests reference `.adapter` extensively (~7000 sites
across ~182 files). During implementation PRs, skip tests that break and
list them in the PR body. The test sweep is a separate set of PRs at the
end.

---

## Phase 1 — Collapse the two getters (2 PRs)

### PR 1a — Delete `adapter` getter, relocate its side effects

The `adapter` getter does two things `connection` doesn't. Neither belongs
in `connection` — Rails' `connection` is a bare pool delegation
(`connection_pool.lease_connection` / `.active_connection`, see
`connection_handling.rb:274`).

1. **Per-class caching on `_adapter`** — Rails doesn't cache on the model
   class; `connection` delegates to the pool every time. Delete it.
2. **Arel-visitor wiring (`_wireArelVisitor`)** — sets a global
   `setToSqlVisitor` singleton. In Rails this happens in
   `AbstractAdapter#initialize` (`@visitor = arel_visitor`,
   `abstract_adapter.rb:155`). Move it there.

The setter (`set adapter()`) does real work: schema invalidation,
descendant cache cascade, model registration. This logic needs a new home
— likely `set connection()` on Base, since Rails doesn't have a
`Base.connection =` setter but we need one for test convenience (the
`Model.adapter = x` pattern is pervasive in tests). Flag it with
`@internal` as a trails-ism.

**Scope:**

- `base.ts`: delete `static get adapter()`, `static set adapter()`,
  `_adapter` field, `_wireArelVisitor`, `clearAdapterFromDescendants`.
- `base.ts`: add `@internal static set connection()` carrying the
  schema-invalidation logic from the old setter.
- `connection-adapters/abstract-adapter.ts`: wire arel visitor in
  constructor (matching Rails).
- Skip tests that break; list in PR body.

**Verify:** `pnpm vitest run packages/activerecord/src/base.test.ts`

**LOC estimate:** ~200

### PR 1b — Source call-site migration: `.adapter` → `.connection`

Mechanical rename across ~34 non-test source files (~165 call sites). No
behavioral change — every site calls the same pool-checkout path.

**Scope:**

| Layer        | Files                                                                   | Pattern                                        |
| ------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Relation     | `relation.ts`, `query-methods.ts`, `calculations.ts`                    | `modelClass.adapter` → `modelClass.connection` |
| Associations | `preloader/association.ts`, `association-scope.ts`, `collection-*.ts`   | `klass.adapter` → `klass.connection`           |
| Persistence  | `persistence.ts`, `insert-all.ts`, `locking/pessimistic.ts`             | `ctor.adapter` → `ctor.connection`             |
| Querying     | `querying.ts`, `sanitization.ts`, `explain.ts`                          | `.adapter` → `.connection`                     |
| Validations  | `validations/uniqueness.ts`                                             | fallback chain → single `.connection`          |
| Schema       | `schema.ts`, `schema-dumper.ts`, `model-schema.ts`, `migration.ts`      | `.adapter` → `.connection`                     |
| Other        | `timestamp.ts`, `touch-later.ts`, `transactions.ts`, `suppressor.ts`, … | `.adapter` → `.connection`                     |

Note: `InsertAll` has only 1 `.adapter` ref (already cleaned up).
`JoinDependency` has 0 (cleaned up in #2387).

**Verify:** `grep -rn '\.adapter\b' packages/activerecord/src/ --include='*.ts' | grep -v test | grep -v connection-adapters | grep -v adapter.ts` returns zero.

**LOC estimate:** ~250

---

## Phase 2 — Delete `DatabaseAdapter` interface (2 PRs)

### PR 2a — Type constraints: `DatabaseAdapter` → `AbstractAdapter`

~38 files import `DatabaseAdapter`. Every type annotation, generic
constraint, and parameter switches to `AbstractAdapter`.

**Scope:**

- Host interfaces on Relation, QueryMethods, etc.
- Constructor params on `InsertAll`, `SchemaStatements`, etc.
- `connection-handling.ts` return types.

**Verify:** `pnpm test:types`

**LOC estimate:** ~200

### PR 2b — Delete `adapter.ts`, relocate survivors

`adapter.ts` exports more than just `DatabaseAdapter`. Surviving exports
move to their Rails-natural homes:

- `AdapterName`, `adapterNameFromConfig` →
  `connection-adapters/abstract-adapter.ts` (Rails' `adapter_name`).
- `TrailsAdapterOptions`, `SQLite3AdapterOptions`,
  `MysqlAdapterOptions`, `PostgreSQLAdapterOptions` →
  `connection-adapters/pool-config.ts` (connection-establishment config).
- `ExplainOption`, `inspectExplainOption` →
  `connection-adapters/abstract/database-statements.ts`.
- Delete `adapter.ts`.
- Update `index.ts` re-exports.

**Verify:** `pnpm test:types` + grep for dead imports.

**LOC estimate:** ~150

---

## Phase 3 — Test sweep (multiple PRs)

~7000 `.adapter` references across ~182 test files. This is mechanical
but too large for a single PR. Split by test directory / concern area,
~250 LOC each.

Each PR:

- `.adapter` → `.connection` in test setup, assertions, and helpers.
- Mock adapters typed against `AbstractAdapter` instead of
  `DatabaseAdapter`.
- Un-skip any tests that were skipped during Phases 1–2.

Exact PR count TBD — estimate 4–8 PRs depending on how references
cluster. `createTestAdapter()` and other shared test helpers should be
updated in the first Phase 3 PR so subsequent ones are pure renames.

---

## Ordering

```
              PR 1a (delete adapter getter)
             ╱                              ╲
PR 1b (source call-site rename)    PR 2a (DatabaseAdapter → AbstractAdapter)
             ╲                              ╱
              PR 2b (delete adapter.ts)
                        ↓
              PR 3.1 (test helpers + first batch)
                        ↓
              PR 3.2 … 3.N (remaining test batches)
```

PR 1a is the only prerequisite — it creates `set connection()` and
deletes `adapter`. After 1a lands, PRs 1b and 2a are independent (1b
renames runtime call sites, 2a swaps type annotations) and can ship in
parallel. PR 2b depends on both 1b and 2a (can't delete `adapter.ts`
until nothing imports from it). Phase 3 depends on 2b (tests import
`DatabaseAdapter` and use `.adapter` — both must be gone first).

All PRs branch from `main` (no stacking).

## Non-goals (this plan)

- Renaming `connection-adapters/` directory or `AbstractAdapter` class
  (those already match Rails).
- `withConnection { }` block semantics (future pool lifecycle work).
- `connectedTo()` role-switching API (separate initiative).
