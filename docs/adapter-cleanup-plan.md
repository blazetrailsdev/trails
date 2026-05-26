# Adapter → Connection Collapse Plan

Goal: eliminate the `adapter` concept entirely. Rails has no "adapter"
property on models — models have `connection` (returns an
`AbstractAdapter`). Our codebase has **two parallel checkout paths**:

1. `Base.adapter` (getter in `base.ts`) — the old path. Caches a checkout
   on `_adapter`, wires arel visitors, used by ~165 call sites across ~34
   source files.
2. `Base.connection` (from `connection-handling.ts`) — the newer pool-based
   path. Returns the pool's active connection or leases a new one
   (`pool.activeConnection ?? pool.leaseConnection()`, with a
   permanent-lease fast path), used by ~6 source files.

The `adapter` getter, `_adapter` field, `DatabaseAdapter` interface, and
`adapter.ts` barrel are all trails-isms. They must go.

**Why now:** Phase D landed connection-handler resolution, but ~34 files
still route through the old `adapter` getter instead of the pool-based
`connection`. Two checkout paths = two caching strategies = subtle bugs
when they disagree.

**Done-when:**

- `Base.adapter` getter and `_adapter` field are deleted.
- `set adapter()` renamed to `set connection()` (deprecated, transitional —
  full removal is a non-goal of this plan, see below).
- All source call sites use `Base.connection` (the pool-based path).
- Tests continue working via a `static get adapter()` compatibility alias
  that forwards to `connection` (removed during Phase G fixture adoption).
- `DatabaseAdapter` interface is deleted; all types use `AbstractAdapter`.
- `adapter.ts` barrel is deleted; surviving exports relocate to
  `connection-adapters/`.
- No `as any` casts remain for connection access.

**Scale:** ~165 `.adapter` call sites in ~34 source files, ~7000 references
across ~182 test files, ~38 files import `DatabaseAdapter`.

**Test strategy:** Tests reference `.adapter` extensively (~7000 sites
across ~182 files). Rather than skipping tests during Phases 1–2, PR 1a
adds a temporary `static get adapter()` compatibility alias that forwards
to `connection`. This keeps CI green throughout. The alias is removed
during Phase G (fixture adoption), which already touches these same files
— no separate test sweep needed.

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
descendant cache cascade, model registration. It exists because ~6900
test sites do `this.adapter = adapter` in `static {}` blocks — a
trails-ism (Rails tests use `establish_connection`, never direct
assignment). This plan renames it to `set connection()` as a transitional
step; a future plan converts tests to `establishConnection` and deletes
the setter entirely.

**Scope:**

- `base.ts`: delete `static get adapter()`, `_adapter` field,
  `_wireArelVisitor` helper, and the inline descendant-invalidation loop
  in `set adapter()`.
- `base.ts`: rename `static set adapter()` → `static set connection()`,
  keep schema-invalidation logic intact. Mark `@internal` + add a
  `@deprecated Use establishConnection() instead` JSDoc.
- `base.ts`: add `static get adapter()` compatibility alias that
  forwards to `this.connection` (keeps ~7000 test sites working).
- `connection-adapters/abstract-adapter.ts`: wire arel visitor in
  constructor (matching Rails).

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

## Phase G intersection — test files handled by fixture adoption

~7000 `.adapter` references across ~182 test files overlap almost
entirely with the ~150-200 files Phase G (fixture adoption) already
plans to rewrite. Phase G replaces inline `Model.create()` with
`useFixtures()` and will rename `.adapter` → `.connection` in the same
pass. No separate test sweep is needed here.

The compatibility alias (`static get adapter()`) bridges the gap:
Phases 1–2 ship with CI green, then Phase G batches remove the alias
usage file-by-file. The alias itself is deleted when the last Phase G
batch lands.

See: `docs/connection-pooled-test-adapter-plan.md` (Phase G sequencing),
`docs/fixtures-port-plan.md` (fixture data source),
memory `project-phase-g-fixture-adoption-epic` (sizing).

---

## Ordering

```
              PR 1a (collapse getters + compat alias)
             ╱                              ╲
PR 1b (source call-site rename)    PR 2a (DatabaseAdapter → AbstractAdapter)
             ╲                              ╱
              PR 2b (delete adapter.ts)
                        ↓
              Phase G batches (fixture adoption + .adapter→.connection in tests)
                        ↓
              Final: delete compatibility alias
```

PR 1a is the only prerequisite — it creates `set connection()`,
adds the `get adapter()` compatibility alias, and deletes the old
getter/caching/wiring. After 1a lands, PRs 1b and 2a are independent
(1b renames runtime call sites, 2a swaps type annotations) and can
ship in parallel. PR 2b depends on both 1b and 2a (can't delete
`adapter.ts` until nothing imports from it). Phase G depends on 2b
and handles all test-file changes.

All PRs branch from `main` (no stacking).

## Non-goals (this plan)

- **Deleting `set connection()` and the `get adapter()` compat alias** —
  requires converting ~6900 test sites to `establishConnection()`. The
  compat alias is consumed by Phase G (fixture adoption); the setter
  removal is a separate initiative after Phase G lands.
- Renaming `connection-adapters/` directory or `AbstractAdapter` class
  (those already match Rails).
- `withConnection { }` block semantics (future pool lifecycle work).
- `connectedTo()` role-switching API (separate initiative).
