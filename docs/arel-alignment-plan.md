# Arel Alignment Plan

Implementation plan to bring `packages/arel/` into behavioral alignment with
Rails v8.0.2 (`scripts/api-compare/.rails-source/activerecord/lib/arel/`).

Each PR below targets ≤300 LOC. Order is roughly by SQL-correctness impact;
PRs marked **independent** can be parallelized. Trails files are paths under
`packages/arel/src/`. Rails files are paths under
`scripts/api-compare/.rails-source/activerecord/lib/arel/`.

---

## Sequencing

PRs 1–5 merged (see Completed below).

| Wave | PRs        | Notes                               |
| ---- | ---------- | ----------------------------------- |
| 3    | 24         | breaking-change wave; ship serially |
| 4    | 10, 25, 26 | dialect / cross-package work        |

Waves 1 and 2 are complete. Wave-3 requires sequential merge because
each one moves AR-visible API.

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
- PR 23b — Casted/Quoted visitor collapse + Date-bind branch removal — merged in #1074.
- PR 23c — In-array wrap, Table-name-Node, PostgreSQL ESCAPE — merged in #1078.

---

## PR 10 — `Table#[]` resolves model attribute aliases

Requires Table↔Model wiring. Larger; can defer if not blocking.

### Pre-PR design decision

Two viable shapes:

1. **Inject on construct**: `new Table("users", { attributeAliases: {...} })`.
   AR's `Model.arelTable` populates from `Model.attributeAliases`.
2. **Lazy lookup**: Table holds an optional `klass` ref;
   `get(name)` calls `klass?.attributeAliases?.[name] ?? name`.

Recommendation: option 2 — fewer construction sites change, matches
Rails (`@klass.attribute_aliases`).

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

### Changes

- `nodes/binary.ts`: redefine `Union`, `UnionAll`, `Intersect`, `Except`
  as `extends Binary`.
- `nodes/inner-join.ts`, `outer-join.ts`, `right-outer-join.ts`,
  `full-outer-join.ts`, `string-join.ts`: extend `Binary` (they likely
  extend an abstract `Join`; switch `Join` to extend `Binary`).
- Audit `visitors/visitor.ts`: per-class dispatch cache is keyed by
  constructor; the `WeakMap` per `VisitorCtor` doesn't need invalidation
  because each visitor subclass seeds its dispatch on construction. Each
  visitor subclass's `dispatchCache` already registers
  `Union → "visitArelNodesUnion"` etc; verify the registration list still
  matches.
- Run dispatch tests on subclass instances — `instance.constructor` is
  still the leaf class, so direct dispatch hits don't change. Ancestor
  walk now finds `Binary` if a visitor doesn't register a leaf — confirm
  no leaf relies on a missing-method fallthrough.

### Tests

- `nodes/binary.test.ts`: `union.as("u") instanceof As`,
  `union.and(other) instanceof And`.
- `visitors/to-sql.test.ts`: existing UNION/JOIN snapshots unchanged.

### Verification

- Full arel test suite green (smoke for visitor dispatch).

### Size

~50 LOC src + ~80 LOC test.

---

## PR 25 — MySQL `Concat` / `Cte` formatting + identifier quoting

Folds in the long-deferred `arel MySQL identifier quoting` memory.

### Changes

- `visitors/mysql.ts`:
  - `visitArelNodesConcat`: emit `CONCAT(...)` with surrounding spaces
    (Rails infix_value).
  - `visitArelNodesCte`: drop the explicit `(`...`)` (let inner Grouping
    render).
  - Override `quoteTableName` / `quoteColumnName` to backtick-escape:
    `` `name` `` with embedded backticks doubled.
  - `visitArelTable` / `visitArelNodesAttribute` already call those
    overrides; verify.

### Tests

- `visitors/mysql.test.ts`:
  - `CONCAT` in expression context (e.g. `WHERE name = CONCAT(a, b)`).
  - CTE: `WITH x AS (SELECT 1)` (no double parens).
  - SELECT/UPDATE/INSERT/DELETE with backtick-quoted identifiers.
  - Identifier with embedded backtick → doubled.

### Risk

- Identifier quoting changes every MySQL SQL fixture. Snapshot churn is
  expected; reviewer accepts the diff.

### Verification

- `pnpm parity:query` on MySQL — expect a wave of fixture updates;
  curate these in the PR.

### Size

~60 LOC src + ~150 LOC test (incl. fixture updates).

---

## PR 26 — `BoundSqlLiteral` visitor parity

### Design decision (must be made before opening PR)

Trails' `BoundSqlLiteral.parts` (pre-parsed) is the current contract. Two
options:

1. **Keep `parts`**: rewrite the visitor to do per-part dispatch
   (Arel-node value → visit, Array → recurse, else → quote/bind).
2. **Drop `parts`, add `sqlWithSubstitutes` + `bindValues`**: parse at
   visit time. Closer to Rails but breaks the node API.

Recommendation: option 1 (less churn, same SQL).

### Rails reference

- `visitors/to_sql.rb` — `visit_Arel_Nodes_BoundSqlLiteral`.
- `nodes/bound_sql_literal.rb` — `BindError` text.

### Changes

- `visitors/to-sql.ts` `visitArelNodesBoundSqlLiteral`:
  - For each part of the BoundSqlLiteral:
    - if `part` is an `Arel::Node` (or Trails `Node`) → `visit(part)`.
    - if `Array.isArray(part)` → visit each, comma-joined.
    - if `part` is a literal string segment → emit verbatim.
    - else → quote/bind.
- `errors.ts` — match Rails BindError messages.

### Tests

- `nodes/bound-sql-literal.test.ts`:
  - Mixed `?` placeholders + Arel-node value.
  - Array value flattens with `, `.
  - Missing/extra binds → BindError with Rails-shaped message text.

### Size

~80 LOC src + ~110 LOC test.

---

## Migration matrix

Pre-release: each PR migrates all in-tree call sites atomically. No
deprecated aliases, no shims.

| PR  | Surface                                        | Notes                |
| --- | ---------------------------------------------- | -------------------- |
| 24  | `Union/Intersect/Except/Join` extends `Binary` | API gain only        |
| 25  | MySQL identifier quoting                       | curate snapshot diff |

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
