# JoinDependency → Full Rails Fidelity Plan

## Merge status

| Plan PR | Shipped as | Status  |
| ------- | ---------- | ------- |
| PR 1    | #2378      | merged  |
| PR 2    | #2379      | merged  |
| PR 3    | #2381      | merged  |
| PR 4    | #2384      | merged  |
| PR 5    | #2405      | merged  |
| PR 6    | #2394      | merged  |
| PR 7    | #2387      | merged  |
| PR 7b   | #2398      | merged  |
| PR 8    | —          | stretch |
| PR 9    | —          | stretch |

## Post-merge follow-ups

Items not captured in the existing PR slots above.

**From #2394 (PR 6 — Arel select aliases)**

- [x] ~200 LOC: `walk()` deduplication — shipped in #2405.
- [ ] ~100 LOC: eliminate `_nodes` array — replace flat array with tree traversal once PR 3 tree structure is fully in use.
- [ ] ~150 LOC: use real `JoinAssociation` nodes in tree (PR 3/5 follow-on).
- [ ] ~20 LOC: `JoinBase.table` should return an Arel `Table` node, not a string.

**From #2384 (PR 4 — joinSql / dead helpers)**

- [x] ~5 LOC: delete `joinSql` from `JoinNode` — done in PR 7 (#2387).
- [x] ~5 LOC: delete `buildJoinSql()` — done in PR 7 (#2387).
- [x] ~40 LOC: delete dead helper functions — done in PR 7 (#2387).
- [x] ~15 LOC: delete dead `aliases()` — done in PR 7 (#2387).
- [x] remove `arelSql` import — done in PR 7 (#2387).

**From #2381 (PR 3 — tree structure)**

- [ ] ~100 LOC: SELECT projections as Arel nodes (currently string-built in `buildSelectSql`).
- [ ] ~200 LOC: wire `JoinAssociation#joinConstraints` for through-associations with scope predicates.

**From #2379 (PR 2 — through-association path)**

- [ ] ~250 LOC: full through-association path via Arel nodes (PR 2 partial; remainder in PR 5).
- [ ] ~150 LOC: `buildSelectSql`/`applyColumnAliases` still use `_qt`/`_qc` internally — finish migration in PR 6 follow-on.
- `rebindTableReferences` is a stopgap and should be removed once alias resolution is wired through `AliasTracker`.

**From #2405 (PR 5 — walk() deduplication)**

- [ ] ~50 LOC: `makeConstraints` ON-predicate rebinding — PR 8 (AliasTracker). Pre-built `arelJoin` nodes don't rebind ON predicates to the merged parent's table alias. `rebindTableReferences()` is applicable.
- [ ] ~20 LOC: `joinType` not applied to emitted joins — pre-built joins are always `OuterJoin`. Fix when `makeConstraints` is upgraded to rebuild joins.
- Note: `JoinTreeNode.isMatch()` matches on `immediateAssocName + modelClass` instead of Rails' reflection identity. Correct proxy for now.

**From #2398 (PR 7b — eager-load hydration)**

- [ ] ~200 LOC: nested eager-load proxy wiring — flat-node iteration only wires children to root parent. Needs recursive tree walk (depends on tree refactor).
- [ ] ~50 LOC: readonly/strictLoading propagation tests.
- [ ] ~30 LOC: cross-parent model cache for belongsTo dedup.
- [ ] ~5 LOC: Relation-level `_isReadonly` not propagated to parent records in eager-load join path.

## Status quo

We have two parallel implementations:

1. **`join-dependency.ts`** (the 900-line main class) — builds raw SQL strings,
   uses `_adapter`/`_qt()`/`_qc()`/`_quoteString()` for quoting at construction
   time, stores `joinSql: string` on each `JoinNode`.

2. **`join-dependency/join-association.ts`** (already exists) — proper
   Rails-shaped `JoinAssociation` class that walks `reflection.chain`, calls
   `reflection.joinScope()`, extracts `scope._whereClause.ast`, and returns
   `OuterJoin(table, On(predicates))` Arel nodes.

The main `JoinDependency` class **ignores** the existing `JoinAssociation` and
does everything inline with raw SQL. The goal is to wire the existing Arel-based
classes into the main flow and close all remaining fidelity gaps.

## Rails architecture (reference)

```
JoinDependency
  @join_root: JoinBase (tree root, has children: JoinAssociation[])
  @join_type: OuterJoin (or InnerJoin for joins vs eager_load)

  #join_constraints → walks tree, delegates to JoinAssociation#join_constraints
  #instantiate → walks tree, uses association(name).target= / loaded!
  #apply_column_aliases → lazy proc: relation._select!(-> { aliases.columns })
  #aliases → Aliases struct with column_aliases returning Arel As nodes

JoinAssociation < JoinPart
  #join_constraints(foreign_table, foreign_klass, join_type, alias_tracker)
    → reflection.chain iteration
    → reflection.join_scope(table, foreign_table, foreign_klass)
    → scope.arel.constraints → On node → join_type.new(table, On(nodes))
  #readonly? / #strict_loading? — from reflection.scope

JoinBase < JoinPart
  Root node; delegates column_names, primary_key, instantiate

AliasTracker
  Separate class tracking table name → count; aliased_table_for returns
  Table.new(name, as: alias) on collision.
```

## What we already have (verified)

- `JoinAssociation` (join-dependency/join-association.ts) — `joinConstraints()`
  using `reflection.joinScope()` + `scope._whereClause.ast` ✓
- `JoinBase` (join-dependency/join-base.ts) — root node with children ✓
- `JoinPart` (join-dependency/join-part.ts) — tree base class with
  `each()`/`children` ✓
- `Nodes.OuterJoin`, `Nodes.On`, `Nodes.As`, `Nodes.And` — all exist ✓
- `Table({ as: "alias" })` + `tableAlias` property ✓
- `SelectManager#appendJoinNode(node)` ✓
- `SelectManager#constraints` → `Node[]` ✓
- `reflection.joinScope(table, foreignTable, foreignKlass)` — builds Arel
  predicates ✓

## Fidelity gaps (ordered by priority)

### Gap 1 — Main JoinDependency doesn't use JoinAssociation (Arel wiring)

The `addAssociation()` / `_addThroughAssociation()` methods hand-build SQL
instead of creating `JoinAssociation` instances and calling their
`joinConstraints()`. This is the core structural gap.

### Gap 2 — No tree structure in the main flow

Rails' `JoinDependency` stores a `@join_root` tree (`JoinBase` with
`JoinAssociation` children, recursively). Ours uses a flat `_nodes: JoinNode[]`
array. The tree enables:

- `walk()` deduplication (shared prefix = single join)
- Parent→child traversal in `construct()` (hydration)
- `reflections` computed from tree walk

### Gap 3 — Hydration doesn't wire association proxies

Rails' `construct()` calls `ar_parent.association(name).target=` and
`other.loaded!` so that `post.comments` after eager-load goes through the
association proxy (enables `loaded?` checks, inverse assignment, etc.). Ours
returns a raw `{ parents, associations }` map.

### Gap 4 — No `walk()` deduplication

When multiple eager-loads share a common prefix (e.g., `comments.author` and
`comments.likes`), Rails reuses the existing `comments` join. Our
`joinConstraints(joinsToAdd)` concatenates blindly, potentially duplicating
intermediate joins.

### Gap 5 — `readonly?` / `strict_loading?` propagation

Rails' `JoinAssociation` checks `reflection.scope` and calls `model.readonly!` /
`model.strict_loading!` on instantiated children. Our `JoinAssociation` has
the fields but they're always false; the hydration path doesn't read them.

### Gap 6 — Lazy `apply_column_aliases`

Rails uses `relation._select!(-> { aliases.columns })` (a lambda evaluated at
query-build time). Ours eagerly computes SQL strings via `buildSelectSql()`.

### Gap 7 — `Aliases#column_aliases` returns Arel `As` nodes

Rails' `Aliases::Table#column_aliases` returns `t[column.name].as(column.alias)`
(Arel nodes). Ours returns raw `AliasMap` data objects that get formatted into
SQL strings.

### Gap 8 — AliasTracker not wired into JoinDependency

`AliasTracker` already exists at `associations/alias-tracker.ts` with collision
counts, `aliasedTableFor`, and alias truncation. But the main `JoinDependency`
class ignores it, using an inline `_usedTableNames: Set<string>` instead.
The gap is wiring the existing tracker into `JoinDependency`'s table-resolution
path (and passing it to `JoinAssociation#joinConstraints` as the 4th arg).

### Gap 9 — Extra columns in `instantiate`

Rails handles non-`tN_rN` columns in the result set (raw selects), merging them
into the parent's attributes. Our hydration ignores them.

## PR sequence

### PR 1 — Wire JoinAssociation into addAssociation (~250 LOC)

Replace the manual SQL construction in `addAssociation()` (non-through path)
with:

1. Resolve reflection via `reflectOnAssociation()`
2. Create aliased `Table` when collision detected (`new Table(name, { as: tN })`)
3. Create `JoinAssociation(reflection)` and call
   `joinAssociation.joinConstraints(sourceTable, sourceKlass, OuterJoin)`
4. Store the resulting `Nodes.OuterJoin` on `JoinNode` as `arelJoin`
5. Keep `joinSql` temporarily (computed by compiling the Arel node via the
   visitor) for backward compat during migration

Delete: `_adapter`, `_resolveAdapter`, `_quoteString`, `_qt`, `_qc`, abstract
quoting imports, the PLACEHOLDER string-replace pattern.

**STI note:** `_addStiConstraint` is NOT deleted in this PR. Rails applies STI
type constraints via `default_scope` on the STI subclass, which flows through
`reflection.joinScope()` → `klassJoinScope()` → `buildScope()` → `klass.all()`.
Verify that our `buildScope` propagates the STI default scope before removing
`_addStiConstraint`. If it doesn't, add explicit STI predicate injection to
`joinScope` first. Only delete `_addStiConstraint` once the test suite confirms
STI IN-list predicates still appear in the Arel output.

**Test migration:** Update `join-dependency-quoting.test.ts` — assertions change
from checking raw SQL strings with adapter-specific quotes to checking that the
Arel node structure is correct (e.g., `node.arelJoin` is an `OuterJoin` with
the right `On` predicate). The quoting test becomes a visitor-output test.

### PR 2 — Through-association path via JoinAssociation (~250 LOC)

Replace `_addThroughAssociation` with `JoinAssociation#joinConstraints` which
already handles `reflection.chain` (multi-hop throughs). The existing
implementation walks the chain and builds joins for each hop.

**Test migration:** Update `join-dependency-through-aliasing.test.ts` to assert
on Arel node structure / visitor output rather than `node.joinSql` strings.

### PR 3 — Tree structure: use JoinBase/JoinAssociation tree (~200 LOC)

Replace flat `_nodes: JoinNode[]` with `_joinRoot: JoinBase` (tree of
`JoinPart` nodes). `addAssociation` pushes `JoinAssociation` as children of the
appropriate parent node. `addNestedAssociation` walks/builds the tree.

This enables:

- Natural parent→child traversal
- Foundation for `walk()` deduplication
- `reflections` from `join_root.drop(1).map(r => r.reflection)`

### PR 4 — `walk()` deduplication (~150 LOC)

Implement `walk(left, right, join_type)` — when two `JoinDependency` instances
share a subtree, reuse existing table aliases:

```ts
private walk(left: JoinPart, right: JoinPart, joinType: JoinType): Nodes.Node[] {
  const [intersection, missing] = partition(right.children, rc =>
    left.children.find(lc => rc.match(lc))
  );
  const joins = intersection.flatMap(([l, r]) => { r.table = l.table; return this.walk(l, r, joinType); });
  return joins.concat(missing.flatMap(([_, n]) => this.makeConstraints(left, n, joinType)));
}
```

### PR 5 — Hydration via association proxies (~200 LOC)

Rewrite `construct()` to mirror Rails:

```ts
const other = arParent.association(node.reflection.name);
other.loaded = true; // marks collection as loaded
if (node.reflection.collection) {
  other.target.push(model);
} else {
  other.target = model;
}
if (node.isReadonly()) model.readonly = true;
if (node.isStrictLoading()) model.strictLoading = true;
```

This wires `readonly?` and `strict_loading?` propagation (Gap 5) at the same
time.

### PR 6 — Arel select aliases + lazy apply_column_aliases (~150 LOC)

1. `Aliases#columnAliases(node)` returns `table.get(col.name).as(col.alias)`
   (Arel `As` nodes) instead of raw data
2. `applyColumnAliases(relation)` uses `relation._select!(lambda)` for lazy
   evaluation
3. Delete `buildSelectSql()` — callers use the Arel alias nodes

### PR 7 — Callers + cleanup (~150 LOC)

1. `_buildEagerJoinManager()` (relation.ts:3434) — migrate from
   `appendStringJoin(node.joinSql)` to `appendJoinNode(node.arelJoin)`
2. `joinConstraints()` — returns stored Arel nodes directly (no `StringJoin`
   wrapping)
3. Delete `joinSql` from `JoinNode` interface
4. Delete dead helper functions at bottom of file (`joinRoot`,
   `makeJoinConstraints`, `makeConstraints`, `walk`, `build`, `findReflection`)
5. Delete `join-dependency-quoting.test.ts` (replaced in PR 1)

### PR 8 (stretch) — Wire existing AliasTracker into JoinDependency (~150 LOC)

`AliasTracker` already exists at `associations/alias-tracker.ts`. Replace the
inline `_usedTableNames: Set<string>` with an `AliasTracker` instance. Pass it
to `JoinAssociation#joinConstraints` as the 4th arg (matching Rails' signature).
Use `aliasedTableFor()` to resolve aliased tables instead of manual collision
checks.

### PR 9 (stretch) — Extra columns in instantiate (~100 LOC)

Handle non-`tN_rN` columns in result rows, merging them into the parent
model's attributes (mirrors Rails' `column_names` extraction in
`JoinDependency#instantiate`).

## Total: ~1600 LOC across 7 core + 2 stretch PRs

## Risks / blockers

1. **STI type constraints in `joinScope`** — verify `klassJoinScope` applies
   STI WHERE via the subclass's `default_scope`. If not, add STI predicate
   injection to `joinScope` (~10 LOC).

2. **`reflection.chain` completeness for multi-hop throughs** — verify the
   chain is fully populated for nested `:through` associations. If gaps exist,
   that's a prerequisite reflection fix.

3. **`scope._whereClause.ast` availability** — already confirmed working in the
   existing `JoinAssociation`. The plan uses this path (not
   `scope.arel().constraints`).

4. **Backward compat during migration** — PRs 1–2 keep `joinSql` as a computed
   property (compile the Arel node) so callers don't all break at once. PR 7
   removes it after all callers are migrated.

## Relationship to activerecord-100-plan.md

This plan **supersedes** the following batches in `activerecord-100-plan.md`:

- **Batch 28b** (JoinDependency AliasTracker port, ~280 LOC) — folded into
  PRs 1–2 + PR 8 of this plan.
- **Batch B35** (schema-qualified HABTM table aliasing, ~50 LOC) — the
  `quoteSchemaQualified` helper becomes unnecessary once aliasing goes through
  `AliasTracker.aliasedTableFor()` + Arel `Table({ as })`. Covered by PR 8.
- **Batch B133** (polymorphic-source through-reflection, ~80 LOC) — the
  `return null` guards at `join-dependency.ts:189–197,738` are deleted when
  `_addThroughAssociation` is replaced by `JoinAssociation#joinConstraints`
  which already handles polymorphic sources via `reflection.chain`. Covered by
  PR 2.

Once this plan lands, mark those batches as "superseded by join-dependency-arel-plan".

## Non-goals

- Rewriting the reflection system
- `InnerJoin` support for `joins()` (currently only `eager_load` uses
  JoinDependency; `joins()` goes through a different path)
- Full `AliasTracker` feature parity beyond what's already in
  `alias-tracker.ts` (stretch PR wires the existing class, doesn't extend it)
