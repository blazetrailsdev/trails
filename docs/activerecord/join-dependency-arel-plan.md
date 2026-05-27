# JoinDependency → Full Rails Fidelity Plan

All plan PRs (1–7b, F1–F6) have shipped.
([merged PR list](https://github.com/blazetrailsdev/trails/pulls?q=is%3Apr+is%3Amerged+JoinDependency+OR+JoinAssociation+OR+AliasTracker+OR+%22join-dependency%22))

## Post-merge follow-ups

**From #2429 (F2 — through-associations)**

- [ ] ~220 LOC: Delete dead `_addThroughAssociation` + `_finishThroughTarget` — retained as fallback when no reflection exists. Deletion blocked on a cleanup pass over the same area.
- [ ] ~10 LOC: Add `isCollection()` delegation to `PolymorphicReflection` — workaround reaches into `_reflection.macro`.
- [ ] `PolymorphicReflection#joinScopes` `buildScope(table)` ignores the `table` parameter. Works because the relation's default table matches, but diverges from Rails.

**From #2435 (F3 — eliminate \_nodes)**

- [ ] ~150 LOC: Delete `JoinNode` interface, fold properties onto `JoinPart` subclasses — `JoinNode` still exported and used by relation.ts (~6 call sites).
- [ ] ~30 LOC: Delete `_pushTreeNode`, build tree nodes directly in `addAssociation` — blocked on JoinNode deletion.
- [ ] ~20 LOC: Delete `JoinTreeNode` class — used as fallback when reflection is null.

**From #2447 (F5 — AliasTracker wiring)**

- [ ] `JoinAssociation#joinConstraints` accepts `aliasTracker` as 4th param but does not use it in the body — wired for signature parity only. Will matter when `make_constraints`/`@joined_tables` dedup is ported.
- [ ] `_references` param on `JoinDependency#joinConstraints` is unused — Rails uses it for eager-load reference tracking.

**From #2448 (F4 — nested hydration)**

- [ ] ~20–30 LOC: add `aliasTracker` getter + `findReflection` helper to `join-dependency.ts` (brings api:compare to 19/21).
- [ ] ~50 LOC: port `build` — depends on `reflection.checkValidity!` / `checkEagerLoadable!`.
- [ ] ~30 LOC: implement `association_cached?` shortcut in `_constructRecursive` for singular already-cached associations.
- [ ] ~20 LOC: move `setInverseInstance` call into `constructModel` before proxy wiring to match Rails ordering.
- [ ] ~40 LOC: implement readonly/strictLoading propagation in `_constructRecursive`.

**From #2430 (F6 — extra columns)**

- [ ] ~30 LOC: Pass `column_types` from result set for proper type-casting of extra columns. Low priority — only matters if adapter returns uncast DB types for computed columns.

## Non-goals

- Rewriting the reflection system
- `InnerJoin` support for `joins()` (`eager_load` path only)
- Full `AliasTracker` feature parity beyond what `alias-tracker.ts` already covers
