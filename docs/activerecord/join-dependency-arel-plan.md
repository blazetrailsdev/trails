# JoinDependency → Full Rails Fidelity Plan

All plan PRs (1–7b, F1–F6) have shipped.
([merged PR list](https://github.com/blazetrailsdev/trails/pulls?q=is%3Apr+is%3Amerged+JoinDependency+OR+JoinAssociation+OR+AliasTracker+OR+%22join-dependency%22))

## Post-merge follow-ups

### PR A — F3: JoinNode elimination — merged (#2511)

- [x] Delete `JoinNode` interface, fold properties onto `JoinPart` subclasses
- [x] Delete `_pushTreeNode`, build tree nodes directly via `_insertTreeNode`
- [x] Delete `JoinTreeNode` class, replaced by `JoinLeaf`

### PR B — api:compare 21/21 + hydration helpers — in progress

- [x] Add private `aliasTracker` getter
- [x] Port `findReflection` helper
- [x] Port `build` method
- [x] Implement `associationCached` shortcut in `_constructRecursive`
- [x] Wire `_references` param in `joinConstraints`
- [ ] ~30 LOC: Pass `column_types` from result set for extra-column type-casting

### PR C — F2 dead code deletion (~220 LOC)

- [ ] Delete dead `_addThroughAssociation` + `_finishThroughTarget` fallback path

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
