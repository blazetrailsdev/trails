# Associations gap plan

Open work in the associations layer: **D2** (has_one fixture bodies, blocked on
Phase G) and ~10 scattered single-test gaps (Track 9). ~18 tests are
permanent-skip (marshal, Ruby-only). Edge cases that need follow-up work are
tracked under **Post-merge follow-ups** below.

---

## Track 4: has_one — D2 remaining (~24 fixture-gated tests)

### PR D2: has_one fixture bodies

**Problem:** ~24 of 27 skips are `/* fixture-dependent */` — the has_one
implementation is largely complete but tests lack data.

**Depends on:** Phase G fixture adoption (see `docs/activerecord/fixtures-adoption-plan.md`)

**Est:** ~200 LOC (test bodies only)

---

## Track 9: Scattered single-test gaps (unlocks ~10 tests)

These are individual root causes that don't cluster into a track:

| Test file                             | Gap                                                                                      | Est       |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| `has-many-associations.test.ts`       | Counter cache updates in memory after create/push/empty (3 tests)                        | ~40 LOC   |
| `belongs-to-associations.test.ts`     | `readonly` check on save (1 test)                                                        | ~10 LOC   |
| `nested-error.test.ts`                | Nested attributes error semantics (4 tests) — blocked on `accepts_nested_attributes_for` | Phase G   |
| `extension.test.ts`                   | only the 2 Marshal tests remain — no TS equivalent (permanent-skip)                      | permanent |
| `required.test.ts`                    | `belongsToRequiredByDefault` config (1 test)                                             | ~10 LOC   |
| `left-outer-join-association.test.ts` | Arel join node in left outer join (3 tests)                                              | ~30 LOC   |
| `inner-join-association.test.ts`      | Inner join edge cases (2 tests)                                                          | ~20 LOC   |

---

## Dependency graph

Remaining:

```
D2 (has_one fixture bodies — blocked on Phase G fixtures)
Track 9 scattered single-test gaps (mostly standalone)
```

## Recommended priority

| PR/area | Tests | Est LOC     | Depends on | Why                                       |
| ------- | ----- | ----------- | ---------- | ----------------------------------------- |
| Track 9 | ~10   | ~10–40 each | —          | Counter-cache, readonly, join-node edges  |
| D2      | ~24   | ~200        | Phase G    | has_one fixture bodies — external blocker |

The deeper edge-case work (eager_load raise semantics, store unification,
alias-tracker self-joins, etc.) is itemized under **Post-merge follow-ups**
below — sized and ready to lift into new track entries when prioritized.

**Remaining coverage:** ~18 permanent-skip (marshal, Ruby-only), ~10 scattered
single-test gaps (Track 9), ~24 fixture-gated (D2).

---

## Post-merge follow-ups

Forward-looking items needing follow-up work, grouped into PR-sized work units.

### Actionable PR queue

The open `[ ]` items below, bundled into ≤300-LOC, non-overlapping work units
and ordered by readiness. Each line is scope · files · unblocks · est · source.
The per-PR sections that follow are the detail / rationale for each item.

**Ready now (no unmerged dependency):**

- **AF1 — inverse-of completion** (~65 LOC). Add the `foreignKeyFor(record)`
  gate to `Association#inverseAssociationFor`, and teach
  `canFindInverseOfAutomatically` to handle composite (`queryConstraints`) FKs.
  Files: `associations/association.ts`, `reflection.ts`,
  `inverse-associations.test.ts`. Unblocks the 2 composite-FK
  automatic-inverse tests. Source: #2584.
- **AF2 — CollectionProxy#size port** (~30 LOC). Finish the
  `CollectionProxy#size` port: add the `!find_target?` (new-record →
  `target.size`), `@association_ids`, `group_values`, and `distinct_value`
  guards (only the `!distinct_value && !target.empty?` branch exists today).
  Files: `associations/collection-proxy.ts`,
  `associations/collection-association.ts`. Source: #2591.
- **AF3 — HMT array-assignment build** (~90–160 LOC). Route new-owner
  `CollectionAssociation#replace` through `replace_records → concat` so
  `post.people = [..]` / `Category.new(authors: [..])` build through-rows in
  memory; route `throughScopeAttributes` through `throughScope(assoc) ?? scope`.
  Files: `associations/collection-association.ts`,
  `associations/has-many-through-association.ts`. Unblocks
  `test_both_parent_ids_set_when_saving_new`,
  `test_assign_array_to_new_record_builds_join_records`. Source: #2581.
- **AF4 — HMT delete override wiring** (~40 LOC). Wire the faithful-but-unwired
  standalone helpers in `has-many-association.ts:207` /
  `has-many-through-association.ts:224` as actual `protected override
deleteOrNullifyAllRecords(method)` methods of the `CollectionAssociation`
  base dispatch (currently dead code). The HMT override
  (`deleteRecords(loadTarget, method)`) routes HMT `delete_all` through join-row
  deletion with counter-cache callbacks (`has_many_through_association.rb:136-138`)
  instead of base bulk `scope.deleteAll`. Fold in the nil-method semantics fix
  (base treats `nil` method as DELETE; Rails `HasMany#delete_count` nullifies).
  Files: `associations/has-many-association.ts`,
  `associations/has-many-through-association.ts`. Source: #2575, #2602, #2631.
- **AF5 — eager_load raise semantics** (~150 LOC, new track entry).
  Distinguish raise-worthy specs (polymorphic / misspelled →
  `EagerLoadPolymorphicError` / `ConfigurationError`) from capability-gap
  fallbacks (CPK / unjoinable-through) in `addAssociation`/`_walkSpec`. Files:
  `associations/join-dependency.ts`, `relation.ts`. Unblocks
  `eager_test.rb:1639` mirror + polymorphic-references stubs. Source: #2571.
- **AF6 — H2 alias-tracker self-join** (~200 LOC). JoinDependency AliasTracker
  self-join alias emission. Files: `associations/join-dependency.ts`,
  `associations/alias-tracker.ts`. Unblocks the 3 nested-through self-join
  tests (`taggings_authors_join` etc.). Source: #2585.
- **AF7 — strict-loading exec_queries parity** (~60 LOC + ~100 deletions).
  Drop the owner-strict backstop in `association-relation.ts`
  `_checkStrictLoading`; delete the method + 10 call sites + 9 vestigial
  pass-through aggregate overrides. Files: `association-relation.ts`. Source:
  #2615.
- **AF8 — association-scope `nextChainScope`/`join`** (~30–60 LOC). Wire `join`
  into `nextChainScope` (Arel constraint nodes), move the polymorphic `_type`
  filter to a WHERE via `applyScope`; audit `scope()` for
  `extending! reflection.extensions`. Files:
  `associations/association-scope.ts`. Source: #2556, #2599.
- **AF9 — eager-load suggestions** (~40 LOC). Raise `AssociationNotFoundError`
  on unknown top-level eager assoc in `preloader/branch.ts` `groupedRecords()`
  (keep nested-through-null silent); rework the 2 misnamed flat-string tests to
  Rails' nested-hash form. Files: `associations/preloader/branch.ts`,
  `eager.test.ts`. Unblocks `exceptions have suggestions for fix`. Source:
  #2594.
- **AF10 — small-fix bundle** (~115 LOC, to ceiling). has_one inverse build
  test (#2557, ~15) + `association.delete` nullify/delete-all else-branch test
  (#2596, ~30) + delete dead free fns `countRecords`/`intersection` in
  `has-many-association.ts` (#2596, ~10; NB: do **not** delete
  `deleteOrNullifyAllRecords` — AF4 wires it as the dispatch override) +
  `InverseOfAssociationNotFoundError`/`HasManyThroughAssociationNotFoundError`
  DidYouMean-formatter alignment (#2594) + `InverseOfAssociationRecursiveError`
  class + recursion detection (#2591, ~50).

**Round-3 follow-ups (named, PR-sized):**

### follow-up: strict-loading message + n+1 test fidelity (~70 LOC)

Files: `core.ts`, `reflection.ts`, `associations/association.ts`,
`strict-loading.test.ts`. Source: #2619.

- ~30 LOC: route the `strictLoadingViolationBang` dispatch message through
  `reflection.strictLoadingViolationMessage` so it picks up the polymorphic
  variant ("The polymorphic association named `:x` cannot be lazily loaded.").
  Unskips `strict loading violation logs on polymorphic relation` + the
  `:raise` polymorphic test. The reflection method already exists
  (`reflection.ts:260`).
- ~40 LOC: tighten the unskipped `:n_plus_one_only` tests to Rails fidelity —
  assert (a) loaded children ARE `strict_loading?` and (b) nested access on a
  child RAISES. The functional `loadHasMany`/`loadBelongsTo` helpers don't
  cascade strict_loading; only the OO `Association#setStrictLoading` path does
  (`association.ts:168-182`), so port these two through the OO
  `association()` / collection-proxy path.

### follow-up: `_addToTarget` distinct_value dedup (~10 LOC)

Files: `associations/collection-proxy.ts`. Source: #2629. Rails'
`add_to_target` computes `replace: replace || association_scope.distinct_value`
so a `distinct` association scope dedups on append. Both the non-through `push`
path and the new `_pushThrough` pass `{}` (replace=false), ignoring
`distinct_value`. Wire it into the `replace` option once a Rails test exercises
it.

**Gated (sequence after the listed PR):**

- **AF11 — strict-loading test unblocks** (~90 LOC + 6 tests; after AF7).
  Record-level `reload` interaction (2 tests), CollectionProxy unloaded-reader
  lazy proxy (1), validation-context association tests (2), eager has_one
  reflection opt-in (1). Files: `persistence.ts`, association loaders,
  `strict-loading.test.ts`. Source: #2615.
- **AF12 — G1b preload through-WHERE placement** (~30–50 LOC; after AF6). Fix
  the `includes`-only path that mis-places a through-table WHERE onto the SOURCE
  query. Files: `associations/preloader/through-association.ts`. Source: #2586.

**Blocked / architectural (not yet a clean PR):**

- **Collection-store unification** — merge `_cachedAssociations` and
  CollectionProxy `_target` into one store (Rails' single `@target`). Large;
  blocks faithful ports of several inverse dedup tests. Source: #2591.
- **`join_middle_table_alias`** — blocked on two infra gaps: middle HABTM
  reflection hidden in `normalizedReflections`, and
  `JoinDependency#addAssociation` bailing on composite-PK join targets. Source:
  #2563, #2608.
- **Persisted-owner HABTM source-FK governance** — fix the
  `makeHabtmWithCallbacks` test schema first, then read the join model's
  declared `associationForeignKey` in `_pushThrough`. Source: #2604.
- **Callback dispatch collapse** — fold the 3 dispatch paths into the unified
  one + Rails all-or-nothing `catch(:abort)`. Source: #2567.
- **Nested-through remainder** — HABTM-into-polymorphic-source joins,
  default_scope query-method injection, shared-source preload reset, nested-HMT
  autosave exclusion; each a separate feature. Source: #2585.

**From #2555 (A3 polymorphic guard):**

- Minor (no action unless triggered): `branch.ts`
  `_normalizeAssociationName` treats only `null`/`undefined` as "no
  association" — Rails treats `false` as nil too. Unreachable today.

**From #2557 (B1 HMT buildRecord):**

- [ ] ~15 LOC: add test mirroring Rails
      `test_build_then_save_with_has_one_inverse` (declared has_one inverse).
      The `inverse.isHasOne` branch is implemented but uncovered.
- Plan correction: the gap-plan claim that B1 unblocks "~15 tests" was
  wrong (only an unrelated marshal-dump skip exists). Future B2 still
  needed for full autosave parity (Rails sets
  `attributes[source_reflection.name] = record` so the join's belongs_to
  follows the target PK; plus `@through_records` memoization).
- Hazard: `Association.buildRecord` vs `CollectionProxy._buildThrough`
  split is a standing source of duplication/divergence for through
  associations. Future consolidation PR.

**From #2559 (A4 through-scope + STI grouping):**

- Note: the `@internal` markers at the bottom of `preloader/association.ts`
  exist solely for api:compare and are never called — fragile dead-code
  pattern; consider whether api:compare could map private class methods
  directly instead.
- Not ported: Rails' `through_scope` `elsif !reflection_scope.where_clause.empty?`
  JOIN branch was intentionally NOT ported — belongs with PR A5.

**From #2563 (F1 HABTM join-table):**

- [ ] FOLLOW-UP: `join_middle_table_alias` — `Project.includes(:developers_projects)`
      eager-loads the auto-generated HABTM join model directly. Blocked by two
      gaps outside join-dependency/alias-tracker: (1) the middle reflection is
      hidden behind its parent HABTM reflection in `normalizedReflections`, so
      `reflectOnAssociation(Project, "developers_projects")` returns null; and
      (2) `JoinDependency#addAssociation` bails when the target's primaryKey is
      composite (HABTM join models use `[ownerFk, targetFk]`), so the join model
      can never be a JOIN target. Test is `it.skip`-ped in
      `has-and-belongs-to-many-associations.test.ts`.
- Pre-existing orthogonal bug: pushing onto HABTM on a new (unsaved) owner
  leaves a stray join row with null FKs (filtered out by `loadHabtm` so
  invisible to reads). Worth its own ticket.

**From #2567 (E1 collection callback abort):**

- Loose end: three callback dispatch paths still exist
  (`collection-association.ts` unified; `collection-proxy.ts`
  `push`/`delete`/`_deleteThrough`/`create` each call
  `fireAssocCallbacks` directly). Future PR to fully collapse. Proxy's
  per-record `continue`-on-abort also diverges from Rails' all-or-nothing
  `catch(:abort)`.

**From #2568 (A2 preloader scope_for_association):** remaining
`strict-loading.test.ts` stubs depend on separate features:

- [ ] ~30–60 LOC: AssociationRelation `exec_queries` parity — drop the
      trails-specific owner-strict backstop in `association-relation.ts`
      `_checkStrictLoading` (Rails doesn't enforce strict-loading there, only
      cascades via `set_strict_loading`); delete the method + 10 call sites +
      9 vestigial pass-through aggregate overrides (~100 LOC).
- [ ] ~30 LOC + 2 tests: record-level `reload` + strict-loading (`strict
loading has one reload`, `... has many singular association and
reload`) — needs the reload / `find_from_target?` interaction.
- [ ] ~15 LOC + 1 test: CollectionProxy unloaded-reader lazy-proxy semantics
      (`strict loading with has many`).
- [ ] ~20 LOC + 2 tests: validation-context association tests (guard exists;
      needs a child model whose validation loads a strict owner's assoc).
- [ ] ~25 LOC + 1 test: eager has_one reflection opt-in (`does not raise on
eager loading a strict loading has one relation`).
- Still gated externally: habtm strict-loading, HMT cascade-to-middle.

**From #2556 (H1 AssociationScope parity):**

- [ ] ~30–60 LOC: wire `join` into `nextChainScope` — rework the JOIN ON onto
      Arel constraint nodes and move the polymorphic `_type` filter to a WHERE
      via `applyScope`, matching Rails `next_chain_scope`. Validate against the
      full through/polymorphic/disable-joins suite. Also audit `scope()` for
      `scope.extending! reflection.extensions` (may be missing). (Two
      `@internal` `association-scope.ts` wrappers remain intentionally: `join`
      — faithful but unused, can't be deleted without dropping
      `Arel::Table#join`/`SelectManager#join` in api:compare — and
      `addConstraints`' eager-load branch, where a `Nodes.OuterJoin` marker
      documents the dependency.)
- Not ported: `scope()` omits Rails' `scope.extending! reflection.extensions`
  (`association_scope.rb:27`) — tracked under `extension.test.ts` / F2.
- Not ported: `_addConstraints` uses granular pushing instead of Rails'
  `Relation#merge!` with `.except(...)` for chain_head and `.only(...)` for
  non-head. `eager_load_values`/`includes_values` propagation through chain
  not implemented.

**From #2571 (A5 eager_load → JoinDependency):**

- [ ] ~150 LOC (needs its own track entry): flat `eager_load` of a
      polymorphic or misspelled association must RAISE
      (`EagerLoadPolymorphicError` / `ConfigurationError`), not silently
      degrade to preload. `addAssociation` returns `null` for two cases Rails
      treats oppositely — (a) polymorphic/misspelled → Rails raises; (b)
      composite-key/unjoinable-through → Rails joins fine, trails degrades as a
      genuine capability gap. Distinguish them in `addAssociation`/`_walkSpec`
      and thread through `fallbackAssocs`/`_buildEagerSql`/`addNestedAssociation`.
      Unskips `eager_test.rb:1639` mirror.
- Plan accuracy: A5's "~20 tests" estimate conflated A5 with A1–A4 + a missing
  `assert_queries_count`/`assert_no_queries` harness; the remaining
  `eager.test.ts` stubs route through the preloader (`includes` without
  `references`) or need that harness, not the A5 JOIN path.

**From #2574 (F2 HABTM extend):**

- The 2 `marshalling extensions` / `marshalling named extensions` tests remain
  skipped — Ruby `Marshal` has no TS equivalent (permanent-skip).
- Deviation: `Relation#extending(fn)` function form does NOT propagate across
  clones (Rails `extending!` converts a block to a define-once Module; trails'
  `(rel) => void` is an immediate mutator not recorded in `_extending`).
  Module-object form is unaffected. No TS call path yet for block-as-module
  association extensions (`has_many :x do…end`).
- Gotcha: grouped HABTM finds must pair `group(col)` with `select(col)` or PG
  raises 42803; SQLite tolerates `SELECT *`. SQLite-only local runs won't catch
  it — remember for future grouped-association tests.

**From #2575 (B3 HMT delete/remove):**

- [ ] ~40 LOC (grouped above — _AF4 HMT delete override wiring_): wire the
      standalone `deleteOrNullifyAllRecords` helpers in `has-many-association.ts`
      / `has-many-through-association.ts` as `protected override`s of the #2631
      base dispatch, so the HMT `delete_all` routes through join-row deletion
      with counter-cache callbacks instead of base bulk `scope.deleteAll`. Watch
      `dependent: destroy/nullify/delete` regressions + the
      `rails-file-structure-method-order` lint.
- Audit: `collection-proxy.ts` `_deleteThrough`/`_deleteThroughAllSql` now
  partly dead for the delete path (proxy `delete` delegates to the association
  layer); `destroy`/`clear()` still use them. Candidate for retiring the
  duplicated proxy through-delete logic.

**From #2581 (B2 HMT concatRecords):**

- [ ] ~80–150 LOC: `CollectionAssociation#replace` on a NEW owner bypasses
      `concatRecords` (sets `target` directly), so array-assignment forms
      (`post.people = [person]`, `Category.new(authors: […])`) don't build
      through-rows in memory. Rails routes new-owner `replace` through
      `replace_records` → `concat`. Unlocks Rails-exact
      `test_both_parent_ids_set_when_saving_new` +
      `test_assign_array_to_new_record_builds_join_records` (watered-down stubs
      today).
- [ ] ~10 LOC: route `throughScopeAttributes` through `throughScope(assoc) ??
scope` so it consults the `_throughScope` ivar set during `buildRecord`.

**From #2584 (C1 + D1):**

- [ ] ~15 LOC: add the `foreignKeyFor(record)` gate to
      `Association#inverseAssociationFor` (`associations/association.ts`).
      `isForeignKeyFor`/`isInvertibleFor` already exist on the class but aren't
      consulted — without the gate an inverse can wire when the record lacks
      the FK. Matches Rails `association.rb:350-358` `invertible_for?`.
- [ ] ~50 LOC: unblock the two composite-FK automatic-inverse tests still
      `it.skip` in `inverse-associations.test.ts` (`has many`/`belongs to
inverse of derived automatically despite of composite foreign key`).
      Needs reflection-level `canFindInverseOfAutomatically` to handle
      `queryConstraints` (composite FK), not just scalar `options.foreignKey`.
- Note: D1's `AssociationTypeMismatch` message can't reproduce Rails'
  `object_id`/`record.inspect` in JS; the error `class` matches (what tests
  assert).

**From #2591 (C2 + C3 inverse wiring):**

- [ ] Architectural (large): unify the two collection stores —
      `_cachedAssociations` (inverse-of has_many wiring) and CollectionProxy
      `_target` are separate, kept in sync at the seams. C2's dedup fix had to
      seed `proxy._replacedOrAddedTargets` from `_wireInverseAssociation`
      because the inverse path writes a different store than `<<`/`push`. Rails
      has one `@target`. Unification blocks faithful ports of several skipped
      inverse dedup tests.
- [ ] ~30 LOC: complete `CollectionProxy#size` port — currently only the
      `!distinct_value && !target.empty?` branch; missing `!find_target?`
      (new-record → `target.size`), `@association_ids`, `group_values`,
      `distinct_value` guards.
- [ ] ~50 LOC: `recursive inverse on recursive model has many inversing` needs
      an `InverseOfAssociationRecursiveError` class + recursion detection in
      the inverse resolver.

**From #2594 (Did You Mean? on AssociationNotFoundError):**

- [ ] ~40 LOC (Track-1): unskip `eager.test.ts` `exceptions have suggestions
for fix`. The blocker is a `preloader/branch.ts` gap — `groupedRecords()` (~line 161)
      silently skips missing reflections for top-level eager loads instead of
      raising `AssociationNotFoundError`. Fix: (a) raise on unknown top-level
      association, (b) keep nested-through-null cases silent
      (`eager_test.rb:380,386`), (c) rework the two misnamed flat-string tests
      at `eager.test.ts:966`/`:979` to Rails' nested-hash form
      `{ author: :non_existing_association }`.
- [ ] cleanup: align `InverseOfAssociationNotFoundError` /
      `HasManyThroughAssociationNotFoundError` formatters with the DidYouMean
      formatter (two-space `"Did you mean?  "` prefix, surfaced via
      `detailedMessage()` only) instead of embedding in `message`.

**From #2596 (dependent: :destroy through removeRecords):**

- [ ] ~30 LOC test: exercise `association.delete(records)` directly on a
      `dependent: :nullify`/`:delete_all` has_many to cover the currently
      unreachable delete/nullify else-branch of `HasManyAssociation#deleteRecords`.
- [ ] ~10 LOC cleanup: pre-existing dead free functions `countRecords`,
      `intersection` in `has-many-association.ts` (definition-only, no callers;
      lint doesn't flag them). NB: the third such free fn,
      `deleteOrNullifyAllRecords`, is NOT dead-to-delete — AF4 wires it as the
      `protected override deleteOrNullifyAllRecords(method)` dispatch point, so
      leave it.
- Composite-PK non-through has_many uses a per-column `IN` over-approximation
  vs Rails' tuple `where(query_constraints => values)`; only matters if such a
  model is ported.

**From #2585 (H2 nested-through edge cases — test-only):**

- [ ] ~200 LOC: JoinDependency AliasTracker self-join alias emission (the
      heavy half of H2; the HABTM-through alias variant is handled separately).
      Unblocks 3 tests: `nested has many through with a table
referenced multiple times` (asserts canonical alias
      `taggings_authors_join`), `nested has many through with scope on
polymorphic reflection`, `polymorphic has many through joined different
table twice`.
- [ ] HABTM-into-polymorphic-source joins + scope — unblocks `has many through
polymorphic with scope`.
- [ ] default_scope query-method injection — unblocks `joins and includes from
through models not included in association`.
- [ ] shared-source preload reset — unblocks `through association preload
doesnt reset source association if already preloaded`.
- [ ] nested HMT autosave exclusion + new-record HMT readers — unblocks
      `nested has many through should not be autosaved`.

**From #2586 (G1 has_one :through — test-only):**

- [ ] ~30–50 LOC (G1b, gated on H2 landing): fix the preload (`includes`-only,
      no `references`) path that mis-places a through-table WHERE onto the
      SOURCE query (`no such column: ce_memberships.favorite`). Rails copies
      `reflection_scope.where_clause` onto the THROUGH query. Fix in
      `preloader/through-association.ts` (`_buildThroughScope` /
      source-scope application, ~lines 180-193 and 362-396). Then the
      conditions test can switch to bare `includes` to match Rails verbatim.
- 5 `disableJoins` specs in `has-one-through-disable-joins-associations.test.ts`
  remain blocked on the `disableJoins` scope chain.
- Disproven: `ThroughReflection.isPolymorphic()` recognizing `has_one :as` was
  a false skip rationale — Rails' `polymorphic?` is just `options[:polymorphic]`
  and our port already matches. Don't reintroduce an `:as` clause here.

**From #2619 (strict_loading :n_plus_one_only + :log):**

- [ ] (grouped above — _strict-loading message + n+1 test fidelity_) polymorphic
      violation-message routing + n_plus_one_only children-are-strict/nested-raise
      assertions.
- [ ] per-model strict_loading mode config — `strictLoadingMode` is global only;
      needed to unskip `strict loading logging mode can be set per model`.
- Deviation: `:log` on the singular SYNC reader (`singular-association.ts`
  `get reader()`) instruments then returns the (null) target rather than
  performing the lazy DB load — the sync reader has no `await`. Collection /
  async paths continue the load correctly. Acceptable given the sync constraint;
  a sync-reader `:log` fidelity test would expose it.

**From #2629 (route \_pushThrough/\_createThrough through \_addToTarget):**

- [ ] (grouped above — _`_addToTarget` distinct_value dedup_) wire
      `distinct_value` into the `replace` option.
- Pre-existing: Rails `concat` for a new-record owner does
  `skip_strict_loading { load_target }` before `concat_records`; trails defers
  the join but doesn't pre-load the target. No failing test observed.

**From #2620 (StrictLoadingScope module-private):**

- [ ] ~2 LOC: fix the STALE `inheritance.ts` `initializeInternalsCallback` JSDoc
      that says "integrating it into Base's init flow is a follow-up" — it IS
      already wired into the `Base` ctor (`base.ts:2331`, `base.ts:2375`).

**From #2630 (B3b HMT deletion tests):**

- [ ] ~50–150 LOC: fix self-referential `belongsTo`-source push for
      has_many :through so `collection << record` persists a join row with the
      nonstandard FK (e.g. `book2_id`) set — currently the count stays 0 after
      push (real impl gap), so the nonstandard-id test direct-seeds via
      `NsiCitation.create()` instead of `proxy.push()`. Likely lives in
      `associations/collection-proxy.ts` or the HMT insert path. Once fixed, the
      test can switch back to `push()` for full Rails fidelity.

**From #2631 (deleteAll → deleteOrNullifyAllRecords dispatch):**

- [ ] (grouped above — _AF4 HMT delete override wiring_) wire the
      `has-many-association.ts` / `has-many-through-association.ts` overrides;
      fold in the nil-method semantics fix (base `deleteOrNullifyAllRecords`
      treats `nil` method as DELETE, but Rails `HasMany#delete_count` nullifies,
      so `collection.deleteAll()` on a plain has_many with no `:dependent`
      diverges — not exercised by current tests).
