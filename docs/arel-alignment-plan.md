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

| Wave | PRs                        | Notes                                    |
| ---- | -------------------------- | ---------------------------------------- |
| 1    | 13, 15, 18, 19, 20, 21, 22 | independent fixes                        |
| 2    | 6, 8, 12, 14               | depend on wave-1 helpers / shape changes |
| 3    | 7, 16, 23, 24              | breaking-change wave; ship serially      |
| 4    | 10, 25, 26                 | dialect / cross-package work             |

Wave-1 PRs can be opened in parallel. Wave-3 requires sequential merge
because each one moves AR-visible API.

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

---

## PR 6 — `SelectManager#take` / `#skip` accept raw amount, allow `null` clear

Write-side change. Read-side getter change is PR 7.

### Rails reference

- `select_manager.rb` — `take`, `skip`, `limit=`, `offset=`.

### Trails files to change

- `select-manager.ts`:
  - `take(amount: number | Node | null)`: pass `amount` directly to
    `new Limit(amount)`. On `null`, set `ast.limit = null`.
  - `skip(amount)` symmetric.
  - `set limit(value)` / `set offset(value)` setters per Rails (assign
    `Limit`/`Offset` directly when number passed).
- `nodes/unary.ts` — verify `Limit` / `Offset` accept raw number expr
  (visitor should already render).

### Tests to add

- `select-manager.test.ts`:
  - `mgr.take(5)` → `mgr.ast.limit instanceof Limit && limit.expr === 5`
    (no `Quoted` wrapper).
  - `mgr.take(null)` → `mgr.ast.limit === null`.
  - `mgr.skip(null)` → cleared.

### Risk

- The `Quoted` wrap was masking type ambiguity. After this PR, any code
  reading `limit.expr` gets a primitive (was a `Quoted`). Listed as a
  consumer-visible API change in the migration matrix.

### Verification

- New tests pass.
- `pnpm test:types` AR suite still typechecks.

### Size

~40 LOC src + ~50 LOC test.

---

## PR 7 — `SelectManager#limit` / `#offset` getters return inner expr

Read-side. Breaking change for AR.

### Depends on

- PR 6 (so test setup uses raw amounts).

### Trails files to change

- `select-manager.ts`:
  - `get limit()`: return `this.ast.limit?.expr ?? null` (was `this.ast.limit`).
  - `get offset()`: symmetric.
- `packages/activerecord/` — find every `.limit` / `.offset` read on a
  SelectManager (grep for `selectManager.limit`, `arel.limit`, and
  manager-typed receivers) and migrate. Expect ≤10 sites.

### Tests to add

- `select-manager.test.ts`: `mgr.take(5); mgr.limit === 5`.
- AR test changes are point-fixes, no new tests.

### Risk

- Highest of any PR in the plan. Ship behind a single atomic commit,
  not split across packages.

### Verification

- `pnpm test` (full repo) green.
- `pnpm parity:query` no diffs.

### Size

~30 LOC arel src + ~40 LOC AR migration + tests.

---

## PR 8 — `UpdateManager#set` shape: wrap columns in `UnqualifiedColumn`

### Rails reference

- `update_manager.rb` — `set(values)`.
- `nodes/unqualified_column.rb`.

### Pre-PR audit (must complete before opening)

Grep `_inUpdateSet` across `packages/arel/src/visitors/`. Document each
reader and confirm what it does. As of audit:

- `to-sql.ts` `visitArelNodesAssignment` — toggles state to skip column
  qualification.
- `to-sql.ts` `visitArelNodesAttribute` (or equivalent) — branches on
  the flag.
- (Possibly) `mysql.ts` overrides referencing it.

### Trails files to change

- `update-manager.ts`:
  - `set(values)`:
    - Pairs: wrap `[col, val]` → `new Assignment(new UnqualifiedColumn(col), val)`
      (where `val` stays raw — drop the `Quoted` wrap).
    - Raw string: store on `ast.values` as `new SqlLiteral(string)`.
- `visitors/to-sql.ts`:
  - Remove `_inUpdateSet` flag.
  - `visitArelNodesAssignment` becomes plain `visit(left) = visit(right)`.
  - `visitArelNodesUnqualifiedColumn` already emits the bare name
    (verify, otherwise align).
- `visitors/mysql.ts` — verify no `_inUpdateSet` reader remains.

### Tests to add

- `update-manager.test.ts`:
  - AST shape: `assignment.left instanceof UnqualifiedColumn`.
  - SQL output: identical to current snapshots.
  - Raw string: `mgr.set("a = b")` → `ast.values instanceof SqlLiteral`.
- `visitors/to-sql.test.ts` — unchanged SQL output assertion.
- `visitors/mysql.test.ts` — `UPDATE t SET col = ...` (no `t.col`).

### Risk

- The `_inUpdateSet` flag also masks Attribute → bare-name rendering in
  spots beyond Assignment. If grep finds unexpected readers, split this
  PR or add explicit rendering paths first.

### Verification

- All `update*` tests in arel + AR pass.
- `pnpm parity:query` UPDATE fixtures unchanged.

### Size

~70 LOC src + ~80 LOC test.

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

## PR 12 — `InsertManager` shape parity

### Rails reference

- `insert_manager.rb` — `insert`, `select=`, `values=`, `create_values`.
- `crud.rb` — `compile_insert`.

### Trails files to change

- `insert-manager.ts`:
  - `insert(fields)`:
    - `if (fields == null || fields.length === 0) return;` (match Rails
      early-return).
    - `string` form: `this.ast.values = new SqlLiteral(fields)`.
    - If `this.ast.relation == null && fields[0]?.[0]?.relation`, set
      `this.ast.relation = fields[0][0].relation`.
    - Drop the `Quoted` wrap on value halves (let visitor `quote`).
  - `set values(list)` setter (mirror Rails `values=`); replace the
    existing `values(list)` method outright (pre-release, no aliases).
  - `select(selectManager)`: store the SelectManager itself; do not
    unwrap to `.ast`. Visitor accepts both.

### Tests to add

- `insert-manager.test.ts`:
  - `mgr.insert([])` is a no-op (relation/columns/values untouched).
  - `mgr.insert("RAW")` → `ast.values instanceof SqlLiteral`.
  - `mgr.insert([[col, val]])` infers relation.
  - `mgr.select(other)` → `ast.select === other`.
  - `mgr.values = list` setter form.

### Risk

- `select` storing a SelectManager (rather than a Node) requires the
  visitor to handle both. Confirm `visitArelNodesInsertStatement` calls
  `visit()` (which dispatches on constructor) — SelectManager isn't a
  Node, so a tiny shim or `if (select.ast) visit(select.ast)` is needed.

### Verification

- New tests pass.
- AR `insert_all` parity fixture unchanged.

### Size

~80 LOC src + ~100 LOC test.

---

## PR 13 — `SelectManager#from` Join routing **[independent]**

### Rails reference

- `select_manager.rb` — `from`.

### Change

- `from(table)`: if `table instanceof Join`, push to `core.source.right`;
  else assign to `core.source.left`.

### Tests

- `select-manager.test.ts` — pass an `InnerJoin` to `from`; assert it
  lands on `source.right`.

### Size

~10 LOC src + ~20 LOC test.

---

## PR 14 — `SelectManager#optimizerHints` AST node

### Rails reference

- `nodes/optimizer_hints.rb`.

### Change

- `select-manager.ts` `optimizerHints(...hints)` → wrap in
  `new OptimizerHints(hints)` (add the node if absent), store on
  `core.optimizerHints` as a node.
- `visitors/to-sql.ts` `emitOptimizerHints` — visit the node.

### Tests

- AST shape + SQL identical.

### Size

~40 LOC src + ~40 LOC test.

---

## PR 15 — `SelectManager#distinct(value=true)` clear, `lateral` order, `comment` array form **[independent]**

Three small Rails-fidelity tweaks bundled because they all fit in one
manager file and share a test file. Strictly under 100 LOC.

### Changes

- `distinct(value = true)`: when falsy, set `core.setQuantifier = null`.
- `lateral(name?)`: produce `Nodes.Lateral.new(this.as(name))` —
  `Lateral` wraps the `TableAlias`, not vice versa. Audit
  `visitors/to-sql.ts` `visitArelNodesLateral` to confirm it visits
  inner `TableAlias` correctly.
- `comment(...values)` → `new Comment(values)` (single array arg). Verify
  `Comment` ctor accepts `string[]` (it does today; spread-vs-array
  produces the same AST so this is a no-op aside from API shape).

### Tests

- One test per case in `select-manager.test.ts`.

### Risk

- `lateral` swap changes SQL (`LATERAL (...) "x"` vs `LATERAL (... "x")`).
  Update snapshots; confirm AR's `from(lateral_subquery)` still works.

### Size

~50 LOC src + ~70 LOC test.

---

## PR 16 — `DeleteStatement` / `InsertStatement` visitor shape

### Rails reference

- `visitors/to_sql.rb` — `visit_Arel_Nodes_DeleteStatement`,
  `visit_Arel_Nodes_InsertStatement`.

### Changes

- `visitArelNodesDeleteStatement`: emit `DELETE`, then `FROM`, then
  `visit(joinSource.left)` (so `TableAlias` renders correctly).
- `visitArelNodesInsertStatement`:
  - Prefer `node.values` over `node.select` when both present.
  - Route column quoting through `this.quoteColumnName(name)` (so MySQL
    backtick override applies once it lands in PR 17).

### Tests

- `visitors/to-sql.test.ts`:
  - `DELETE FROM users AS u WHERE ...`.
  - `INSERT` with both `values` and `select` — assert values wins.
- `visitors/mysql.test.ts` — INSERT column names backtick-quoted (after
  PR 25 lands; cross-link).

### Size

~40 LOC src + ~70 LOC test.

---

## PR 18 — `tree-manager.ts` `key=` build_quoted **[independent]**

### Change

- `tree-manager.ts` `set key(value)`: wrap with
  `Nodes.buildQuoted(value)`; for arrays, map.

### Test

- `tree-manager.test.ts` — assert `ast.key instanceof Quoted` after
  setter.

### Size

~10 LOC src + ~20 LOC test.

---

## PR 19 — `factory-methods.ts` `lower` / `cast` alignment **[independent]**

### Changes

- `lower(column)` → `buildQuoted(column)` first.
- `cast(name, type)` → `name.as(type)` (drop `SqlLiteral` pre-wrap; let
  `as` handle retryable).

### Test

- `factory-methods.test.ts` — string `lower("name")` → AST contains
  `Quoted("name")`.

### Size

~15 LOC src + ~25 LOC test.

---

## PR 20 — `UnaryOperation` operator whitespace preservation **[independent]**

### Rails ref

- `visitors/to_sql.rb` — emits `${op}` without trim.

### Changes

- `visitors/to-sql.ts` `visitArelNodesUnaryOperation` — drop
  `operator.trim()`. Emit literal `<space>${operator}<space>`.

### Risk

- Existing TS callers passing `" - "` would have rendered `<space>-<space>`
  via trim+pad. After change, they render `<space> - <space>`. Audit
  Trails callers (none expected — operators are short tokens).

### Test

- `visitors/to-sql.test.ts` — `UnaryOperation("- ", expr)` → exact whitespace
  preserved.

### Size

~5 LOC src + ~20 LOC test.

---

## PR 21 — `Statement` ctors take `relation` arg

### Changes

- `nodes/insert-statement.ts`, `nodes/select-statement.ts`,
  `nodes/update-statement.ts`, `nodes/delete-statement.ts`:
  ctor `constructor(relation: Node | null = null)`. Set
  `this.relation = relation` (Insert) or `this.cores[0].source.left = relation`
  (Select).

### Test

- `nodes/select-statement.test.ts` — `new SelectStatement(table)` →
  source.left set.

### Size

~30 LOC src + ~40 LOC test.

---

## PR 22 — `expressions.ts` `extract` packs self in array

### Rails ref

- `expressions.rb` — `Nodes::Extract.new [self], field`.

### Changes

- `expressions.ts` `extract(field)` → `new Extract([this], field)`.
- `nodes/extract.ts` ctor accepts `Node[]`.
- Visitor iterates the array.

### Risk

- Visitor change is required; otherwise SQL breaks. Audit
  `visitArelNodesExtract` first.

### Test

- `expressions.test.ts` — `extract("year")` AST + SQL.

### Size

~20 LOC src + ~30 LOC test.

---

## PR 23 — Visitor leaf alignment

Bundles Lock, OuterJoin, Casted/Quoted, Table-name-Node, In-array-wrap,
PostgreSQL ESCAPE.

### Changes

- `visitors/to-sql.ts`:
  - `visitArelNodesLock`: `visit(node.expr)` only — no `"FOR UPDATE"`
    fallback. Also update `SelectManager#lock` (in PR 15 or here) to
    always wrap in `SqlLiteral`.
  - `visit{Outer,RightOuter,FullOuter}Join`: drop `if (node.right)` guard.
    Document: passing a join with no ON now throws via SqlString.
  - `visitArelNodesCasted` / `visitQuoted`: collapse to a single shared
    visitor `visit_quoted_or_casted` (both call `quote(o.valueForDatabase())`).
    Drop the Date-bind branch in `visitQuoted`.
  - `visitArelTable`: branch on `node.name instanceof Node` → visit it.
  - `prepareUpdateStatement` / `prepareDeleteStatement`: wrap subselect:
    `new In(columns, [subselect])`.
- `visitors/postgresql.ts`: `ESCAPE` form — when `escape instanceof Node`,
  visit it; else hard-quote.

### Tests

- One test per change in `visitors/to-sql.test.ts` /
  `visitors/postgresql.test.ts`.

### Risk

- The `Date` bind-branch removal changes how AR-side date binds render.
  Verify AR's `where(created_at: date)` parity before merge.

### Verification

- `pnpm parity:query` on date fixtures unchanged.
- `pnpm parity:schema` unchanged.

### Size

~90 LOC src + ~140 LOC test.

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

| PR  | Surface                                                     | Notes                          |
| --- | ----------------------------------------------------------- | ------------------------------ |
| 6   | `take(n)` AST shape (`Limit.expr` raw)                      | inventory + migrate in same PR |
| 7   | `mgr.limit` getter return type                              | atomic AR migration in same PR |
| 8   | UpdateManager AST: `Assignment.left` is `UnqualifiedColumn` | inventory + migrate            |
| 11  | Math AST: no inner `Quoted` for raw nodes                   | docs note                      |
| 12  | InsertManager `ast.select` is SelectManager not Node        | visitor handles both shapes    |
| 15  | `lateral` SQL output order                                  | update fixtures                |
| 20  | `UnaryOperation` operator whitespace                        | low-risk                       |
| 24  | `Union/Intersect/Except/Join` extends `Binary`              | API gain only                  |
| 25  | MySQL identifier quoting                                    | curate snapshot diff           |

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
