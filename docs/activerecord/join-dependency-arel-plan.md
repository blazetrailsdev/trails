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
| PR F2   | #2429      | merged         |
| PR F3   | #2435      | merged         |
| PR F4   | #2448      | merged         |
| PR F5   | #2447      | merged         |
| PR F6   | #2430      | merged         |

## Post-merge follow-ups (audited 2026-05-26)

Items surfaced during the original PR 1–7b sequence. Checked items are shipped. Remaining open items from the F-series are tracked under "Post-merge follow-ups from F-series" below.

- [x] ~200 LOC: `walk()` deduplication — shipped in #2405.
- [x] ~100 LOC: eliminate `_nodes` array — shipped in #2435 (F3).
- [x] ~150 LOC: use real `JoinAssociation` nodes in tree — shipped in #2414 (F1).
- [x] ~20 LOC: `JoinBase.table` returns Arel `Table` node — shipped in #2417.

**From #2384 (PR 4 — joinSql / dead helpers)**

- [x] ~5 LOC: delete `joinSql` from `JoinNode` — done in PR 7 (#2387).
- [x] ~5 LOC: delete `buildJoinSql()` — done in PR 7 (#2387).
- [x] ~40 LOC: delete dead helper functions — done in PR 7 (#2387).
- [x] ~15 LOC: delete dead `aliases()` — done in PR 7 (#2387).
- [x] remove `arelSql` import — done in PR 7 (#2387).
- [x] ~100 LOC: SELECT projections as Arel nodes — completed in #2394 (PR 6).
- [x] ~~\~150 LOC: `buildSelectSql`/`applyColumnAliases` `_qt`/`_qc` migration~~ — **stale**: `buildSelectSql`, `_qt`, `_qc` no longer exist. `applyColumnAliases` already uses Arel `As` nodes.

- [x] ~50 LOC: `makeConstraints` ON-predicate rebinding — shipped in #2418. `walk()` now rebinds ON predicates to the merged parent's table alias.
- [x] ~20 LOC: `joinType` propagated to emitted joins (rebuilt when not `OuterJoin`) — shipped in #2417.
- Note: `JoinTreeNode.isMatch()` matches on `immediateAssocName + modelClass` instead of Rails' reflection identity. Correct proxy for now.

- [x] ~200 LOC: nested eager-load proxy wiring — shipped in #2448 (F4, recursive nested hydration).
- [x] ~50 LOC: readonly/strictLoading propagation tests — shipped in #2415.
- [x] ~30 LOC: cross-parent model cache for belongsTo dedup — shipped in #2410.
- [x] ~5 LOC: Relation-level `_isReadonly` propagation — non-issue per #2417 investigation (relation's post-instantiation loop already handles it, matching Rails' `exec_queries`).

**From #2414 (F1 — addAssociation via JoinAssociation)**

- Discovery: STI constraints handled naturally by `klass.all()` default scope — no separate `_injectStiConstraint` needed on the JoinAssociation path. Note for #2414 PR-2-remainder work.
- Architectural divergence: our `makeConstraints` rebuilds pre-built joins when `joinType` differs; Rails builds joins fresh inside `make_constraints`. Lower-risk for now but flagged for full alignment when `_nodes` flat array is eliminated.

## Remaining work — PR sequence

All PRs branch from `main` independently (no stacking).

### PR F1 closed (#2414) — Wire JoinAssociation into addAssociation

Direct-path `addAssociation()` now creates `JoinAssociation` instances and
emits `Nodes.OuterJoin` via `joinConstraints()`. Quoting tests migrated to
Arel node assertions.

### PR F2 closed (#2429) — Wire JoinAssociation for through-associations

Through-associations now route through `JoinAssociation#joinConstraints` via
`reflection.chain`. `_addThroughAssociation` + `_finishThroughTarget` retained
as fallback only when no reflection exists.

### PR F3 closed (#2435) — Eliminate `_nodes` array + tree traversal

Flat `_nodes: JoinNode[]` replaced with tree traversal via `_joinRoot`.
`instantiateFromRows` and `_buildSelectArelNodes` walk the tree. `_rollbackTree`
uses path-set diffing (trails-specific; Rails has no rollback mechanism).

### PR F4 closed (#2448) — Nested hydration + belongsTo dedup

`instantiateFromRows` rewritten to recursive tree walk matching Rails'
`construct`. Cross-parent belongsTo dedup cache shipped.

### PR F5 closed (#2447) — AliasTracker wiring + joinConstraints sig

`AliasTracker` wired into `JoinDependency`. `JoinAssociation#joinConstraints`
accepts `aliasTracker` as 4th param (Rails sig).

### PR F6 closed (#2430) — Extra columns in instantiate

Non-`tN_rN` columns in result rows merged into parent model's attributes.
Gap 9 closed.

## Total: all F-series PRs shipped

## Ordering constraints

All F-series PRs have shipped. Ordering was: F1+F2 → F3 → F4; F1+F2 → F5; F6 independent.

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

3. **`scope._whereClause.ast` availability** — already confirmed working in the
   existing `JoinAssociation`. The plan uses this path (not
   `scope.arel().constraints`).

4. ~~**Backward compat during migration**~~ — resolved. PRs 6+7 removed all
   `joinSql` references; callers use `arelJoin` exclusively.

## Relationship to activerecord-100-plan.md

This plan **supersedes** the following batches in `activerecord-100-plan.md`:

- **Batch 28b** (JoinDependency AliasTracker port, ~280 LOC) — covered by F5.
- **Batch B35** (schema-qualified HABTM table aliasing, ~50 LOC) — covered by
  F5 (`AliasTracker.aliasedTableFor()` + Arel `Table({ as })`).
- **Batch B133** (polymorphic-source through-reflection, ~80 LOC) — covered
  by PR 2 (#2381, merged). `_addThroughAssociation` replaced by
  `JoinAssociation#joinConstraints` which handles polymorphic sources via
  `reflection.chain`.

## Post-merge follow-ups from F-series

**From #2429 (F2 — through-associations)**

- [ ] ~220 LOC: Delete dead `_addThroughAssociation` + `_finishThroughTarget` — retained as fallback when no reflection exists. Deletion blocked on a cleanup pass over the same area.
- [ ] ~10 LOC: Add `isCollection()` delegation to `PolymorphicReflection` — workaround reaches into `_reflection.macro`.
- [ ] `PolymorphicReflection#joinScopes` `buildScope(table)` ignores the `table` parameter. Works because the relation's default table matches, but diverges from Rails.

**From #2435 (F3 — eliminate \_nodes)**

- [ ] ~150 LOC: Delete `JoinNode` interface, fold properties onto `JoinPart` subclasses — `JoinNode` still exported and used by relation.ts (~6 call sites).
- [ ] ~30 LOC: Delete `_pushTreeNode`, build tree nodes directly in `addAssociation` — blocked on JoinNode deletion.
- [ ] ~20 LOC: Delete `JoinTreeNode` class — used as fallback when reflection is null.
- `_rollbackTree` uses path-set diffing — Rails has no rollback mechanism (structural difference, not fidelity gap).

**From #2447 (F5 — AliasTracker wiring)**

- [ ] `JoinAssociation#joinConstraints` accepts `aliasTracker` as 4th param but does not use it in the body — wired for signature parity only. Will matter when `make_constraints`/`@joined_tables` dedup is ported.
- [ ] `_references` param on `JoinDependency#joinConstraints` is unused — Rails uses it for eager-load reference tracking.

**From #2448 (F4 — nested hydration)**

- [ ] ~20–30 LOC: add `aliasTracker` getter + `findReflection` helper to `join-dependency.ts` (brings api:compare to 19/21).
- [ ] ~50 LOC: port `build` — depends on `reflection.checkValidity!` / `checkEagerLoadable!`.
- [ ] ~30 LOC: implement `association_cached?` shortcut in `_constructRecursive` for singular already-cached associations.
- [ ] ~20 LOC: move `setInverseInstance` call into `constructModel` before proxy wiring to match Rails ordering.
- [ ] ~40 LOC: implement readonly/strictLoading propagation in `_constructRecursive`.
- `join_dependency.rb` api:compare at 86% (18/21): `aliasTracker`, `findReflection`, `build` remain.

**From #2430 (F6 — extra columns)**

- [ ] ~30 LOC: Pass `column_types` from result set for proper type-casting of extra columns. Low priority — only matters if adapter returns uncast DB types for computed columns.

## Non-goals

- Rewriting the reflection system
- `InnerJoin` support for `joins()` (currently only `eager_load` uses
  JoinDependency; `joins()` goes through a different path)
- Full `AliasTracker` feature parity beyond what's already in
  `alias-tracker.ts` (stretch PR wires the existing class, doesn't extend it)
