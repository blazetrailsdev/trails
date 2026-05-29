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

- **AF5 — eager_load raise semantics** (~150 LOC, new track entry).
  Distinguish raise-worthy specs (polymorphic / misspelled →
  `EagerLoadPolymorphicError` / `ConfigurationError`) from capability-gap
  fallbacks (CPK / unjoinable-through) in `addAssociation`/`_walkSpec`. Files:
  `associations/join-dependency.ts`, `relation.ts`. Unblocks
  `eager_test.rb:1639` mirror + polymorphic-references stubs. Source: #2571.
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
AF4 (#2649), AF6 (#2652), AF7 (#2645), AF8 (#2648), AF9 (#2647), AF10 (#2650)._

**Round-4 follow-ups (named, PR-sized):**

### follow-up: collection-size / add-to-target identity reconciliation (~70 LOC)

Files: `associations/collection-proxy.ts`, `associations/collection-association.ts`.
Source: #2633, #2643.

- ~10 LOC + tests: reconcile the two `foreign_key_present?` impls — the new
  proxy `_foreignKeyPresent()` is Rails-faithful (`false` for vanilla has_many),
  but `collection-association.ts:401` `foreignKeyPresent()` returns `true` when
  the owner's PK is present (Rails-divergent; Rails treats a new-record has_many
  owner as non-fetchable regardless of PK). Make the association override
  Rails-faithful, OR document the intentional divergence — they should not
  disagree.
- ~30–50 LOC: port AR-id-based equality into `_target` lookup in
  `_addToTarget` (Rails' `@target.index(record)`) instead of JS `===`
  (`indexOf`). Only then is the `distinct_value` wiring from #2643 observable
  in-memory (currently behaviorally inert — `_replacedOrAddedTargets` identity
  plus DB-side DISTINCT already dedup).
- ~20 LOC each: route `build` (`collection-proxy.ts:628`) and `createBang`
  (~2452) through `_addToTarget` so they hit the `set_inverse_instance` /
  replaced-or-added dedup + before/after_add callback funnel (Rails' `build`
  calls `add_to_target(record, replace: true)`).
- Separate (pre-existing): faithful `count_records` port — Rails applies
  counter_cache, the `[limit_value, count].min` clamp, and the
  `count==0 → target.select!(new_record); loaded!` side-effect; the proxy's
  `size()` delegates to `count()` which may not implement all of these.

### follow-up: strict-loading cascade on the proxy reader + mode propagation (~80 LOC)

Files: `associations/collection-proxy.ts`, `association-relation.ts`,
`associations/association.ts`, `associations/collection-association.ts`.
Source: #2644, #2645.

- ~30–50 LOC: `CollectionProxy#toArray`/`load` (`collection-proxy.ts:490,525`)
  call the functional `loadHasMany` directly, bypassing
  `CollectionAssociation.loadTarget` where `setStrictLoading` is wired — so
  `await blog.posts` (the common reader) loads children WITHOUT cascading
  strict_loading. Route the proxy load through the OO `CollectionAssociation`,
  or apply `setStrictLoading` after `loadHasMany`. (This is the architectural
  inconsistency #2644 worked around by routing the n+1 tests through the OO
  path.)
- ~30 LOC: full `exec_queries` parity — `association-relation.ts` `toArray()`
  retains a _conditional_ per-record cascade, whereas Rails'
  `Association#set_strict_loading` (association.rb:123) **always** calls
  `record.strict_loading!`, with the else branch setting `false` with `mode:
owner.strict_loading_mode`. trails never propagates the owner's strict-loading
  _mode_ onto loaded children nor explicitly clears it. Extract
  `setInverseInstanceFromQueries` / `setStrictLoading` onto the Association layer
  and route `toArray`'s inverse + strict cascade through them.

### follow-up: dependent-handling dispatch consolidation (~80 LOC)

Files: `associations.ts` (`processDependentAssociations`, ~1821),
`associations/collection-proxy.ts` (`deleteAll`, ~2473),
`associations/collection-association.ts`. Source: #2649.

The `deleteOrNullifyAllRecords` override dispatch is reached via the builder's
`before_destroy` → `handleDependency` callback and direct
`association(name).deleteAll()`. But the legacy `processDependentAssociations`
reimplements dependent handling inline and does NOT route through this dispatch;
`CollectionProxy.deleteAll` also has its own impl. Consolidate so all three
paths share the override; candidate to retire `processDependentAssociations`.

### follow-up: association-scope polymorphic-through alias coverage (~50 LOC)

Files: `associations/association-scope.ts`,
`associations/association-scope.test.ts`. Source: #2648.

- ~30 LOC: add a polymorphic-source-type-through test whose chain repeats a
  table, to pin the `_type` WHERE alias qualifier under aliasing (the qualifier
  uses `tableNode.name`; only the non-polymorphic alias case is pinned today).
- ~20 LOC: consider routing `applyScope`'s table comparison through Arel `Table`
  identity (Rails `scope.table == table`) rather than string-name comparison
  (`table !== scopeTable`), if a name-collision case ever surfaces.

### follow-up: error-message + dead-code hygiene (~25 LOC)

Files: `errors.ts`, `attribute-methods.ts`, `core.ts`. Source: #2632, #2650,
#2655.

- ~10 LOC: align `InverseOfAssociationNotFoundError` /
  `InverseOfAssociationRecursiveError` base message strings to Rails wording
  (trails drops the `in <class>` clause / adds a non-Rails second sentence; both
  pass method-level api:compare but the strings aren't Rails-faithful). Check
  for tests pinning current wording first.
- ~10 LOC: `attribute-methods.ts` `_hasAttribute` (instance) reads
  `this._attributeDefinitions` (undefined on instances) and throws if called as
  an instance method — `Association#isForeignKeyFor` was rerouted to
  `record._attributes` to dodge it (#2632). Audit/remove or fix the broken
  instance method for other callers.
- ~40 LOC (separate): wire `core.ts` `initInternals` properly — it sets
  `_strictLoadingMode`/`_readonly`/`_destroyed`/`_destroyedByAssociation`/`_strictLoading`
  but is **dead code** (only call site is the never-called wrapper in
  `attribute-methods.ts:692`). #2655's per-model `strictLoadingMode` used a lazy
  `effectiveStrictLoadingMode` fallback instead; wiring init_internals at
  construction would let the fallback be removed. Touches `base.ts` ctor (mind
  the suppress-after-initialize dance).

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
