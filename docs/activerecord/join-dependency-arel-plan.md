# JoinDependency → Full Rails Fidelity Plan

All plan PRs (1–7b, F1–F6) have shipped.
([merged PR list](https://github.com/blazetrailsdev/trails/pulls?q=is%3Apr+is%3Amerged+JoinDependency+OR+JoinAssociation+OR+AliasTracker+OR+%22join-dependency%22))

## Post-merge follow-ups

### PR A — F3: JoinNode elimination (~200 LOC) — in progress

- [x] Delete `JoinNode` interface, fold properties onto `JoinPart` subclasses
- [x] Delete `_pushTreeNode`, build tree nodes directly via `_insertTreeNode`
- [x] Delete `JoinTreeNode` class, replaced by `JoinLeaf`

### PR B — F2 cleanup + F4 helpers + F5/F6 wiring (~270 LOC)

- [ ] ~220 LOC: Delete dead `_addThroughAssociation` + `_finishThroughTarget`
- [ ] ~20–30 LOC: Add public `aliasTracker` getter + `findReflection` helper
- [ ] ~50 LOC: Port `build` (depends on `checkValidity!` / `checkEagerLoadable!`)
- [ ] ~30 LOC: Implement `associationCached` shortcut in `_constructRecursive`
- [ ] ~10 LOC: Wire `_references` param in `joinConstraints`
- [ ] ~30 LOC: Pass `column_types` from result set for extra-column type-casting

### Already shipped (verified 2026-05-27)

- [x] `PolymorphicReflection.isCollection()` delegation — in `reflection.ts`
- [x] `PolymorphicReflection#joinScopes` now passes `table` to `buildScope` — in `reflection.ts`
- [x] `aliasTracker` wired into `JoinAssociation#joinConstraints` body — in `join-association.ts` / `join-dependency.ts`
- [x] `checkEagerLoadable!` called — in `join-dependency.ts` `addAssociation`
- [x] `setInverseInstance` call ordering — in `join-dependency.ts` `_wireAssociationProxy`
- [x] readonly/strictLoading propagation — in `join-association.ts` `isReadonly` / `isStrictLoading`

## Non-goals

- Rewriting the reflection system
- `InnerJoin` support for `joins()` (`eager_load` path only)
- Full `AliasTracker` feature parity beyond what `alias-tracker.ts` already covers
