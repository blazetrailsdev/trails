# Audit: JoinDependency → Rails mapping (RFC 0027)

Gating audit for [RFC 0027 — JoinDependency fidelity]. Maps every member of
the TS `JoinDependency`, `Aliases`, and `JoinLeaf` classes in
`packages/activerecord/src/associations/join-dependency.ts` (1,470 lines) to
its counterpart in `vendor/rails/.../associations/join_dependency.rb` (301
lines), classifies each, and records the stop-or-go decision for stories 2–5.

[RFC 0027 — JoinDependency fidelity]: https://github.com/blazetrailsdev/tasks/blob/main/rfcs/0027-join-dependency-fidelity/README.md

## Summary

The deviation is **one root cause with many symptoms**: the TS
`JoinDependency` is built **incrementally** — `relation.ts` constructs an empty
instance and calls `addAssociation` / `addAssociationSpec` once per eager-load
spec — whereas Rails builds the whole tree **once** in the constructor from an
`associations` hash (`make_tree` → `build`). Almost every port-only member
exists to support incremental construction:

- **Rollback machinery** (`_snapshotTree` / `_restoreTree` / `_rollbackTree`)
  is needed only because each incremental add must be all-or-nothing. Rails
  builds once and never rolls back.
- **Path index** (`_treeNodesByPath`) deduplicates shared prefixes across
  separate `addAssociation` calls. Rails' single `walk_tree` pass folds
  duplicates structurally.
- **Eager alias bookkeeping** (`_nextTableIndex`, `_aliases`,
  `_arelTablesByIndex`) accumulates as tables are added. Rails computes the
  `Aliases` object **lazily** from a `join_root.each_with_index` walk, after the
  tree exists.
- **Early constraint emission**: `addAssociation` resolves the alias _and_
  builds the `arelJoin` immediately, so `makeConstraints` is hollowed to a
  re-emit of the cached node. Rails' `make_constraints` does the real work
  (alias resolution via `AliasTracker` + `@joined_tables`) at
  `join_constraints` time, and `make_constraints` rebinds table references
  there too — which is why TS needs `_rebindChildOnPredicates` /
  `rebindTableReferences` to fix up predicates whose table was aliased after
  the fact.

The half of the class that already follows Rails build-once shape
(`joinConstraints`, `makeJoinConstraints`, `walk`, `instantiate` /
`construct`, `aliases`, `findReflection`, `build`) is a faithful or
renamed-equivalent port. The convergence target is to delete the incremental
scaffolding and feed a build-once tree, after which the lazy `aliases()` and
`make_constraints` paths already present can carry the load.

**Decision: GO on stories 2–5.** Story 2 (build-once tree) is the keystone —
it removes the largest share of port-only state and must land first. See
[Stop-or-go](#stop-or-go-stories-25).

## Coverage

- Rails source read: `vendor/rails/activerecord/lib/active_record/associations/join_dependency.rb` (1–301, full)
- Rails support read: `join_dependency/join_part.rb`, `join_base.rb`, `join_association.rb` shape (via TS mirrors)
- TS source read: `associations/join-dependency.ts` (1–1470, full), `join-dependency/join-part.ts`
- Callers traced: `relation.ts`, `relation/query-methods.ts`, `relation/calculations.ts`

## Classification legend

- **faithful** — same name, same shape, behavior-equivalent.
- **renamed** — Rails counterpart exists under a different name / mechanism, behavior-equivalent.
- **port-only / load-bearing** — no Rails counterpart, but required by a TS-specific constraint or the incremental model; cannot simply delete.
- **port-only / vestigial** — no Rails counterpart and not load-bearing; deletable now or as a side effect of convergence.

## `Aliases` class

| TS member                   | Rails counterpart                         | Class                                                                                                               |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `_aliasCache`               | `@alias_cache`                            | faithful                                                                                                            |
| `_columnsCache`             | `@columns_cache`                          | faithful                                                                                                            |
| `_allColumns`               | (none — Rails `columns` flat_maps lazily) | port-only / load-bearing (cache for `columns()`)                                                                    |
| `columns()`                 | `columns`                                 | faithful (Rails computes via `flat_map(&:column_aliases)`; TS returns the cache)                                    |
| `columnAliases(node)`       | `column_aliases(node)`                    | faithful                                                                                                            |
| `columnAlias(node, column)` | `column_alias(node, column)`              | faithful                                                                                                            |
| `AliasMap` interface        | `Aliases::Column` (Struct)                | renamed — but carries extra `tableIndex` / `columnIndex` (port-only fields used by `_buildSelectArelNodes`)         |
| `{ node, columns }` literal | `Aliases::Table` (Struct)                 | renamed — Rails' `Table#column_aliases` builds `t[name].as(alias)`; TS does that in `_buildSelectArelNodes` instead |

`Aliases` is the closest-converged of the three classes. The only gap is that
Rails' `Aliases::Table` knows how to emit its own arel select columns
(`column_aliases` → `t[column.name].as(column.alias)`), whereas TS externalizes
that into `JoinDependency._buildSelectArelNodes` using the `_arelTablesByIndex`
side-map. Converging arel-table ownership into the `Table` struct (story 3)
would let `_arelTablesByIndex` be deleted.

## `JoinDependency` — fields

| TS field                            | Rails counterpart                                  | Class                                                                                                                        |
| ----------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `_baseModel`                        | (derived: `join_root.base_klass`)                  | renamed / port-only — Rails has no field; `base_klass` delegates to `join_root`                                              |
| `_baseAlias`                        | `join_root_alias` (partial)                        | port-only / load-bearing — seeded eagerly; Rails derives the alias in `aliases` from `join_root_alias`                       |
| `_baseTableIndex`                   | (inline `i==0` in `aliases`)                       | port-only / vestigial — always 0; Rails uses `each_with_index`                                                               |
| `_nextTableIndex`                   | (inline `each_with_index` in `aliases`)            | port-only / load-bearing (incremental) — disappears with build-once                                                          |
| `_aliases` (flat `AliasMap[]`)      | (none — `aliases` built lazily from `join_root`)   | port-only / load-bearing (incremental) — the central alias crutch                                                            |
| `_aliasTracker`                     | `@alias_tracker`                                   | faithful — but Rails sets it inside `join_constraints`, TS in the constructor                                                |
| `_arelTablesByIndex`                | (none — Rails reads `node.table` on the fly)       | port-only / load-bearing — absorbable into `Aliases::Table` (story 3)                                                        |
| `_joinRoot`                         | `@join_root`                                       | faithful                                                                                                                     |
| `_joinType`                         | `@join_type`                                       | faithful                                                                                                                     |
| `_treeNodesByPath`                  | (none — single `walk_tree` folds duplicates)       | port-only / load-bearing (incremental) — deleted by story 2                                                                  |
| `_references`                       | `@references`                                      | renamed — Rails builds it transiently in `join_constraints`; TS persists it as a field (also seeded via `setReferences`)     |
| constructor `(baseModel, joinType)` | `initialize(base, table, associations, join_type)` | **divergent** — Rails builds the tree in the constructor; TS builds an empty root and defers to incremental `addAssociation` |

## `JoinDependency` — methods (Rails-mapped)

| TS method                                               | Rails counterpart                                           | Class                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `joinRoot` (getter)                                     | `join_root` (protected attr)                                | faithful                                                                                                                                                |
| `baseKlass` (getter)                                    | `base_klass`                                                | faithful (Rails delegates to `join_root.base_klass`)                                                                                                    |
| `reflections` (getter)                                  | `reflections` (`join_root.drop(1).map!(&:reflection)`)      | renamed — TS re-reflects via `reflectOnAssociation` walk instead of reading `node.reflection`                                                           |
| `joinType` (getter)                                     | `join_type` (protected attr)                                | faithful                                                                                                                                                |
| `joinRootAlias` (getter)                                | `join_root_alias` (private attr)                            | renamed / faithful                                                                                                                                      |
| `aliasTracker` (getter)                                 | `alias_tracker` (private attr)                              | faithful                                                                                                                                                |
| `joinConstraints(joinsToAdd, aliasTracker, references)` | `join_constraints(joins_to_add, alias_tracker, references)` | faithful — signature & top-level structure match                                                                                                        |
| `makeJoinConstraints`                                   | `make_join_constraints`                                     | faithful                                                                                                                                                |
| `walk`                                                  | `walk`                                                      | renamed — same partition/intersection logic, but TS injects `_rebindChildOnPredicates` (no Rails analogue)                                              |
| `makeConstraints`                                       | `make_constraints`                                          | renamed / **hollowed** — Rails resolves aliases + builds constraints here; TS only re-emits the pre-built `child.arelJoin`                              |
| `instantiate`                                           | `instantiate`                                               | renamed — entry point; delegates to `construct` → `instantiateFromRows`                                                                                 |
| `instantiateFromRows`                                   | `instantiate` (body)                                        | renamed — reimplemented with raw-PK maps instead of Rails' `seen` / `model_cache` / `compare_by_identity`                                               |
| `construct` (private)                                   | `instantiate` (tail)                                        | renamed                                                                                                                                                 |
| `_constructRecursive`                                   | `construct`                                                 | renamed                                                                                                                                                 |
| `constructModel`                                        | `construct_model`                                           | renamed — heavily reworked (proxy wiring split out)                                                                                                     |
| `applyColumnAliases`                                    | `apply_column_aliases`                                      | faithful                                                                                                                                                |
| `each`                                                  | `each`                                                      | renamed — **behavioral nuance**: Rails `each` delegates to `join_root.each` (yields `join_root` + descendants); TS iterates `nodes` (excludes the root) |
| `aliases()` (private)                                   | `aliases` (private)                                         | renamed — Rails builds from `join_root.each_with_index`; TS reconstructs by filtering the `_aliases` flat array                                         |
| `findReflection`                                        | `find_reflection`                                           | faithful                                                                                                                                                |
| `build` (private)                                       | `build`                                                     | faithful — but only reached via `validateEagerLoadSpec`, not the main flow                                                                              |
| `makeTree` / `walkTree` (static)                        | `make_tree` / `walk_tree`                                   | faithful **but unused** — see vestigial table                                                                                                           |

## `JoinDependency` — port-only members (with verdicts)

| TS member                                                                  | Why it exists                                                                                                                                                                  | Verdict                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------- |
| `_treeNodesByPath`                                                         | Path index to dedup shared prefixes across separate incremental `addAssociation` calls.                                                                                        | **Absorbable.** Rails' single `make_tree` / `walk_tree` pass folds duplicate keys structurally (`hash[k]                                                                                                                                                                                                                                                       |     | = {}`). Deleted by story 2. |
| `_snapshotTree` / `_restoreTree`                                           | All-or-nothing rollback for each incremental add (a mid-walk `EagerLoadPolymorphicError` or unjoinable segment must leave the instance unchanged).                             | **Absorbable.** Build-once validates the whole tree before mutating anything (`build` raises before `JoinBase.new`), so there is nothing to roll back. Deleted by story 2.                                                                                                                                                                                     |
| `_rollbackTree`                                                            | Mechanism backing `_restoreTree` (removes nodes added since snapshot).                                                                                                         | **Absorbable** — same fate as snapshot/restore.                                                                                                                                                                                                                                                                                                                |
| `_arelTablesByIndex`                                                       | Side-map from table index → arel `Table`, consumed by `_buildSelectArelNodes`.                                                                                                 | **Absorbable.** Belongs on `Aliases::Table` (Rails' `Table#column_aliases` owns its `node.table`). Deleted by story 3.                                                                                                                                                                                                                                         |
| `setReferences`                                                            | Setter so `relation.ts` can seed `@references` before calling `joinConstraints([])`.                                                                                           | **Absorbable.** Rails threads `references` as the third arg to `join_constraints`; `relation.ts` should pass it there. Converges in story 4 (the dual-path `_references` field collapses to a `join_constraints` local).                                                                                                                                       |
| `rebindTableReferences` (module fn)                                        | Rewrites ON-predicate table references when a table was aliased _after_ its constraint was built.                                                                              | **Absorbable.** Needed only because TS resolves aliases early (in `addAssociation`). Rails resolves at `make_constraints` time via `AliasTracker.aliased_table_for`, so predicates reference the final table from the start. Deleted by stories 3–4.                                                                                                           |
| `_rebindChildOnPredicates`                                                 | `walk`-time variant of the above for re-rooted subtrees.                                                                                                                       | **Absorbable** — same root cause; deleted by story 4.                                                                                                                                                                                                                                                                                                          |
| `addAssociation`                                                           | The incremental builder — resolves alias, builds `arelJoin`, pushes aliases, inserts tree node, all per call.                                                                  | **Load-bearing now / absorbable.** Its responsibilities split cleanly between Rails' `build` (tree) and `make_constraints` (alias + join). Replaced by story 2 (tree) + story 4 (constraints).                                                                                                                                                                 |
| `addNestedAssociation`                                                     | Dotted-path incremental add with snapshot/restore.                                                                                                                             | **Absorbable** — folds into `make_tree` (story 2).                                                                                                                                                                                                                                                                                                             |
| `addAssociationSpec` / `_walkSpec` / `_addOrReuse`                         | Spec-shaped incremental add (string/array/hash) with shared-prefix reuse + rollback.                                                                                           | **Absorbable.** This is exactly `make_tree` / `walk_tree` over the eager-load value; `eagerSpecToTree` already produces the hash Rails' `build` consumes. Story 2 routes specs through `make_tree` and these dissolve.                                                                                                                                         |
| `_insertTreeNode` / `_resolveTreeParent`                                   | Tree-mutation helpers for incremental insertion.                                                                                                                               | `_insertTreeNode` **absorbable** (build-once appends children in `build`); `_resolveTreeParent` is **vestigial** — defined but never called.                                                                                                                                                                                                                   |
| `_addThroughViaJoinAssociation`                                            | Pre-allocates chain table indices and emits joins for `through` associations (Rails handles `through` generically via `reflection.chain` inside `make_constraints`).           | **Load-bearing now / absorbable, hardest.** Rails has no special-case method; the chain is walked in `make_constraints`. Converging requires story 4 to drive `make_constraints` from `reflection.chain`. Highest behavioral risk.                                                                                                                             |
| `_buildBaseAliases`                                                        | Seeds base-table aliases in the constructor.                                                                                                                                   | **Absorbable** — the lazy `aliases()` already covers the root (`join_part == join_root` branch in Rails). Deleted by story 3.                                                                                                                                                                                                                                  |
| `_buildSelectArelNodes` / `buildSelectArel`                                | Build select columns from `_aliases` + `_arelTablesByIndex`.                                                                                                                   | **Absorbable** — Rails' `Aliases#columns` + `Table#column_aliases` produce these. Converges in story 3.                                                                                                                                                                                                                                                        |
| `_addStiConstraintArel`                                                    | Adds the STI `type IN (...)` predicate to a join's ON clause.                                                                                                                  | **Port-only / load-bearing, stays for now.** Rails folds STI into the association scope (`JoinAssociation` / `reflection.constraints`), not into `JoinDependency`. Out of scope for 0027; flag for a separate scope-convergence story.                                                                                                                         |
| `_wireAssociationProxy`                                                    | Sets `other.target` / `loaded!` on the parent's association proxy during construct.                                                                                            | **Port-only / load-bearing.** Rails does this inline in `construct` / `construct_model` (`other.target = model`). Absorbable into `_constructRecursive` during story 5, but the proxy API differs from Rails' `association(...)` — keep as a helper.                                                                                                           |
| `_markAssociationLoaded`                                                   | Marks an empty association loaded when the join row is all-null.                                                                                                               | **Port-only / load-bearing.** Mirrors Rails' inline `nil_association.loaded!`. Keep (small, faithful in intent).                                                                                                                                                                                                                                               |
| `_isNodeReadonly` / `_isNodeStrictLoading`                                 | Compute per-node readonly / strict-loading flags.                                                                                                                              | **Port-only / misplaced.** Rails reads `node.readonly?` / `node.strict_loading?` **on the `JoinAssociation`**. These belong on `JoinPart`, not `JoinDependency`. Move during story 5.                                                                                                                                                                          |
| `getModelColumns` (module fn)                                              | Resolve a model's column names (with PK prepended).                                                                                                                            | **Port-only / load-bearing.** Rails uses `join_part.column_names`. Absorbable into `JoinPart`, but TS needs the `columnsHash()` → `loadSchema()` guard. Keep as a helper or move to `JoinPart`.                                                                                                                                                                |
| `validateEagerLoadSpec` (+ `build` + `findReflection` + `eagerSpecToTree`) | Validate an eager-load spec (raise `ConfigurationError` / `EagerLoadPolymorphicError`) **without** building the real tree — used by the calc/exists path (`relation.ts:2945`). | **Port-only / load-bearing — resolves RFC open Q1.** This _is_ a faithful port of Rails `build`. In Rails the validation is a side effect of `build` during `construct_join_dependency`; the calc/exists path needs validation without instantiation, so a thin entry point stays. Post-story-2 it collapses to calling the shared `build`. **Not vestigial.** |
| `nodes` (getter)                                                           | Filtered walk excluding root and index-less nodes.                                                                                                                             | **Port-only / load-bearing.** Rails uses `join_root.drop(1)` (reflections) and `each_with_index` (aliases). Absorbable into those idioms.                                                                                                                                                                                                                      |
| `[Symbol.iterator]`                                                        | JS iteration protocol over `nodes`.                                                                                                                                            | **Port-only / load-bearing (TS idiom).** No Rails analogue needed; keep.                                                                                                                                                                                                                                                                                       |

### Vestigial (deletable now, independent of stories 2–5)

| TS member                        | Reason                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeTree` / `walkTree` (static) | Faithful port of `make_tree` / `walk_tree`, but **no caller** — the incremental path uses `eagerSpecToTree` instead. Story 2 should _adopt_ these (route construction through them) rather than leave them dead. |
| `_resolveTreeParent`             | Defined; **never called**. Duplicate of `_insertTreeNode`'s parent-lookup.                                                                                                                                       |
| `_baseTableIndex`                | Always `0`; a constant masquerading as state.                                                                                                                                                                    |

## `JoinLeaf` class

| TS member                          | Rails counterpart                                         | Class                                                     |
| ---------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `JoinLeaf` (whole class)           | (none)                                                    | port-only / load-bearing                                  |
| `_tableOverride` / `table` get/set | `JoinPart#table` (mutable in `walk`: `r.table = l.table`) | renamed — mirrors Rails reassigning `table` during `walk` |
| `isMatch` override                 | `JoinPart#match?`                                         | renamed / faithful                                        |

Rails has no `JoinLeaf`. TS uses it for two things: (1) through-chain
**intermediate** tables (Rails models these as `JoinAssociation` nodes built
from `reflection.chain`), and (2) non-reflection leaf nodes when no reflection
is available. **Verdict: load-bearing now, absorbable.** Once `through`
converges to Rails' `reflection.chain`-driven `make_constraints` (story 4), the
intermediate tables become ordinary `JoinAssociation` nodes and `JoinLeaf` can
be deleted, or retained only as the no-reflection fallback.

## Target shape (for RFC Design)

1. **Constructor builds once.** `JoinDependency(base, associations, joinType)`
   calls `makeTree(associations)` → `build(tree, base)` → `JoinBase.new(...)`,
   exactly as Rails. `relation.ts` stops calling incremental
   `addAssociation` / `addAssociationSpec` and passes the full eager-load hash
   (via the existing `eagerSpecToTree`) to the constructor. Deletes:
   `_treeNodesByPath`, `_snapshotTree`/`_restoreTree`/`_rollbackTree`,
   `addAssociation`, `addNestedAssociation`, `addAssociationSpec`,
   `_walkSpec`, `_addOrReuse`, `_insertTreeNode`, `_resolveTreeParent`,
   `_nextTableIndex`. Adopts the existing static `makeTree`/`walkTree`.
2. **Lazy `Aliases` from the tree.** Keep the already-faithful `aliases()` but
   build it from a `join_root.each_with_index` walk (Rails) rather than the
   `_aliases` flat array. Move arel-table ownership onto `Aliases::Table`.
   Deletes: `_aliases`, `_arelTablesByIndex`, `_baseTableIndex`,
   `_buildBaseAliases`, `_buildSelectArelNodes`'s side-map dependency.
3. **Alias resolution at constraint time.** `make_constraints` resolves aliases
   via `AliasTracker.aliased_table_for` + a `@joined_tables` map and builds the
   join there (un-hollow it). Deletes: early `arelJoin` construction in the
   builder, `rebindTableReferences`, `_rebindChildOnPredicates`,
   `setReferences` (references thread through `joinConstraints`).
4. **`through` via `reflection.chain`.** Drive the chain inside
   `make_constraints` so intermediates are `JoinAssociation` nodes. Deletes:
   `_addThroughViaJoinAssociation`; allows deleting `JoinLeaf`.
5. **`instantiate` / `construct` to Rails shape.** Converge
   `instantiateFromRows` / `_constructRecursive` to Rails' `seen` /
   `model_cache` / `compare_by_identity` structure; move `_isNodeReadonly` /
   `_isNodeStrictLoading` onto `JoinPart` (`readonly?` / `strict_loading?`).

Out of scope (flag separately): `_addStiConstraintArel` (belongs in association
scope convergence, not 0027).

## Stop-or-go: stories 2–5

**GO.** The mapping shows the port-only state is overwhelmingly _incremental
scaffolding_, not TS-language necessity — the one genuine TS-specific concern
(no `method_missing` on join rows) lives in the proxy-wiring helpers, which are
small and survive convergence. The build-once half of the class already exists
and is faithful, so convergence is a matter of _deleting_ the incremental layer
and routing through the Rails-shaped methods already present.

Ordering / risk notes for scheduling:

- **Story 2 is the keystone and gates 3–5.** It deletes the largest share of
  port-only state and requires migrating `relation.ts` callers
  (`addAssociation*` → construct-time tree). Land it first and alone.
- **Story 4 (`through` + constraints) is the highest behavioral risk** —
  `_addThroughViaJoinAssociation` + `JoinLeaf` encode self-join alias naming
  and chain reversal that must be re-derived against Rails' `make_constraints`.
  Budget extra review here.
- **RFC open Q1 resolved:** `validateEagerLoadSpec` / `build` / `eagerSpecToTree`
  is load-bearing (calc/exists path), is already a faithful port, and **stays**
  — collapsing into the shared `build` after story 2 rather than dissolving.
- Each of stories 2–5 stays within the RFC's existing ~400–450 LOC estimates
  and remains independently test-suite-gated and behavior-preserving.
