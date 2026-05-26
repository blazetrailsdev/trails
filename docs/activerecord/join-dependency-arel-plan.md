# JoinDependency → Full Rails Fidelity Plan

## Merge status

| Plan PR | Shipped as | Status         |
| ------- | ---------- | -------------- |
| PR 1    | #2378      | merged         |
| PR 2    | #2379      | merged         |
| PR 3    | #2381      | merged         |
| PR 4    | #2384      | merged         |
| PR 5    | #2405      | merged         |
| PR 6    | #2394      | merged         |
| PR 7    | #2387      | merged         |
| PR 7b   | #2398      | merged         |
| PR 8    | —          | replaced by F5 |
| PR 9    | —          | replaced by F6 |

## Post-merge follow-ups (audited 2026-05-26)

Completed items from the original PR 1–7b sequence.

- [x] ~200 LOC: `walk()` deduplication — shipped in #2405.
- [x] ~20 LOC: `JoinBase.table` should return an Arel `Table` node, not a string. — shipped in #2417.
- [x] ~5 LOC: delete `joinSql` from `JoinNode` — done in PR 7 (#2387).
- [x] ~5 LOC: delete `buildJoinSql()` — done in PR 7 (#2387).
- [x] ~40 LOC: delete dead helper functions — done in PR 7 (#2387).
- [x] ~15 LOC: delete dead `aliases()` — done in PR 7 (#2387).
- [x] remove `arelSql` import — done in PR 7 (#2387).
- [x] ~100 LOC: SELECT projections as Arel nodes — completed in #2394 (PR 6).
- [x] ~~\~150 LOC: `buildSelectSql`/`applyColumnAliases` `_qt`/`_qc` migration~~ — **stale**: `buildSelectSql`, `_qt`, `_qc` no longer exist. `applyColumnAliases` already uses Arel `As` nodes.

## Remaining work — PR sequence

All PRs branch from `main` independently (no stacking).

### PR F1 — Wire JoinAssociation into addAssociation (~250 LOC)

Replace the inline predicate construction in `addAssociation()` (non-through
path) with real `JoinAssociation` nodes:

1. Create `JoinAssociation(reflection)` instead of building predicates inline
2. Call `joinAssociation.joinConstraints(sourceTable, sourceKlass, joinType)`
   to get the `OuterJoin`/`InnerJoin` node (fixes the hardcoded `OuterJoin`)
3. Push `JoinAssociation` into the tree instead of `JoinTreeNode` wrapper

Touches: `join-dependency.ts` (addAssociation, ~150 LOC rewrite),
test updates (~80 LOC).

Closes: Gap 1 (non-through path), `joinType` not applied.

### PR F2 — Wire JoinAssociation for through-associations (~250 LOC)

Replace `_addThroughAssociation` + `_finishThroughTarget` (~220 lines of inline
predicate building) with `JoinAssociation#joinConstraints` which already handles
`reflection.chain` for multi-hop throughs.

Touches: `join-dependency.ts` (\_addThroughAssociation, \_finishThroughTarget →
delegate to JoinAssociation), test updates.

Closes: Gap 1 (through path), through-association scope predicates.

### PR F3 — Eliminate `_nodes` array + tree traversal (~250 LOC)

Replace flat `_nodes: JoinNode[]` (14 references) with tree traversal via
`_joinRoot`. After F1/F2, tree nodes are real `JoinAssociation` instances, so
`_nodes` becomes redundant.

1. `instantiateFromRows` walks `_joinRoot` tree instead of iterating `_nodes`
2. `_buildSelectArelNodes` walks tree for column aliases
3. `_aliases` array → computed from tree walk
4. Delete `JoinNode` interface (folded into `JoinAssociation`/`JoinTreeNode`)
5. Delete `_pushTreeNode`, `_rekeyTreeNode`, `_rollbackTree` helpers

Touches: `join-dependency.ts` (~200 LOC rewrite), `relation.ts` caller (~20
LOC), test updates (~30 LOC).

Closes: Gap 2 (flat array → tree).

### PR F4 — Nested hydration + belongsTo dedup (~250 LOC)

`instantiateFromRows` currently iterates nodes flat — it wires children only
to the root parent. Rewrite to recursive tree walk matching Rails' `construct`:

1. Recursive walk: parent→children, wire each child via `association(name)`
   proxy on the correct intermediate parent (not just root)
2. Cross-parent belongsTo dedup cache: same target record loaded via two
   parents gets instantiated once (~30 LOC)
3. Relation-level `_isReadonly` propagated to parent records (~5 LOC)
4. readonly/strictLoading propagation tests (~50 LOC)

Touches: `join-dependency.ts` (instantiateFromRows rewrite ~150 LOC),
new/updated test file (~100 LOC).

Closes: Gap 3 (nested proxy wiring), Gap 5 (readonly/strictLoading tests),
belongsTo dedup, `_isReadonly` propagation.

### PR F5 — AliasTracker wiring + ON-predicate rebinding (~200 LOC)

Wire the existing `AliasTracker` (`associations/alias-tracker.ts`) into
`JoinDependency`:

1. Replace `_usedTableNames: Set<string>` with `AliasTracker` instance
2. Pass tracker to `JoinAssociation#joinConstraints` as 4th arg (Rails sig)
3. Use `aliasedTableFor()` for table collision resolution
4. `makeConstraints` rebinds ON predicates via `rebindTableReferences()` when
   `walk()` merges trees and the parent table alias changes (~50 LOC)

Touches: `join-dependency.ts` (~150 LOC), `join-association.ts` signature
(~20 LOC), test updates (~30 LOC).

Closes: Gap 8 (AliasTracker), `makeConstraints` rebinding. Enables removal of
`rebindTableReferences` stopgap once fully wired.

### PR F6 (stretch) — Extra columns in instantiate (~100 LOC)

Handle non-`tN_rN` columns in result rows, merging them into the parent
model's attributes (mirrors Rails' `column_names` extraction in
`JoinDependency#instantiate`).

Closes: Gap 9.

## Total: ~1200 LOC across 5 core + 1 stretch PR

## Ordering constraints

- F1 and F2 are independent (non-overlapping code paths) and can be developed
  in parallel, but must both merge before F3.
- F3 must merge before F4 (F4 rewrites `instantiateFromRows` assuming tree
  structure).
- F5 can proceed after F1+F2 (needs JoinAssociation nodes to pass tracker to).
- F6 is independent of everything.

```
F1 ──┐
     ├── F3 ── F4
F2 ──┘
F1+F2 ── F5
F6 (independent)
```

## Notes

- `rebindTableReferences` is a stopgap — should be removed once F5 (AliasTracker)
  fully handles alias resolution through `aliasedTableFor()`.
- `JoinTreeNode.isMatch()` matches on `immediateAssocName + modelClass` instead
  of Rails' reflection identity. Correct proxy for now; will naturally resolve
  when F1/F2 replace `JoinTreeNode` with real `JoinAssociation` nodes.

## Risks / blockers

1. **STI type constraints in `joinScope`** — verify `klassJoinScope` applies
   STI WHERE via the subclass's `default_scope`. If not, add explicit STI
   predicate injection to `joinScope` (~10 LOC). Blocks F1.

2. **`reflection.chain` completeness for multi-hop throughs** — verify the
   chain is fully populated for nested `:through` associations. If gaps exist,
   that's a prerequisite reflection fix. Blocks F2.

## Relationship to activerecord-100-plan.md

This plan **supersedes** the following batches in `activerecord-100-plan.md`:

- **Batch 28b** (JoinDependency AliasTracker port, ~280 LOC) — covered by F5.
- **Batch B35** (schema-qualified HABTM table aliasing, ~50 LOC) — covered by
  F5 (`AliasTracker.aliasedTableFor()` + Arel `Table({ as })`).
- **Batch B133** (polymorphic-source through-reflection, ~80 LOC) — covered by
  F2 (`JoinAssociation#joinConstraints` handles polymorphic sources via
  `reflection.chain`).

Once this plan lands, mark those batches as "superseded by join-dependency-arel-plan".

## Non-goals

- Rewriting the reflection system
- `InnerJoin` support for `joins()` (currently only `eager_load` uses
  JoinDependency; `joins()` goes through a different path)
- Full `AliasTracker` feature parity beyond what's already in
  `alias-tracker.ts` (stretch PR wires the existing class, doesn't extend it)
