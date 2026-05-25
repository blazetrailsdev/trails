# JoinDependency → Arel AST Plan

## Problem

Our `JoinDependency` builds raw SQL strings (`joinSql` on each `JoinNode`) and
needs adapter-aware quoting at construction time. Rails' `JoinDependency` builds
an Arel AST and never touches the adapter — quoting happens later when the
visitor compiles the AST.

This creates several issues:

1. **Eager adapter resolution** — the `_adapter` field, `_resolveAdapter`,
   `_quoteString`, `_qt`, `_qc` machinery exists only because we emit SQL early.
2. **Mixed concerns** — alias tracking, join-condition logic, and SQL formatting
   are tangled in one 900-line file.
3. **Fragile scope injection** — association scopes are parsed via regex on
   `toSql()` output to extract WHERE clauses, then string-spliced into ON
   conditions.
4. **`joinConstraints()` wraps strings in `StringJoin`** — a workaround because
   the caller (Relation) expects Arel nodes but we only have raw SQL.

## Target state

`JoinDependency` returns proper Arel nodes (`Nodes.OuterJoin` with
`Nodes.On` predicates built from `Table`/`Attribute` references). The adapter is
never accessed; quoting is deferred to the visitor at `toSql()` time.

## PR sequence

### PR 1 — Arel infrastructure (~150 LOC)

Ensure the Arel package exports what we need:

- `Nodes.OuterJoin(left, right)` — verify constructor matches Rails shape
- `Nodes.On(expr)` — single predicate wrapper
- `Table#createJoin(table, constraint, joinType)` — factory method
- Confirm `Nodes.Equality`, `Nodes.And`, `Nodes.In` are usable for ON clauses

Likely no new code — just audit + maybe a missing re-export or constructor arg.

### PR 2 — JoinDependency core: emit Arel nodes (~250 LOC)

Refactor `addAssociation` (direct, non-through path):

- Build `targetTable = new Table(targetTableName)` with alias when colliding
- Build ON predicate as `Nodes.Equality(targetTable[fk], sourceTable[pk])`
- Add polymorphic/STI predicates via `Nodes.And`
- Store `Nodes.OuterJoin` on the node instead of `joinSql: string`
- Change `JoinNode.joinSql` → `JoinNode.arelJoin: Nodes.OuterJoin`
- `joinConstraints()` returns stored Arel nodes directly (delete `StringJoin`
  wrapping)

Delete: `_adapter`, `_resolveAdapter`, `_quoteString`, `_qt`, `_qc`,
abstract quoting imports.

### PR 3 — Through associations Arel path (~250 LOC)

Refactor `_addThroughAssociation`:

- Same pattern: build intermediate + target as `Nodes.OuterJoin`
- Replace regex scope extraction with Arel predicate composition (read the
  scope relation's `whereClause` Arel predicates directly)
- Polymorphic source_type predicate via `Nodes.Equality`

### PR 4 — Callers: Relation + FinderMethods (~150 LOC)

Update call sites that consume `JoinDependency`:

- `buildJoinSql()` → deleted or becomes `joins(): Nodes.Node[]`
- `buildSelectSql()` → returns `Nodes.As` array (column aliases)
- `applyColumnAliases()` → pushes `Nodes.As` into relation's select manager
- Relation's join-building code passes Arel nodes to SelectManager instead of
  `StringJoin(sql(...))`

### PR 5 — Cleanup + remove dead helpers (~100 LOC)

- Delete `joinRoot`, `makeJoinConstraints`, `makeConstraints`, `walk`, `build`
  helper functions at the bottom (they exist to paper over the string-based
  approach)
- Remove `Nodes.StringJoin` usage from eager-load paths
- Update tests

## Risks / blockers

1. **AliasTracker** — Rails' `AliasTracker` is a separate class that tracks
   table name collisions and truncates aliases. Our inline `_usedTableNames` Set
   is simpler. The Arel refactor doesn't change alias-tracking logic, just how
   the alias is applied (as `Table.new("x", as: "t1")` instead of string
   interpolation).

2. **Association scopes** — currently parsed via regex on SQL output. The Arel
   path needs to read `relation.arelWhereClause` or `relation.whereValues`
   directly. This requires the scope relation to expose its Arel predicates
   before compilation — verify this is accessible.

3. **`Nodes.OuterJoin` shape** — Rails' Arel has
   `OuterJoin < Join < Binary (left=table, right=on_condition)`. Verify our Arel
   package matches or adapt.

4. **Select aliases** — Rails emits `t0_r0` aliases as `Nodes.As`. Need to
   confirm our `SelectManager` handles an array of `As` nodes in the select
   list.

## Non-goals

- Refactoring the instantiation/hydration side (`construct`, `instantiateFromRows`).
  That's orthogonal to how JOINs are built.
- Changing `AliasTracker` to a separate class (can follow later).
- Changing how `addNestedAssociation` walks the chain — only the leaf
  construction changes.
