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
- **Cross-package wiring** (arel ↔ activerecord seams):
  PRs **10** (`Table#[]` alias resolution via `klass` ref), **25b**
  (visitors accept a `Quoting` quoter at construction).

Wave order (when to ship):

| Wave | PRs    | Notes                                                                           |
| ---- | ------ | ------------------------------------------------------------------------------- |
| 4    | 10, 26 | independent of one another; ship in any order, parallel-friendly                |
| 5    | 25b    | gates on quoting-refactor Phases 4–5 (PRs 8/9/10 in `docs/quoting-refactor.md`) |

### Definition of done

The plan closes when:

- All remaining PRs (10, 25b, 26) merged.
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
- PR 24 — `Binary` subclass restoration (Union/UnionAll/Intersect/Except/Join) — merged in #1093.
- PR 25a — MySQL `Concat`/`Cte` formatting (spaces around CONCAT, Grouping-aware parens) — merged in #1094.

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

### Rails reference

- `activerecord/lib/arel/table.rb` — `def [](name, table = self)` calls
  `name = klass.attribute_aliases[name.to_s] || name if klass`.
- `activerecord/lib/active_record/model_schema.rb` —
  `def arel_table` builds `Arel::Table.new(table_name, klass: self)`.

### Step-by-step

1. **`packages/arel/src/table.ts`** — add a structural `Klass` interface
   and an optional field:

   ```ts
   /** Structural duck-type for Rails' `@klass.attribute_aliases`.
    *  Kept minimal so arel does not import activerecord. */
   export interface TableKlass {
     readonly _attributeAliases?: Record<string, string>;
   }

   export interface TableOptions {
     typeCaster?: TypeCaster;
     klass?: TableKlass;
   }
   ```

   In the `Table` class, store `readonly klass?: TableKlass` from
   options and use it in `get(name, table = this)`:

   ```ts
   get(name: string, table: Table | Node = this): Attribute {
     const resolved = this.klass?._attributeAliases?.[name] ?? name;
     return new Attribute(table, resolved);
   }
   ```

   Note: the model field is `_attributeAliases` (see
   `packages/activemodel/src/model.ts:93`); we match that key, not the
   Rails-camelCase getter name. If a getter `attributeAliases` is
   added later, widen the interface to either form.

2. **`packages/activerecord/src/base.ts:735`** — current
   `static get arelTable()` returns
   `new Table(this.tableName, { typeCaster: new TypeCasterMap(this) })`.
   Add `klass: this`:

   ```ts
   static get arelTable(): Table {
     return new Table(this.tableName, {
       typeCaster: new TypeCasterMap(this),
       klass: this,
     });
   }
   ```

   The `static this` here satisfies `TableKlass` structurally because
   `_attributeAliases` is declared on `activemodel/src/model.ts:93`.

3. **Other `new Table(...)` sites in `relation.ts`** (lines 398, 436,
   554–555, 585, 1332–1333, 1366–1367, 1429–1430, 1462, 1535+ —
   `grep -n "new Table(" packages/activerecord/src/relation.ts`) build
   tables for join targets / through associations from raw table
   names. They have no model class to attach; leave them untouched
   (alias resolution only applies to `Model.arelTable`, matching
   Rails — joined tables don't carry the source model's aliases).

### Tests

- `packages/arel/src/table.test.ts`:
  - `new Table("users", { klass: { _attributeAliases: { nickname: "name" } } }).get("nickname")`
    → `Attribute` with `name === "name"`.
  - Same call with `get("name")` returns `Attribute("name")` (passthrough).
  - `new Table("users").get("nickname")` (no klass) returns
    `Attribute("nickname")` (passthrough).
- `packages/activerecord/src/attribute-methods/aliasing.test.ts`
  (or wherever `aliasAttribute` is currently tested):
  - `class M extends Model {} ; M.aliasAttribute("nickname", "name");`
  - `M.arelTable.get("nickname")` resolves to attribute on `name`.
  - `M.where({ nickname: "x" }).toSql()` emits `users.name = 'x'`.
- Mirror the Rails test name: search
  `scripts/api-compare/.rails-source/activerecord/test/cases/relation/where_test.rb`
  for `attribute_aliases` and reuse the test title verbatim.

### Risk

- Circular-import hazard: arel must NOT import any activerecord type.
  Use only the structural `TableKlass` interface declared in
  `arel/src/table.ts`.
- Memory cycle (Table ↔ Model class): `Model.arelTable` is a getter
  that builds a new Table per call; the Table holds a ref to the
  class, the class holds no ref back. No cycle. (If we ever cache
  `arelTable`, revisit — but Rails doesn't cache it either.)

### Verification

- `pnpm --filter @blazetrails/arel test` green.
- `pnpm --filter @blazetrails/activerecord test` green.
- `pnpm parity:query` unchanged on fixtures without aliases; new
  alias-bearing fixture (if added) emits the resolved column name.

### Size

~30 LOC src in arel + ~5 LOC src in activerecord + ~80 LOC test.

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

### Step-by-step

1. **`packages/arel/src/nodes/binary.ts`** — change parent classes.
   Each of `Union`, `UnionAll`, `Intersect`, `Except`, and the
   abstract `Join` currently `extends Node` and redeclares
   `readonly left` / `readonly right` plus a constructor that assigns
   them. Change to `extends Binary` and remove those duplicated
   members. Example:

   ```ts
   // before
   export class Union extends Node {
     readonly left: Node;
     readonly right: Node;
     constructor(left: Node, right: Node) {
       super();
       this.left = left;
       this.right = right;
     }
     accept<T>(visitor: NodeVisitor<T>): T {
       return visitor.visit(this);
     }
   }

   // after
   export class Union extends Binary {}
   ```

   The same pattern for `UnionAll`, `Intersect`, `Except`. For
   `Join`: change `extends Node` to `extends Binary` and drop the
   `readonly left/right` + constructor. `Binary`'s constructor takes
   `(left, right = null)` which already covers `Join`'s
   `(left, right = null)` shape — verify line by line before
   deleting.

2. **`packages/arel/src/nodes/inner-join.ts`,
   `outer-join.ts`, `right-outer-join.ts`, `full-outer-join.ts`,
   `string-join.ts`, `cross-join.ts`** — no change. They already
   `extends Join`, which now transitively extends `Binary`.

3. **`accept` methods** — `Binary` already declares `accept` calling
   `visitor.visit(this)`. Subclasses dropping their override inherit
   this; verify the test suite still resolves dispatch (the
   per-leaf `dispatchCache` registration in `to-sql.ts:150-166` is
   unchanged, so dispatch keys still hit the leaf class names).

### Changes summary

- `nodes/binary.ts`: 5 classes (`Union`/`UnionAll`/`Intersect`/`Except`/`Join`)
  switch parent to `Binary`; drop their duplicated `left`/`right` +
  constructor + `accept`.

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

### Step-by-step

1. **`packages/arel/src/visitors/to-sql.ts`** — add a minimal
   `Quoting` interface and accept it in the constructor:

   ```ts
   /** Structural duck-type. activerecord's full `Quoting` interface
    *  is a superset; both satisfy this. */
   export interface ArelQuoter {
     quoteTableName(name: string): string;
     quoteColumnName(name: string): string;
     quoteString(s: string): string;
     quote(value: unknown): string;
   }

   export class ToSql extends Visitor implements NodeVisitor<SQLString> {
     protected readonly quoter: ArelQuoter;

     constructor(quoter: ArelQuoter = defaultQuoter) {
       super();
       this.quoter = quoter;
     }
     // ...
     protected quoteTableName(name: string): string {
       return this.quoter.quoteTableName(name);
     }
     protected quoteColumnName(name: string): string {
       return this.quoter.quoteColumnName(name);
     }
   }
   ```

   Provide a `defaultQuoter` exported from a new
   `packages/arel/src/visitors/default-quoter.ts` that emits the
   abstract Rails defaults (double-quoted identifiers, `'…'` string
   escaping). This keeps no-arg `new ToSql()` working for tests and
   `tree-manager.ts:77` semantics.

2. **`packages/arel/src/visitors/mysql.ts`,
   `postgresql.ts`, `sqlite.ts`** — drop any local backtick /
   identifier override logic. The MySQL `visitArelNodesCte`
   identifier escape (added in PR 25a as
   `name.replace(/`/g, "``")` + literal backticks) becomes
   `this.quoteTableName(node.name)`.

3. **Activerecord visitor construction sites** — every place
   that instantiates an arel visitor must pass the connection
   (which already `implements Quoting` per quoting-refactor PR 2):
   - `packages/activerecord/src/connection-adapters/abstract-adapter.ts:731`
     `return new Visitors.ToSql();` → `return new Visitors.ToSql(this);`
   - `packages/activerecord/src/connection-adapters/sqlite3-adapter.ts:127`
     `return new Visitors.SQLite();` → `return new Visitors.SQLite(this);`
   - `packages/activerecord/src/connection-adapters/postgresql-adapter.ts:1754`
     `return new Visitors.PostgreSQLWithBinds();` → pass `this`.
   - `packages/activerecord/src/insert-all.ts:417-419` — the three
     dialect branches each need the connection threaded in. The
     `_dialect` string lookup is itself a code smell; replace with
     `return this.model.connection.arelVisitor()` (which returns a
     fresh visitor with the right quoter) once available, otherwise
     pass `this.model.connection`.
   - `packages/activerecord/src/relation.ts:134, 562, 3458` and
     `packages/activerecord/src/relation/where-clause.ts:323` —
     each `new Visitors.ToSql()` becomes
     `new Visitors.ToSql(this.model.connection)` (or thread
     `connection` from the call context).

4. **`packages/arel/src/nodes/node.ts:119` `setToSqlVisitor`** —
   the no-arg factory used by `Node#toSql()`. Either extend the
   factory signature to optionally take a quoter, or document
   that `Node#toSql()` (with no connection in scope) uses the
   `defaultQuoter` and is not for production SQL. The latter is
   simpler and matches Rails — `Arel::Node#to_sql` without a
   connection is a debug aid.

### Tests

- `packages/arel/src/visitors/to-sql.test.ts`:
  - Default-quoter ToSql emits double-quoted identifiers
    (`"users"."id"`) — current behavior, locked in.
  - `new ToSql(stubQuoter)` where `stubQuoter.quoteTableName` returns
    `<<x>>` → output contains `<<users>>`.
- `packages/arel/src/visitors/mysql.test.ts`:
  - `new MySQL(mysqlQuoter)` SELECT emits `` `users`.`id` ``.
  - Identifier with embedded backtick → doubled (uses the quoter's
    own escape).
- `packages/activerecord/src/relation.test.ts` (or wherever
  visitor wiring is exercised):
  - `Model.where(...).toSql()` on MySQL adapter emits backticks
    end-to-end.

### Risk

- **Snapshot churn:** identifier quoting changes every MySQL SQL
  fixture. Curate the diff in the PR.
- **Constructor signature change for `ToSql` and dialect subclasses.**
  Default-arg `quoter = defaultQuoter` keeps no-arg construction
  working; tests that construct directly continue to pass.
- **`ArelQuoter` vs activerecord `Quoting`** — the structural shape
  must be a strict subset of activerecord's `Quoting` interface.
  Verify with a one-line check in a `.test-d.ts`:
  `expectAssignable<ArelQuoter>(connection)`.

### Verification

- `pnpm --filter @blazetrails/arel test` green.
- `pnpm --filter @blazetrails/activerecord test` green.
- `pnpm parity:query` on MySQL — expect a wave of fixture updates;
  curate these in the PR.
- After merge: the `mysqlQuote(sql)` runtime post-processor in
  activerecord (search `grep -rn mysqlQuote packages/activerecord/src`)
  becomes redundant — schedule removal as a follow-up
  (cross-references `docs/quoting-refactor.md` final note).

### Size

~120 LOC src + ~200 LOC test (incl. fixture updates and 8–10
construction-site migrations).

---

## PR 26 — `BoundSqlLiteral` visitor parity

### Design decision (resolved)

**Option 2 — drop `parts`; visitor walks
`sqlWithSubstitutes` + `positionalBinds` / `namedBinds` directly.**
Match Rails' node shape: rename `sql` → `sqlWithSubstitutes`, remove
the `parts` getter, and have the visitor do the placeholder walk
itself (Rails: `visit_Arel_Nodes_BoundSqlLiteral` in `to_sql.rb`).

Rationale: the trails node already carries `positionalBinds` and
`namedBinds` (matching Rails `positional_binds` / `named_binds`); the
remaining drift is the `sql` field name and the trails-only `parts`
abstraction. Removing `parts` shrinks the node API to a strict
subset of Rails.

### Rails reference

- `activerecord/lib/arel/nodes/bound_sql_literal.rb`:
  - `attr_reader :sql_with_substitutes, :positional_binds, :named_binds`.
  - `BindError` message: `"wrong number of bind variables (X for Y) in: <sql>"`
    (positional) or `"missing value for :<name> in <sql>"` (named).
- `activerecord/lib/arel/visitors/to_sql.rb` —
  `visit_Arel_Nodes_BoundSqlLiteral` walks `sql_with_substitutes`,
  for each bind: `Arel::Node` → `visit`, `Array` → visit each
  comma-joined, otherwise → `quote(value)`.

### Step-by-step

1. **`packages/arel/src/nodes/bound-sql-literal.ts`** —
   - Rename field `sql` → `sqlWithSubstitutes` (and the constructor
     parameter).
   - Drop the `parts` getter (lines 66-131) and the
     `sqlWithPlaceholders` getter.
   - Keep `positionalBinds`, `namedBinds`, and the `validate()` call.
   - Update `BindError` strings to match Rails verbatim
     (the messages in `validate()` and the count-mismatch error
     thrown from the old `parts` getter — those move to the
     visitor's bind walk in step 3).

2. **In-tree call sites** — update both constructor positional args
   and any `.sql` / `.parts` reads. Known sites:
   - `packages/activerecord/src/relation/query-methods.ts:1338, 1357`
     (constructor calls — first arg is the SQL string; rename param
     locally if helpful but the positional API doesn't break).
   - `packages/arel/src/update-manager.ts:60` — `instanceof
BoundSqlLiteral` branch; no field access, no change needed.
   - `packages/arel/src/visitors/to-sql.ts:1006` — old visitor reads
     `node.parts`. Replace per step 3.
   - `packages/arel/src/visitors/dot.ts:598` — registered as
     `visitNoEdges`; no field access, no change.
   - `grep -rn "BoundSqlLiteral\|\.parts\b" packages/` to confirm no
     other consumers before merging.

3. **`packages/arel/src/visitors/to-sql.ts:1004-…`** —
   `visitArelNodesBoundSqlLiteral` rewrite. Replace the
   `for (const part of node.parts)` loop with a placeholder walk on
   `node.sqlWithSubstitutes`:

   ```ts
   private visitArelNodesBoundSqlLiteral(node: Nodes.BoundSqlLiteral): SQLString {
     const sql = node.sqlWithSubstitutes;
     const hasPositional = node.positionalBinds.length > 0;
     const hasNamed = Object.keys(node.namedBinds).length > 0;

     if (hasPositional) {
       const segments = sql.split("?");
       if (segments.length - 1 !== node.positionalBinds.length) {
         throw new BindError(
           `wrong number of bind variables (${node.positionalBinds.length} for ${segments.length - 1}) in: ${sql}`,
         );
       }
       segments.forEach((seg, i) => {
         this.collector.append(seg);
         if (i < node.positionalBinds.length) {
           this.visitBindValue(node.positionalBinds[i]);
         }
       });
     } else if (hasNamed) {
       const re = /:([a-zA-Z]\w*)/g;
       let last = 0;
       let m: RegExpExecArray | null;
       while ((m = re.exec(sql))) {
         this.collector.append(sql.slice(last, m.index));
         const name = m[1];
         if (!(name in node.namedBinds)) {
           throw new BindError(`missing value for :${name} in ${sql}`);
         }
         this.visitBindValue(node.namedBinds[name]);
         last = m.index + m[0].length;
       }
       this.collector.append(sql.slice(last));
     } else {
       this.collector.append(sql);
     }
     return this.collector;
   }

   private visitBindValue(value: unknown): void {
     if (value instanceof Node) {
       this.visit(value);
     } else if (Array.isArray(value)) {
       value.forEach((v, i) => {
         if (i > 0) this.collector.append(", ");
         this.visitBindValue(v);
       });
     } else {
       this.collector.append(this.quoter.quote(value));
     }
   }
   ```

   `visitBindValue` is private; do not promote it to a `visit_*`
   reflection target.

4. **`packages/arel/src/errors.ts`** — add or align `BindError`
   class with Rails-shaped message strings (`wrong number of bind
variables …` and `missing value for :<name> …`). Existing
   `Error("Cannot mix positional and named bind parameters")` cases
   in `validate()` retain trails phrasing — Rails doesn't have an
   exact analog there.

### Tests

- `packages/arel/src/nodes/bound-sql-literal.test.ts`:
  - Constructor takes `sqlWithSubstitutes`; `node.sqlWithSubstitutes`
    reads back unchanged.
  - `node.parts` is no longer defined (TS error or `undefined`).
  - Validation errors fire with Rails phrasing.
- `packages/arel/src/visitors/to-sql.test.ts`:
  - `?` placeholder + Arel-node bind → emitted SQL contains the
    visited node's SQL, not its quoted toString.
  - Array bind value → comma-joined.
  - Wrong positional count → `BindError` with
    `"wrong number of bind variables (N for M)"` text.
  - Missing named bind → `BindError` with `"missing value for :name"`.
- Mirror Rails test names from
  `scripts/api-compare/.rails-source/activerecord/test/cases/arel/visitors/to_sql_test.rb`
  (search for `bound_sql_literal`).

### Risk

- Breaking change to `BoundSqlLiteral` node API (`sql` field rename,
  `parts` removal). Pre-release, no external consumers; in-tree
  audit per step 2.
- `BindError` exception identity: confirm whether trails has an
  existing `BindError` class (`grep -rn "class BindError" packages/`)
  — if not, add to `arel/src/errors.ts` and export.

### Verification

- `pnpm --filter @blazetrails/arel test` green.
- `pnpm --filter @blazetrails/activerecord test` green.
- `pnpm parity:query` unchanged — the visitor still emits the same
  SQL for the same input; only the node-internal API moved.

### Size

~80 LOC src (mostly the visitor rewrite; node loses more LOC than
it gains) + ~120 LOC test.

---

## Migration matrix

Pre-release: each PR migrates all in-tree call sites atomically. No
deprecated aliases, no shims.

| PR  | Surface                                                     | Notes                  |
| --- | ----------------------------------------------------------- | ---------------------- |
| 24  | `Union/Intersect/Except/Join` extends `Binary`              | API gain only          |
| 25b | Visitors accept `Quoting` quoter (MySQL backticks fall out) | curate snapshot diff   |
| 26  | `BoundSqlLiteral` node fields (`parts` → Rails shape)       | atomic in-tree migrate |

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
