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

The deeper edge-case work (eager_load raise semantics, collection-store
unification, nested-through remainder, etc.) is itemized under **Post-merge
follow-ups** below — sized and ready to lift into new track entries when
prioritized.

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

- **AF11 — strict-loading test unblocks** (~90 LOC + 6 tests; AF7 dep now
  satisfied by #2645). Record-level `reload` interaction (2 tests),
  CollectionProxy unloaded-reader lazy proxy (1), validation-context association
  tests (2), eager has_one reflection opt-in (1). Files: `persistence.ts`,
  association loaders, `strict-loading.test.ts`. Source: #2615.
- **AF12 — G1b preload through-WHERE placement** (~30–50 LOC; AF6 dep now
  satisfied by #2652). Fix the `includes`-only path that mis-places a
  through-table WHERE onto the SOURCE query (`no such column:
ce_memberships.favorite`). Rails copies `reflection_scope.where_clause` onto the
  THROUGH query. Files: `associations/preloader/through-association.ts`
  (`_buildThroughScope` / source-scope application, ~lines 180-193 and 362-396).
  Source: #2586.

_Shipped since round 3: AF1 (#2632 + #2642), AF2 (#2633), AF3 (#2634),
AF4 (#2649), AF5 (#2658), AF6 (#2652), AF7 (#2645), AF8 (#2648), AF9 (#2647),
AF10 (#2650)._

**Round-4 follow-ups (named, PR-sized):**

### follow-up: collection-size / count_records port (~30–50 LOC)

Files: `associations/collection-proxy.ts`, `associations/collection-association.ts`.
Source: #2633, #2643, #2660, #2677.

The foreign-key-present reconciliation, AR-id-based `_target` equality, and the
`build`/`createBang` → `_addToTarget` routing all shipped (#2660 made both
`foreign_key_present?` impls faithful via a shared `foreignKeyPresentFor`
helper; #2660 ported AR-id equality into `_addToTarget`; #2677 routed `build`
and `createBang` through the `replace_on_target` funnel). One item remains:

- Faithful `count_records` port — Rails applies counter_cache, the
  `[limit_value, count].min` clamp, and the
  `count==0 → target.select!(new_record); loaded!` side-effect; the proxy's
  `size()` delegates to `count()` which may not implement all of these.

**Gated / blocked:**

- **CollectionProxy new-owner in-memory through-rows** — #2634 fixed the
  _association_ path (`x = [...]` setter); `CollectionProxy.replace` (clear()+push())
  and `_pushThrough` are a separate path that persists via owner autosave but
  does NOT build through-rows in memory for a new owner. Needs the same treatment
  if a future test asserts in-memory join presence after `proxy.replace([...])`.
  Source: #2634.
- **cpk fixture demodulize gap** (large, cross-cutting) — shared cpk fixtures
  fold `Cpk::Car` into `CpkCar`; Rails `automatic_inverse_of` derives via
  `underscore(demodulize(name))` (`Cpk::Car` → `car`), but trails' `demodulize`
  only splits on `::`, so `CpkCar` → `cpk_car` and derivation misses. Any future
  auto-inverse test against the shared cpk fixtures silently fails. Proper fix
  (true namespacing or renaming the cpk set) touches every cpk model + many
  tests. Recorded in memory `project_cpk_fixture_demodulize_gap`. Source: #2642.

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
`strict-loading.test.ts` stubs depend on separate features (the AssociationRelation
`exec_queries` owner-strict backstop drop shipped in #2645 as AF7):

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

**From #2556 (H1 AssociationScope parity):** the `join`-into-`nextChainScope`
rework + polymorphic `_type` WHERE shipped in #2648 (AF8).

- Not ported: `scope()` omits Rails' `scope.extending! reflection.extensions`
  (`association_scope.rb:27`) — tracked under `extension.test.ts` / F2.
- Not ported: `_addConstraints` uses granular pushing instead of Rails'
  `Relation#merge!` with `.except(...)` for chain_head and `.only(...)` for
  non-head. `eager_load_values`/`includes_values` propagation through chain
  not implemented.

**From #2571 (A5 eager_load → JoinDependency):**

- [x] Done (#2658, AF5) — flat `eager_load` of a polymorphic / misspelled
      association now RAISES (`EagerLoadPolymorphicError` / `ConfigurationError`)
      on the JOIN path rather than silently degrading; CPK / unjoinable-through
      stay capability-gap fallbacks. Two residual deviations carried by #2658,
      tracked under "From #2658" below.
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

**From #2575 (B3 HMT delete/remove):** the `deleteOrNullifyAllRecords` override
wiring (AF4) shipped in #2649.

- Audit: `collection-proxy.ts` `_deleteThrough`/`_deleteThroughAllSql` now
  partly dead for the delete path (proxy `delete` delegates to the association
  layer); `destroy`/`clear()` still use them. Candidate for retiring the
  duplicated proxy through-delete logic.

**From #2581 (B2 HMT concatRecords):** new-owner `CollectionAssociation#replace`
routing through concat (#2634, AF3) and the `throughScopeAttributes` →
`throughScope(assoc) ?? scope` routing (#2632) both shipped.

**From #2584 (C1 + D1):** the `foreignKeyFor(record)` gate on
`inverseAssociationFor` (#2632) and the composite-FK
`canFindInverseOfAutomatically` (#2642, AF1) both shipped.

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
- The `CollectionProxy#size` port (#2633) and the
  `InverseOfAssociationRecursiveError` class + recursion detection (#2591, via
  #2650's audit) both shipped.

**From #2594 (Did You Mean? on AssociationNotFoundError):** the
`AssociationNotFoundError` raise + DidYouMean on unknown top-level eager assoc
(#2647, AF9) and the `InverseOfAssociationNotFoundError` /
`HasManyThroughAssociationNotFoundError` formatter alignment (#2650, AF10) both
shipped.

**From #2596 (dependent: :destroy through removeRecords):** the
`association.delete(records)` else-branch test shipped; the
`countRecords`/`intersection` "dead code" deletion was a premise error (they
mirror Rails `has_many_association.rb` private methods `count_records`/`intersection`;
deleting them regressed api:compare — retained).

- Composite-PK non-through has_many uses a per-column `IN` over-approximation
  vs Rails' tuple `where(query_constraints => values)`; only matters if such a
  model is ported.

**From #2585 (H2 nested-through edge cases — test-only):** the JoinDependency
AliasTracker self-join alias emission (the heavy half, AF6) shipped in #2652.

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

**From #2619 (strict_loading :n_plus_one_only + :log):** polymorphic
violation-message routing + n+1 test fidelity (#2644) and per-model
`strictLoadingMode` config (#2655) both shipped.

- Deviation: `:log` on the singular SYNC reader (`singular-association.ts`
  `get reader()`) instruments then returns the (null) target rather than
  performing the lazy DB load — the sync reader has no `await`. Collection /
  async paths continue the load correctly. Acceptable given the sync constraint;
  a sync-reader `:log` fidelity test would expose it.

**From #2629 (route \_pushThrough/\_createThrough through \_addToTarget):** the
`distinct_value` → `replace` wiring shipped in #2643 (though behaviorally inert
until AR-id equality lands — see _collection-size / add-to-target identity
reconciliation_ above).

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

**From #2631 (deleteAll → deleteOrNullifyAllRecords dispatch):** the
`has-many-association.ts` / `has-many-through-association.ts` override wiring +
nil-method semantics fold-in shipped in #2649 (AF4).

**From #2632 (C1 follow-up — foreignKeyFor gate + throughScope routing):**

- [ ] ~15 LOC: trails' HMT `scope()` is not join-aware (direct-FK on target
      table), unlike Rails' join-aware `self.scope`. The lightweight-stand-in
      fallback (`throughScope(assoc) ?? assoc.scope?.() ?? throughAssoc.scope?.()`)
      masks this for through-scope extraction, but the underlying gap remains
      (class note at top of `has-many-through-association.ts`). A faithful
      join-aware HMT `scope()` would let the fallback collapse to Rails' exact
      `through_scope || self.scope`.

**From #2652 (AF6 self-join alias emission):** no follow-ups (test-coverage PR
for the #2585 self-join work).

**From #2658 (AF5 eager_load raise vs CPK fallback):**

- ~30–60 LOC: unify the misspelled-`eager_load` error class. `eager_load(:misspelled).toArray()`
  → preload fallback → `AssociationNotFoundError`; `.count()`/`.exists()`/aggregates
  → `JoinDependency#validateEagerLoadSpec` → `ConfigurationError`. Both raise and
  each is Rails-faithful per path, but they differ. Route `toArray`'s path
  through `build()`-style validation (or vice-versa) for one consistent error.
  Low priority (no Rails test asserts the count-path message).
- Larger (unsized): CTE / set-op / FROM-override / composite-PK + `eager_load(:polymorphic)`
  does NOT raise — `Relation#_eagerLoadBypassesJoinDependency()` skips both the
  JOIN build and the raise-check, so it silently preloads. Internally consistent
  but diverges from Rails (which always builds the join dependency and raises).
  Closing the eager-JOIN-builder gap under those conditions also fixes the raise
  divergence. Keep `_executeEagerLoad`/`_buildEagerSql`/`_checkEagerLoadable` in
  sync with the bypass predicate. NOTE: `JoinDependency#build()`/`findReflection`
  are now load-bearing (wired into `validateEagerLoadSpec`), no longer dead code.
- ~50–200 LOC each (out of AF5 scope): two `eager.test.ts` stubs — "preloading a
  polymorphic association with references to the associated table" and
  "eager-loading …" — need the tags/taggings HMT-through-references join
  (`eager_test.rb:1634` `Post.eager_load(:tags)`), not raise semantics.

**From #2659 (error-message + `_hasAttribute` hygiene):**

- Shipped: `InverseOfAssociationNotFoundError` / `…RecursiveError` now emit the
  `in <class>` clause via threaded `this.className` at the two `reflection.ts`
  call sites, and the `_hasAttribute` instance-method hazard was addressed.
- Residual (no action unless triggered): the error CONSTRUCTORS still default
  `associatedClass` to `null` and omit the `in <class>` clause if a future
  caller passes none (trails errors take string args, no constructor-level
  `class_name` fallback). `RecursiveError`'s second arg uses `inverse.name` where
  Rails uses `options[:inverse_of].inspect` — coincide in the self-recursive
  case.

**From #2660 (collection foreignKeyPresent reconcile + AR-id equality):**

- Plan-doc correction: the prose assumed the OO `CollectionAssociation#foreignKeyPresent`
  was Rails-divergent and the proxy faithful — Rails (`ForeignAssociation`,
  included by has_many) shows the OPPOSITE. Shipped reconciliation made both
  faithful via a shared `foreignKeyPresentFor` helper + through-branch dispatch.
- Composite-PK edge (flag if audited): Rails passes a single
  `active_record_primary_key` to `attribute_present?`; trails iterates the keys
  with `.every` + `attributePresent` — a faithful extension, but note it if
  composite-PK has_many `find_target?` behavior is ever audited.

**From #2661 (strict-loading cascade on the proxy reader + exec_queries parity):**

- Shipped: the proxy reader now cascades strict_loading and `toArray` reaches
  exec_queries parity; #2680 then dropped the trails-specific
  `reflection.options.strictLoading` record-marking block in
  `AssociationRelation#toArray` for pure exec_queries parity.
- Reload-gated tests still skipped in `strict-loading.test.ts`: "strict loading
  with has many", "… has many singular association and reload", "strict loading
  has one reload" — need record-level reload re-preloading (find_from_target?
  interaction). Tracked by existing FOLLOW-UP comments in the test file.

**From #2664 / #2670 (dependent-handling dispatch consolidation + shim delete):**

- Shipped: dependent handling is consolidated through `deleteOrNullifyAllRecords`;
  the trails-only `processDependentAssociations` shim was deleted and all 67 test
  call sites migrated to `record.destroy()` (the Rails-faithful driver) in #2670;
  `restrict_with_error` abort-and-populate-errors shipped in #2676. This fully
  closes the `project_dependent_dispatch_followup_delete_shim` work item.
- ~30 LOC: `belongs_to` dependent-destroy cascade does NOT propagate a child
  abort. Rails `belongs_to_association.rb#handle_dependency` does
  `raise ActiveRecord::Rollback unless target.destroyed?`; trails
  `belongs-to-association.ts#handleDependency` ignores the `target.destroy()`
  result. Same class of gap the has_one fix closed; worth a dedicated PR once
  `ActiveRecord::Rollback` semantics are wired.
- `CollectionProxy.deleteAll` (~2491) still has its own impl rather than
  delegating to `@association.delete_all(dependent)` (Rails `collection_proxy.rb:474`);
  blocked because the base `CollectionAssociation.deleteAll` returns void (proxy
  needs an affected-row count) and the proxy models diverged-relation-state /
  through-row handling the association layer doesn't.
- I18n: `restrict_with_error` message is still a hardcoded English string, not
  Rails' i18n key with `human_attribute_name` interpolation (the "restrict with
  error with locale" tests stay `it.skip`); see "From #2676" below.

**From #2665 / #2679 (association-scope polymorphic-through alias coverage):**

- Shipped: the source-type `_type` predicate now qualifies the joined-in alias
  (`evalScope`/`_buildEntryScope` build against the entry's aliased `TableAlias`,
  Rails `build_scope(reflection.aliased_table)`); `base.ts`
  `_buildUnscopedRelation(table?)` alias-qualifies STI `type_condition` too; and
  #2679 made `applyScope` use Arel `Table#eql?` value equality (the final item).
- ~30 LOC: align the NON-aliased `_buildEntryScope` path with Rails' bare
  `build_scope` — drop the STI `type_condition` that Rails' chain-entry scope
  never carries (reflection.rb:336 → `Relation.create` bypasses core.rb:431,
  contradicting the existing comment). Needs a careful regression pass over
  polymorphic-sti-through / nested-through first.
- ~20 LOC: `nextChainScope`'s `r.type` `tableNode.name` qualifier line is only
  reachable when a polymorphic belongsTo sits mid-chain; a dedicated
  mid-chain-polymorphic alias case would pin it directly (the shipped test
  exercises the source_type_scope merge path instead).

**From #2677 (build + createBang through `_addToTarget`):**

- ~15 LOC: add a Rails-named test for `create!` (createBang) with an aborting
  `before_add` callback, asserting the record is left unsaved and NOT raised
  (the new Rollback-path behavior is currently uncovered).
- ~10 LOC: add a test asserting `build` (direct + through) wires the inverse
  instance, since `build` now runs `set_inverse_instance` (the old
  direct-mutation path skipped it).
- The `inversing` branch of Rails' `replace_on_target` is intentionally not
  supported in `_addToTarget`/`_replaceOnTarget` (neither `build` nor `create`
  use the inversing reflection path).

**From #2678 (wire initInternals in Base ctor):**

- ~4 LOC: `attribute-methods/dirty.ts:166` `initInternals` (resets
  `_mutationsBeforeLastSave`/`_mutationsFromDatabase`/`_touchAttrNames`/`_skipDirtyTracking`)
  is now uncalled — this PR removed its sole wrapper. Delete it, or — better for
  Rails fidelity — fold those mutation-tracking resets into the now-wired
  `core.ts` `initInternals` (Rails has ONE `init_internals`).
- Doc note if anyone consolidates `init_internals` later: Rails' version also
  sets `@marked_for_destruction = false`, `@_start_transaction_state = nil`, and
  `@primary_key = klass.primary_key`; trails' `core.ts` `initInternals` omits
  these (handled by other mechanisms). Structural: JS runs `initInternals` after
  `super(attrs)`, not before — set before any callback fires, functionally
  equivalent.

**From #2676 (restrict_with_error aborts + populates errors):**

- Shipped: `dependent: restrict_with_error` now `throw(:abort)`-equivalent —
  `destroy` returns false (no raise) and populates `record.errors[:base]`,
  matching Rails (was previously a thrown `DeleteRestrictionError`).
- ~50–200 LOC: true I18n locale-override is still a feature gap. The has_one
  "restrict with error with locale" test stays `it.skip`; the has_many locale
  test asserts the default humanized name, not a `store_translations` override.
  A real port (Rails `I18n.backend.store_translations`) unskips the has_one test
  and lets both assert the overridden record name. Depends on I18n
  attribute-translation support.
- Error-type fidelity (not blocking): Rails passes the i18n symbol
  `:'restrict_dependent_destroy.has_many'`/`.has_one` as the error type; trails
  uses type `"invalid"` with an explicit `message:` override, so
  `errors.details[:base][0][:error]` carries `"invalid"`. No Rails test asserts
  this; switch the type + wire the locale keys if `errors.details` symbol parity
  is ever needed.
