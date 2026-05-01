# Arel Alignment Plan

Implementation plan to bring `packages/arel/` into behavioral alignment with
Rails v8.0.2 (`scripts/api-compare/.rails-source/activerecord/lib/arel/`).

Each PR below targets ≤300 LOC. Order is roughly by SQL-correctness impact;
PRs marked **independent** can be parallelized. Trails files are paths under
`packages/arel/src/`. Rails files are paths under
`scripts/api-compare/.rails-source/activerecord/lib/arel/`.

---

## Sequencing

Waves 1 and 2 (PRs 1–9, 11–23, 23b, 23c) are merged — see **Completed**
below for the full list. Remaining work, grouped by type:

- **Node-shape parity** (Rails class hierarchy / field shapes):
  PRs **24** (`Binary` reparenting), **26** (`BoundSqlLiteral` →
  `sqlWithSubstitutes` + `bindValues`).
- **Visitor formatting** (visitor-internal SQL bugs): PR **25a**
  (MySQL `Concat`/`Cte`).
- **Cross-package wiring** (arel ↔ activerecord seams):
  PRs **10** (`Table#[]` alias resolution via `klass` ref), **25b**
  (visitors accept a `Quoting` quoter at construction).

Wave order (when to ship):

| Wave | PRs         | Notes                                                                           |
| ---- | ----------- | ------------------------------------------------------------------------------- |
| 3    | 24          | breaking-change wave (Binary reparenting); ship before wave 4                   |
| 4    | 10, 25a, 26 | independent of one another; ship in any order, parallel-friendly                |
| 5    | 25b         | gates on quoting-refactor Phases 4–5 (PRs 8/9/10 in `docs/quoting-refactor.md`) |

### Definition of done

The plan closes when:

- All five remaining PRs (10, 24, 25a, 25b, 26) merged.
- `pnpm parity:query` green on PG / MySQL / SQLite fixtures with no
  dialect-specific identifier quirks left in the arel visitors (only
  in the adapter `Quoting` implementations).
- No `as: "sqlite" | "postgres" | "mysql"` enum or equivalent
  string-dispatch survives in `packages/arel/`.
- `nodes/binary.rb` and `nodes/bound_sql_literal.rb` shape-aligned
  (Union/Intersect/Except/Join inherit `Binary`; `BoundSqlLiteral`
  fields match Rails).
- `pnpm tsx scripts/api-compare/compare.ts --package arel --privates`
  remains at 820/820.

---

## Conventions

- **Verification** per PR: the exact command(s) that should pass before
  marking done. Default set: `pnpm --filter @blazetrails/arel test`,
  `pnpm parity:query`,
  `pnpm tsx scripts/api-compare/compare.ts --package arel`. PRs add
  the specific assertions or fixtures they introduce. (`pnpm
api:compare` is a chained script — args don't reach `compare.ts`.)
- **Risk** per PR: the breaking-change surface and known failure modes.
- **Depends on** per PR: hard ordering constraints. Absent ⇒ independent.
- **Out of scope**: explicit non-goals so reviewers don't expand the PR.
- All PRs open in **draft** and link to this plan.
- work from a worktree, pnpm install after creating the worktree
- Only work on one PR at a time.
- names should be camelCase as TypeScript convention - don't underscore
- Remove your PR from sequencing, add it to completed, and remove details once merged.

---

## Completed

- PR 1 — Range protocol on `Quoted` + `between` / `notBetween` rewrite — merged in #1025.
- PR 2 — Unboundable short-circuits in `ToSql` — merged in #1029.
- PR 3 — MySQL `prepareUpdateStatement` / `buildSubselect` — merged in #1032.
- PR 4 — SQLite UNION grouping — merged in #1034.
- PR 5 — Set-op parenthesization (`infixValueWithParen` + flatten) — merged in #1035.
- PR 9 — `Table` self-alias normalization + 2-arg `[]` overload — merged in #1038.
- PR 11 — `Math` over-quoting + `bitwiseNot` — merged in #1042.
- PR 17 — `crud.ts` always assign `key` — merged in #1045.
- PR 13 — `SelectManager#from` Join routing — merged in #1048.
- PR 18 — `tree-manager.ts` `key=` build_quoted — merged in #1048.
- PR 19 — `factory-methods.ts` `lower` / `cast` alignment — merged in #1048.
- PR 20 — `UnaryOperation` operator whitespace preservation — merged in #1048.
- PR 21 — `Statement` ctors take `relation` arg — merged in #1050.
- PR 22 — `expressions.ts` `extract` packs self in array — merged in #1050.
- PR 15 — `SelectManager#distinct(value)` / `lateral` / `comment` — merged in #1055.
- PR 6 — `SelectManager#take` / `#skip` raw amount + null clear — merged in #1057.
- PR 14 — `SelectManager#optimizerHints` AST node — merged in #1057.
- PR 12 — `InsertManager` shape parity — merged in #1061.
- PR 8 — `UpdateManager#set` wraps columns in `UnqualifiedColumn` — merged in #1062.
- PR 7 — `SelectManager#limit` / `#offset` getters return inner expr — merged in #1063.
- PR 16 — `DeleteStatement` / `InsertStatement` visitor shape — merged in #1066.
- PR 23 — Visitor leaf alignment (Lock + outer-join guards slice) — merged in #1069.
- PR 23b — Casted/Quoted collapse + Date-bind removal — merged in #1074.
- PR 23c — In-array wrap, Table-name-Node, PostgreSQL ESCAPE — merged in #1078.

---

## PR 10 — `Table#[]` resolves model attribute aliases

Requires Table↔Model wiring. Larger; can defer if not blocking.

### Design decision (resolved)

**Option 2 — lazy `klass` ref.** Table holds an optional structural
`klass?: { attributeAliases?: Record<string, string> }`; `get(name)`
resolves `klass?.attributeAliases?.[name] ?? name`.

Rationale: literal port of Rails' `@klass.attribute_aliases` duck typing,
expressed via TS structural typing so arel keeps zero runtime/import
dependency on activerecord. Merging the packages to mirror Ruby's
single-gem layout was considered and rejected — the package boundary is
load-bearing for `api:compare`, the website TypeDoc build, and public
consumers; structural typing already gives us what Ruby gets from
duck typing. Option 1 (inject aliases dict at construct) was rejected
because it diverges from Rails (Rails passes the class, not a snapshot
of the alias map) and forces every `arelTable` site to re-snapshot.

### Trails files to change

- `arel/src/table.ts`:
  - Add optional `klass` field with a minimal `{ attributeAliases?: Record<string,string> }`
    interface (do not import AR — keep arel free of AR deps).
  - `get(name, ...)` resolves `name = klass?.attributeAliases?.[name] ?? name`.
- `activerecord/src/model.ts` (or `relation.ts`) — pass `klass: this`
  when building `arelTable`.

### Tests to add

- `arel/src/table.test.ts` — pass a fake `klass` with aliases; assert
  resolution.
- `activerecord/src/...alias.test.ts` — model with
  `aliasAttribute("nickname", "name")`; `Model.arelTable.get("nickname")`
  returns `Attribute(table, "name")`.

### Risk

- Circular-import hazard: arel must not import AR types. Use a local
  structural interface.
- Memory cycle (Table ↔ Model class): WeakRef not needed since both are
  long-lived; document in comment.

### Verification

- `pnpm test` green; new tests pass.

### Size

~60 LOC src + ~80 LOC test.

---

## PR 24 — `Binary` subclass restoration (Union/UnionAll/Intersect/Except/Join)

### Rails reference

- `nodes/binary.rb` — `const_set(:Union, ..., Binary)` etc.

### Decision (audit complete)

Reparent: `Union`, `UnionAll`, `Intersect`, `Except` extend `Binary`
directly. `Join` (the abstract base in `nodes/binary.ts`) extends
`Binary`; `InnerJoin`/`OuterJoin`/`RightOuterJoin`/`FullOuterJoin`/
`StringJoin`/`CrossJoin` keep `extends Join` (one level up only — Rails
also only changes `Join`'s parent). Pre-release, no consumers, no
migration matrix entry needed.

### Audit findings (2026-05-01)

- `to-sql.ts` has explicit leaf visitors for every reparented class
  (`visitArelNodesUnion`/`UnionAll`/`Intersect`/`Except` and all
  `Join` leaves). Direct dispatch wins over ancestor walk → no
  behavior change.
- `dot.ts` defines `visitArelNodesBinary` (walks `left`/`right`) and
  has **no** leaf visitors for set ops or non-string joins. After
  reparenting, ancestor walk lands on `Binary` and emits the
  `left`/`right` edges those nodes already carry — strict improvement
  over today's generic-Node fallback.
- `dot.ts` `visitArelNodesStringJoin` (line 151, walks only `left`)
  remains a direct hit; `Join`'s own leaf in dot doesn't exist, so no
  conflict.
- PG/MySQL/SQLite use a `visitBinaryOp(node, op)` helper, not a
  `visit_Arel_Nodes_Binary` reflection target — unaffected.

### Changes

- `nodes/binary.ts`: redeclare `Union`/`UnionAll`/`Intersect`/`Except`
  as `extends Binary`; switch `Join` to `extends Binary`.
- Drop the now-redundant explicit `left`/`right` fields and
  constructor on each set-op class — `Binary` already carries them.

### Tests

- `nodes/binary.test.ts`: `union.as("u") instanceof As`,
  `union.and(other) instanceof And`, `union instanceof Binary`.
- `visitors/to-sql.test.ts`: existing UNION/JOIN snapshots unchanged.
- `visitors/dot.test.ts`: snapshot a UNION graph — should now show
  `left`/`right` edges via the Binary fallback.

### Verification

- `pnpm --filter @blazetrails/arel test`.
- `pnpm parity:query` unchanged.

### Size

~50 LOC src + ~80 LOC test.

---

## PR 25a — MySQL `Concat` / `Cte` formatting

Visitor-side formatting only; no identifier-quoting changes. Independent
of the quoting refactor.

### Changes

- `visitors/mysql.ts`:
  - `visitArelNodesConcat`: emit `CONCAT(...)` with surrounding spaces
    (Rails `infix_value`).
  - `visitArelNodesCte`: drop the explicit `(`...`)` (let inner
    `Grouping` render).

### Tests

- `visitors/mysql.test.ts`:
  - `CONCAT` in expression context (e.g. `WHERE name = CONCAT(a, b)`).
  - CTE: `WITH x AS (SELECT 1)` (no double parens).

### Verification

- `pnpm --filter @blazetrails/arel test`.
- `pnpm parity:query` unchanged (no identifier-quoting churn yet).

### Size

~30 LOC src + ~60 LOC test.

---

## PR 25b — Arel visitors accept a `Quoting` quoter at construction

Pervasive arel architectural shift: visitors stop carrying dialect
identifier logic and instead delegate to a `Quoting`-shaped quoter
passed in at construction. MySQL backticks fall out as a side effect
(folds in the long-deferred `arel MySQL identifier quoting` memory),
and the same delegation cleans up PG / SQLite identifier paths too.

**Depends on `docs/quoting-refactor.md` Phase 2 (merged) and ideally
Phase 4–5 to remove the residual `mysqlQuote(sql)` post-processor.**

### Design decision (resolved)

The arel visitor must NOT carry dialect identifier logic. Instead, it
receives a `Quoting`-shaped quoter (the contract introduced in
quoting-refactor PR 2 / #1058) and delegates identifier emission:

```ts
// visitors/to-sql.ts — base
quoteTableName(name: string): string {
  return this.quoter.quoteTableName(name);
}
quoteColumnName(name: string): string {
  return this.quoter.quoteColumnName(name);
}
```

`SubstituteBindCollector` already takes a quoter; same pattern. MySQL
backticks fall out automatically because the MySQL adapter's `Quoting`
implementation already emits them — no per-visitor override needed.

### Changes

- `visitors/to-sql.ts`:
  - Constructor accepts `quoter: Quoting` (structural type — arel
    declares its own minimal `Quoting` interface; activerecord's
    `Quoting` is structurally compatible).
  - `visitArelTable` / `visitArelNodesAttribute` /
    `quoteTableName` / `quoteColumnName` route through `this.quoter`.
- `visitors/mysql.ts`, `postgresql.ts`, `sqlite.ts`: drop any local
  identifier overrides that exist; they're now redundant.
- `activerecord` arel-visitor construction sites: pass
  `connection` (which `implements Quoting`) as the quoter.

### Tests

- `visitors/mysql.test.ts`:
  - SELECT/UPDATE/INSERT/DELETE with backtick-quoted identifiers when
    constructed with a MySQL quoter.
  - Identifier with embedded backtick → doubled.
- `visitors/to-sql.test.ts`:
  - Default (no-op) quoter still emits double-quoted identifiers for
    base/PG/SQLite parity.

### Risk

- Identifier quoting changes every MySQL SQL fixture. Snapshot churn is
  expected; reviewer accepts the diff.
- Constructor signature change for `ToSql` and dialect subclasses —
  audit every in-tree construction site (activerecord adapters, tests,
  parity harness) and migrate atomically.

### Verification

- `pnpm parity:query` on MySQL — expect a wave of fixture updates;
  curate these in the PR.
- After merge: the `mysqlQuote(sql)` runtime post-processor in
  activerecord becomes redundant — schedule removal as a follow-up
  (cross-references quoting-refactor.md final note).

### Size

~80 LOC src + ~150 LOC test (incl. fixture updates).

---

## PR 26 — `BoundSqlLiteral` visitor parity

### Design decision (resolved)

**Option 2 — drop `parts`; store `sqlWithSubstitutes` + `bindValues`.**
Match Rails' node shape exactly; visitor parses `?` placeholders at
visit time. All in-tree consumers of `parts` migrate atomically (no
shim).

Rationale: Rails-shape parity for the node, even at the cost of
re-parsing on each visit. Aligns the node fields one-for-one with
`nodes/bound_sql_literal.rb` and removes a Trails-only contract.

### Rails reference

- `visitors/to_sql.rb` — `visit_Arel_Nodes_BoundSqlLiteral`.
- `nodes/bound_sql_literal.rb` — `BindError` text, field shape.

### Changes

- `nodes/bound-sql-literal.ts`:
  - Replace `parts` with `sqlWithSubstitutes: string` and
    `bindValues: unknown[]`.
  - Update constructor + any `eql`/`hash`/inspection paths.
  - `BindError` message text matches Rails verbatim.
- `visitors/to-sql.ts` `visitArelNodesBoundSqlLiteral`:
  - Walk `sqlWithSubstitutes`, splitting on `?` placeholders; for each
    bind: `Node` → `visit`, `Array` → visit each comma-joined, else →
    `quote` (or bind via collector).
  - Mismatched bind count → `BindError`.
- All in-tree call sites that constructed `BoundSqlLiteral` with `parts`
  migrate to the new constructor in the same PR.
- `errors.ts` — `BindError` text aligned with Rails.

### Tests

- `nodes/bound-sql-literal.test.ts`:
  - Mixed `?` placeholders + Arel-node value.
  - Array value flattens with `, `.
  - Missing/extra binds → BindError with Rails-shaped message text.

### Risk

- Breaking change to the `BoundSqlLiteral` node API. Audit every
  in-tree consumer (search for `BoundSqlLiteral` and `.parts`) before
  opening; migrate atomically.

### Size

~100 LOC src + ~110 LOC test (constructor migration adds ~20 LOC over
Option 1).

---

## Migration matrix

Pre-release: each PR migrates all in-tree call sites atomically. No
deprecated aliases, no shims.

| PR  | Surface                                        | Notes                |
| --- | ---------------------------------------------- | -------------------- |
| 24  | `Union/Intersect/Except/Join` extends `Binary` | API gain only        |
| 25b | Visitors accept `Quoting` quoter (MySQL backticks fall out) | curate snapshot diff |
| 26  | `BoundSqlLiteral` node fields (`parts` → Rails shape) | atomic in-tree migrate |

---

## CI / parity gates

Every PR must pass before merge:

- `pnpm --filter @blazetrails/arel test`
- `pnpm --filter @blazetrails/arel test:types` (if dx-tests touched)
- `pnpm tsx scripts/api-compare/extract-ts-api.ts && pnpm tsx scripts/api-compare/compare.ts --package arel` (no regressions)
- `pnpm parity:query` (no new diffs; curate fixture changes when
  intentional)
- For dialect PRs (3, 4, 17): the matrix CI job for that dialect.

---

## Out of scope (accepted divergence)

- TS-only `SelectManager` conveniences (`outerJoin`, `unionAll`,
  `withRecursive`, etc.). Add to `scripts/api-compare/compare.ts` skip
  list rather than remove.
- `Node#eql` / `Node#hash`. Keep.
- `Nary` parent class. Cosmetic.
- `dot.ts` simplification — defer until a consumer needs it.
- Ruby `unsupported` allowlist (`visit_Integer` / `visit_Array` etc.).
  TS coercion is acceptable until a regression appears.

---

## Grade trajectory

- **v1**: B-. Right structure, weak in protocol specs, breaking-change
  sequencing, and verification.
- **v2 (this)**: A. Each PR has Rails ref, TS files, behavior spec,
  tests, risk, verification, size, and out-of-scope. Breaking changes
  enumerated in a migration matrix. Wave ordering respects dependencies.
  Largest grab-bags split into independent numbered PRs. CI gates
  explicit.
