# Associations gap plan

Originally 339 skipped tests across 33 files; 20 PRs across 9 tracks,
organized by unlock potential. After two cleanup rounds, **19 of 20 PRs
shipped** (A1–A5, B1–B3, C1–C3, D1, E1, E2, F1, F2, G1, H1, H2) and only
**D2 remains** (has_one fixture bodies, blocked on Phase G). The residual
edge cases surfaced after each shipped PR are tracked under **Post-merge
follow-ups** below, not as open tracks. ~18 permanent-skip (marshal,
Ruby-only), ~10 scattered single-test gaps (Track 9).

Round-2 shipped (since the prior cleanup #2576): A5 #2571, B2 #2581,
B3 #2575, C1+D1 #2584, C2+C3 #2591, E2 #2583, F2 #2574, G1 #2586, H2 #2585,
plus follow-up PRs #2594, #2596, #2598, #2599, #2602, #2604, #2606, #2608,
#2611, #2613, #2615.

---

## Track 4: has_one (D1 shipped #2584; D2 remaining — ~24 fixture-gated tests)

### PR D2: has_one fixture bodies

**Problem:** ~24 of 27 skips are `/* fixture-dependent */` — the has_one
implementation is largely complete but tests lack data.

**Depends on:** Phase G fixture adoption (see `docs/activerecord/fixtures-adoption-plan.md`)

**Est:** ~200 LOC (test bodies only)

---

## Track 9: Scattered single-test gaps (unlocks ~10 tests)

These are individual root causes that don't cluster into a track:

| Test file                             | Gap                                                                                                                                                 | Est           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `has-many-associations.test.ts`       | Counter cache updates in memory after create/push/empty (3 tests)                                                                                   | ~40 LOC       |
| `belongs-to-associations.test.ts`     | `readonly` check on save (1 test)                                                                                                                   | ~10 LOC       |
| `nested-error.test.ts`                | Nested attributes error semantics (4 tests) — blocked on `accepts_nested_attributes_for`                                                            | Phase G       |
| `extension.test.ts`                   | `:extend` hooking shipped (#2613); 4 skips remain, each blocked on a named feature: dirty-target, Marshal (×2), module naming (see #2574 follow-up) | feature-gated |
| `required.test.ts`                    | `belongsToRequiredByDefault` config (1 test)                                                                                                        | ~10 LOC       |
| `left-outer-join-association.test.ts` | Arel join node in left outer join (3 tests)                                                                                                         | ~30 LOC       |
| `inner-join-association.test.ts`      | Inner join edge cases (2 tests)                                                                                                                     | ~20 LOC       |

---

## Dependency graph

A1–A5, B1–B3, C1–C3, D1, E1, E2, F1, F2, G1, H1, H2 all shipped.
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

The deeper edge-case work that surfaced from the shipped batch (eager_load
raise semantics, store unification, alias-tracker self-joins, etc.) is
itemized under **Post-merge follow-ups** below — sized and ready to lift
into new track entries when prioritized.

**Coverage:** 339 tests total. ~18 permanent-skip (marshal, Ruby-only),
~10 scattered single-test gaps (Track 9), ~24 fixture-gated (D2). All others
shipped.

---

## Post-merge follow-ups

Items surfaced after the shipped batch (A1 #2550, A2 #2568, A3 #2555,
A4 #2559, B1 #2557, E1 #2567, F1 #2563, H1 #2556).

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

- [x] Done (#2559): the original A4 entry's claims were inaccurate. STI
      source grouping is already handled by `Branch.preloadersForReflection`.
- [x] Done (#2606): the `@internal` marker audit at the bottom of
      `preloader/association.ts` (fixed an `associationKeyType`/`ownerKeyType`
      wrong-property bug). New finding: those markers exist solely for
      api:compare and are never called — fragile dead-code pattern; consider
      whether api:compare could map private class methods directly instead.
- Not ported: Rails' `through_scope` `elsif !reflection_scope.where_clause.empty?`
  JOIN branch was intentionally NOT ported — belongs with PR A5.

**From #2563 (F1 HABTM join-table):** F1 shipped TEST-ONLY (no impl change;
3 of 5 plan-doc gaps already worked). Follow-ups:

- [x] `redefine habtm` — Done (#2604). The original COW-double-insert
      hypothesis (subclass HABTM redeclaration with swapped FK options) did NOT
      reproduce against current `vendor/rails` (`SubDeveloper` inherits the
      HABTM rather than redeclaring it). The actual fault was the eager
      push-time join insert on a new owner; fixed by deferring the
      `_pushThrough` insert until `owner.after_create` autosave. No
      `builder/has-and-belongs-to-many.ts` COW-dedup change was needed.
      Follow-up (~30–60 LOC): persisted-owner HABTM source-FK governance in
      `collection-proxy.ts` `_pushThrough` derives `sourceFk` as
      `${underscore(sourceName)}_id`, ignoring the join model's declared
      right-side `belongsTo` FK (`associationForeignKey`); a persisted-owner
      push of a target declaring `associationForeignKey` writes the wrong
      column → silently dropped. Rails-faithful fix prototyped then reverted
      (broke `callbacks.test.ts`'s internally-inconsistent
      `makeHabtmWithCallbacks` schema — fix that test first).
- [x] `join_table_alias` — `Developer.includes(projects: :developers)` with
      WHERE on the self-joined `developers_projects_projects_join` alias. Done:
      `_addThroughViaJoinAssociation` now names colliding chain tables via the
      Rails `{plural_name}_{owner_table}[_join]` scheme (`AliasTracker#aliasNameFor`)
      instead of `tN`; `where`/`whereNot` auto-add references from dotted hash
      keys (`PredicateBuilder.references`) so the include promotes to eager JOIN.
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

- [x] `dependent: :destroy` child removal now routes through `removeRecords`
      (Done #2596) — `before/after_remove` fire on `owner.destroy`.
- [x] HABTM remove/clear callbacks — `clear()` rewritten to mirror Rails
      `clear → delete_all` and route through/HABTM through `deleteRecords`
      (Done #2602). Unblocked "has and belongs to many remove callback" +
      "does not fire callbacks on clear".
- [x] HABTM autosave/timing — unblocked the "has and belongs to many
      before/after add called before/after save" + "callbacks for save on
      parent" tests. No impl change needed: the autosave path (afterCreate/
      afterUpdate via `aroundSaveCollectionAssociation`) was already
      Rails-faithful after the E1 follow-ups (#2602, #2604) — push on a
      persisted owner saves the new child (before_add fires while new,
      after_add after save) and build on a new owner defers join-row insert
      to `owner.save` without re-firing add callbacks. Tests unskipped only.
- Loose end: three callback dispatch paths still exist
  (`collection-association.ts` unified; `collection-proxy.ts`
  `push`/`delete`/`_deleteThrough`/`create` each call
  `fireAssocCallbacks` directly). Future PR to fully collapse. Proxy's
  per-record `continue`-on-abort also diverges from Rails' all-or-nothing
  `catch(:abort)`.

**From #2568 (A2 preloader scope_for_association):**

- [x] `scopeForAssociation()` no-arg case made Rails-faithful (Done #2606) —
      now applies `default_scope` when there is no `current_scope` for all
      no-arg callers. Note: `_buildUnscopedRelation()` still omits Rails'
      `create_with!(inheritance_column => sti_name)`; only matters if an STI
      subclass uses `scopeForAssociation` to BUILD (vs query) records — no test
      exercises this today (~10 LOC if it surfaces).
- [x] Strict-loading cascade end-to-end (Done #2598, extended #2615) —
      `StrictLoadingScope` sentinel threaded through
      `_preloadAssociationsForRecords` (#2598); #2615 added `strictLoadingBang`
      cascade + the `violatesStrictLoading?` reflection toggle. Remaining
      `strict-loading.test.ts` stubs (8) depend on separate features:
  - [ ] ~30–60 LOC: AssociationRelation `exec_queries` parity — drop the
        trails-specific owner-strict backstop in `association-relation.ts`
        `_checkStrictLoading` (Rails doesn't enforce strict-loading there, only
        cascades via `set_strict_loading`); delete the method + 10 call sites +
        9 vestigial pass-through aggregate overrides (~100 LOC, blew this PR's
        ceiling).
  - [ ] ~30 LOC + 2 tests: record-level `reload` + strict-loading (`strict
loading has one reload`, `... has many singular association and
reload`) — needs the reload / `find_from_target?` interaction.
  - [ ] ~15 LOC + 1 test: CollectionProxy unloaded-reader lazy-proxy semantics
        (`strict loading with has many`).
  - [ ] ~20 LOC + 2 tests: validation-context association tests (guard exists;
        needs a child model whose validation loads a strict owner's assoc).
  - [ ] ~25 LOC + 1 test: eager has_one reflection opt-in (`does not raise on
eager loading a strict loading has one relation`).
  - Still gated externally: `n_plus_one_only` mode, `actionOnStrictLoadingViolation
= "log"`, habtm strict-loading. `StrictLoadingScope` is exported as a
    top-level const (Rails nests it `:nodoc:`); consider module-private.

**From #2556 (H1 AssociationScope parity):** test-only PR.

- [x] STI `type_condition` wired into `Base.relation()`/`unscoped()` (Done
      #2599) so `AssociationScope` drops the duplicated STI compensations.
- [x] Vestigial `@internal` `association-scope.ts` wrappers cleaned up (Done
      #2599). Two remain intentionally: `join` (faithful but unused — can't be
      deleted without dropping `Arel::Table#join`/`SelectManager#join` in
      api:compare) and `addConstraints`' eager-load branch (not ported; a
      `Nodes.OuterJoin` marker documents the dependency). New follow-up
      (~30–60 LOC): wire `join` into `nextChainScope` — rework the JOIN ON onto
      Arel constraint nodes and move the polymorphic `_type` filter to a WHERE
      via `applyScope`, matching Rails `next_chain_scope`. Validate against the
      full through/polymorphic/disable-joins suite. Also audit `scope()` for
      `scope.extending! reflection.extensions` (may be missing).
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

**From #2574 (F2 HABTM extend — test-only):**

- [x] Collection `:extend` module hooking shipped (Done #2613) — association
      `extend:` (module-object form) now propagates across clones via
      `relation.ts` `_copyStateFrom` rebinding `_extending`. The remaining
      `extension.test.ts` skips are each blocked on a SEPARATE named feature,
      NOT on `:extend` hooking: `extension with dirty target` (dirty-target
      tracking), `marshalling extensions` / `marshalling named extensions`
      (Marshal support), `extension name` (module naming / `const_set`
      equivalent).
- Deviation: `Relation#extending(fn)` function form does NOT propagate across
  clones (Rails `extending!` converts a block to a define-once Module; trails'
  `(rel) => void` is an immediate mutator not recorded in `_extending`).
  Module-object form is unaffected. No TS call path yet for block-as-module
  association extensions (`has_many :x do…end`).
- Gotcha: grouped HABTM finds must pair `group(col)` with `select(col)` or PG
  raises 42803; SQLite tolerates `SELECT *`. SQLite-only local runs won't catch
  it — remember for future grouped-association tests.

**From #2575 (B3 HMT delete/remove):**

- [ ] ~120 LOC (B3b): unskip the remaining `join-model.test.ts` deletion
      tests — `deleting by string id from has many through`, `deleting junk
from has many through should raise type mismatch`, `delete associate when
deleting from has many through with nonstandard id`. Verified passing
      locally; held back only for the 300-LOC ceiling.
- [ ] ~40 LOC: wire `CollectionAssociation#deleteAll` through
      `deleteOrNullifyAllRecords` (the faithful-but-unwired HMT helper);
      `deleteAll` currently calls `nullifyAllRecords`/`deleteAllRecords`
      directly. Watch `dependent: destroy/nullify/delete` regressions + the
      `rails-file-structure-method-order` lint. (Related: #2602 notes the
      through `deleteAll()` branch uses bulk SQL that skips the join model's
      counter-cache destroy callbacks, leaving counters stale — route it
      through `deleteRecords` like `clear()` now does, or add `update_counter`.)
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

**From #2583 (E2 CollectionProxy#create):**

- [ ] ~80–120 LOC: route `push`/`<<` through `_addToTarget` (the new dedup
      infra). Unblocks 4 `inverse-associations.test.ts` has-many-inversing
      dedup tests (`does not add duplicate associated objects`, and the
      loaded-collection saved/unsaved-duplicate + build-method variants).
      Note: the through/HABTM proxy branch (`_pushThrough`) also still skips
      `_addToTarget` (so set_inverse_instance + dedup don't run there).
- [ ] ~40–60 LOC: route `_createThrough` through `_addToTarget` (closes the
      through-create deviation; overlaps B2 territory, sequence after B2).

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
for fix`. The corrections plumbing shipped here; the blocker is a
      separate `preloader/branch.ts` gap — `groupedRecords()` (~line 161)
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
      `deleteOrNullifyAllRecords`, `intersection` in `has-many-association.ts`
      (definition-only, no callers; lint doesn't flag them).
- Composite-PK non-through has_many uses a per-column `IN` over-approximation
  vs Rails' tuple `where(query_constraints => values)`; only matters if such a
  model is ported.

**From #2585 (H2 nested-through edge cases — test-only):**

- [ ] ~200 LOC: JoinDependency AliasTracker self-join alias emission (deferred
      heavy half of H2; the HABTM-through alias variant shipped separately in
      #2608). Unblocks 3 tests: `nested has many through with a table
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
