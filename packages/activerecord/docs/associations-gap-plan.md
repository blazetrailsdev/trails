# Associations gap plan

Originally 339 skipped tests across 33 files; 20 PRs across 9 tracks,
organized by unlock potential. After the cleanup batch, **8 PRs shipped
(A1–A4, B1, E1, F1, H1)** and **12 remain** (A5, B2, B3, C1–C3, D1, D2,
E2, F2, G1, H2). Per-track unlock counts in the headers below are the
original pre-cleanup aggregates; remaining work per track is whatever PRs
are still listed. Some tests are gated on multiple PRs (noted in dependency
graph). ~18 permanent-skip (marshal, Ruby-only), ~10 scattered single-test
gaps (Track 9).

---

## Track 1: Preloader core (A1–A4 shipped; A5 remaining — ~20 eager-loading tests)

### PR A5: `eager_load` nested hash specs → JoinDependency (not preload fallback)

**Problem:** `_executeEagerLoad` pushes all non-string and dotted-string
specs into `fallbackAssocs`, so nested `eagerLoad({ author: :posts })`
silently degrades to N preload queries instead of JOINing.
`_includesToPromoteFromReferences` only promotes flat strings, not nested
hashes.

**Files:**

- `relation.ts:2108–2116` — `_executeEagerLoad` fallback logic
- `relation.ts:2010–2011` — `_includesToPromoteFromReferences`

**Rails ref:** `relation/finder_methods.rb`, `associations/join_dependency.rb`

**Est:** ~150 LOC (highest complexity in this track)

---

## Track 2: has_many :through writes (B1 shipped; B2 + B3 remaining — ~25 tests)

### PR B2: `concatRecords` + `@through_records` cache

**Problem:** No `concatRecords` override — new-record owners never pre-build
through rows for `after_create`. No per-record `@through_records` cache or
`ensure`-clear after save.

**Files:**

- `associations/has-many-through-association.ts` — add `concatRecords`, add cache

**Rails ref:** `has_many_through_association.rb:37–49`, `81–88`

**Est:** ~100 LOC

---

### PR B3: `deleteRecords` + `removeRecords` join-table operations

**Problem:** `deleteRecords` is a stub that delegates to `.delete()` instead
of scoped join-table `destroy_all`/`update_all`/`delete_all`.
`removeRecords` never calls `deleteThroughRecords` (exists at line 306,
dead code).

**Files:**

- `associations/has-many-through-association.ts:240–246` — `deleteRecords`
- `associations/has-many-through-association.ts:206–213` — `removeRecords`
- `associations/has-many-through-association.ts:306` — `deleteThroughRecords`

**Rails ref:** `has_many_through_association.rb:116–175`

**Est:** ~120 LOC

---

## Track 3: inverse_of (unlocks ~23 tests)

### PR C1: `inverseAssociationFor` → `reflection.inverseName()`

**Problem:** `inverseAssociationFor()` reads `reflection.options.inverseOf`
directly but never calls `reflection.inverseName()`, which is what performs
automatic inverse detection via `automaticInverseOf()`. When `inverseOf` is
not explicitly set, inverse sharing is silently skipped.

**Files:**

- `associations/association.ts:431` — `inverseAssociationFor`

**Rails ref:** `reflection.rb` `inverse_name` / `automatic_inverse_of`

**Est:** ~20 LOC (small change, large blast radius — test thoroughly)

---

### PR C2: `setInverseInstance` on collection `concat`/`push`

**Problem:** `CollectionAssociation#concat`/`push`/`<<` does not call
`setInverseInstance` on each appended record.

**Files:**

- `associations/collection-association.ts` — `addToTarget` / `replaceOnTarget`

**Rails ref:** `collection_association.rb` `replace_on_target`

**Est:** ~40 LOC

---

### PR C3: Preloader inverse wiring for non-rich reflections

**Problem:** `_associateRecordsToOwner` derives `inverseName` from
`reflection.inverseOf?.()?.name ?? options?.inverseOf` — only works when
rich reflection is attached. Falls back to `options.inverseOf` only,
missing automatic detection.

**Files:**

- `associations/preloader/association.ts:239–241`

**Depends on:** PR C1 (once `inverseName()` works, this path can call it)

**Est:** ~30 LOC

---

## Track 4: has_one (unlocks ~27 tests, ~24 fixture-gated)

### PR D1: `AssociationTypeMismatch` named error class

**Problem:** `replace()` calls `raiseOnTypeMismatchBang` but the error is a
generic `Error`, not the Rails-named `AssociationTypeMismatch` class.

**Files:**

- `associations/has-one-association.ts:101`
- `associations/errors.ts` — add `AssociationTypeMismatch`

**Est:** ~30 LOC

---

### PR D2: has_one fixture bodies

**Problem:** ~24 of 27 skips are `/* fixture-dependent */` — the has_one
implementation is largely complete but tests lack data.

**Depends on:** Phase G fixture adoption (see `docs/activerecord/fixtures-adoption-plan.md`)

**Est:** ~200 LOC (test bodies only)

---

## Track 5: Collection callbacks (E1 shipped; E2 remaining — ~4 tests)

### PR E2: `create()` goes through `addToTarget` + dedup tracking

**Problem:** `CollectionProxy#create()` manually pushes to `_target` and
fires callbacks directly, bypassing `addToTarget`. Skips
`setInverseInstance` and `replaced_or_added_targets` dedup.

**Files:**

- `associations/collection-proxy.ts:771–778` — `create()`
- `associations/collection-association.ts:748–780` — add `replaced_or_added_targets` set

**Rails ref:** `collection_association.rb` `replace_on_target`,
`collection_proxy.rb` `create`

**Est:** ~80 LOC

---

## Track 6: HABTM (F1 shipped; F2 remaining — ~8 tests: scope-chain + extend:)

### PR F2: HABTM `extend:` option + scope chain composition

**Problem:** `extend:` option is not implemented — module methods are not
mixed into CollectionProxy. 4 tests are blocked on scope chain composition
(scoped find on through/habtm incorrectly marks results readonly; `find`
with `group:` option not supported on collection relation; `having()` not
supported on scoped collection relation).

**Files:**

- `associations/collection-proxy.ts` — `extend:` mixin
- `associations/collection-association.ts` — scope chain composition

**Rails ref:** `collection_proxy.rb` `extend`, `collection_association.rb`

**Est:** ~80 LOC

---

## Track 7: has_one :through (unlocks ~21 tests)

### PR G1: has_one :through eager loading + scoped conditions

**Problem:** 16 tests in `has-one-through-associations.test.ts` — fixture
gaps (~6), non-preload JOIN-based eager loading (~3, blocked on A5),
scoped has_one :through with WHERE conditions on through/source (~3),
and `ThroughReflection.isPolymorphic()` not recognizing `has_one :as`
as polymorphic (~1). 5 tests in `has-one-through-disable-joins-associations.test.ts`
blocked on `disableJoins` scope chain.

**Files:**

- `associations/has-one-through-association.ts` — scope/eager wiring
- `reflection.ts` — `ThroughReflection.isPolymorphic()`

**Depends on:** PR A5 (nested eager_load) for JOIN-based tests

**Est:** ~100 LOC (impl) + ~100 LOC (test bodies)

---

## Track 8: AssociationScope + nested-through (H1 shipped; H2 remaining — ~12 tests)

### PR H2: Nested-through edge cases (distinct, STI, polymorphic scope, alias)

**Problem:** 12 tests in `nested-through-associations.test.ts` — distinct
on nested through, STI on nested through reflection, polymorphic scope
on nested through, and AliasTracker integration (table referenced
multiple times emits wrong aliases).

**Files:**

- `associations/join-dependency.ts` — AliasTracker alias emission
- `associations/preloader/through-association.ts` — nested chain walking

**Depends on:** PR A4 ✓ (through-association scope, shipped #2559), PR A5 (JoinDependency)

**Est:** ~100 LOC

---

## Track 9: Scattered single-test gaps (unlocks ~10 tests)

These are individual root causes that don't cluster into a track:

| Test file                             | Gap                                                                                      | Est     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| `has-many-associations.test.ts`       | Counter cache updates in memory after create/push/empty (3 tests)                        | ~40 LOC |
| `belongs-to-associations.test.ts`     | `readonly` check on save (1 test)                                                        | ~10 LOC |
| `nested-error.test.ts`                | Nested attributes error semantics (4 tests) — blocked on `accepts_nested_attributes_for` | Phase G |
| `extension.test.ts`                   | Collection extension module mixing (4 tests) — same as F2 `extend:`                      | F2      |
| `required.test.ts`                    | `belongsToRequiredByDefault` config (1 test)                                             | ~10 LOC |
| `left-outer-join-association.test.ts` | Arel join node in left outer join (3 tests)                                              | ~30 LOC |
| `inner-join-association.test.ts`      | Inner join edge cases (2 tests)                                                          | ~20 LOC |

---

## Dependency graph

A1–A4 shipped (#2550, #2568, #2555, #2559). Remaining:

```
A5 (eager_load JOIN path — preloader core now shipped)

B2, B3 (both extend shipped B1 #2557 HMT write plumbing; independent of
       each other — Rails `delete_records` does not depend on `concat_records`)

C1 → C2 → C3 (inverseName() must work before wiring it into collection/preloader)

D1 (standalone)
D2 (blocked on Phase G fixtures)

E2 (create() dedup; E1 unified dispatch shipped #2567)

F2 (standalone; F1 shipped #2563)

A5 → G1 (has_one :through eager loading needs nested eager_load)

A4 ✓ + A5 → H2 (nested-through needs through-scope + JoinDependency; H1 shipped #2556)
```

## Recommended priority

Ordered by: (1) no unsatisfied dependencies, (2) tests unlocked per LOC,
(3) downstream unlock potential (how many later PRs does this gate?).

### Tier 1 — high leverage, no dependencies (start here)

These are independent of each other and can run in parallel.

| PR  | Tests | Est LOC | Why first                                                       |
| --- | ----- | ------- | --------------------------------------------------------------- |
| C1  | ~15   | ~20     | Smallest change, gates C2+C3; automatic inverse is table-stakes |

### Tier 2 — high leverage, no dependencies but lower unlock ratio

| PR  | Tests | Est LOC | Why                                  |
| --- | ----- | ------- | ------------------------------------ |
| B3  | ~15   | ~120    | HMT delete/remove (B1 shipped #2557) |

### Tier 3 — gated on Tier 1/2

| PR  | Tests | Est LOC | Depends on | Why                                        |
| --- | ----- | ------- | ---------- | ------------------------------------------ |
| C2  | ~5    | ~40     | C1         | Inverse on push — completes inverse track  |
| B2  | ~10   | ~100    | B1 ✓       | HMT concat — completes HMT write track     |
| F2  | ~8    | ~80     | —          | HABTM extend + scope chain                 |
| E2  | ~4    | ~80     | E1 ✓       | create() dedup — completes callback track  |
| A5  | ~20   | ~150    | (A1–A4 ✓)  | Nested eager_load — hardest PR in the plan |

### Tier 4 — gated on Tier 3 or external blockers

| PR  | Tests | Est LOC | Depends on | Why                                       |
| --- | ----- | ------- | ---------- | ----------------------------------------- |
| G1  | ~21   | ~200    | A5         | has_one :through eager loading            |
| H2  | ~12   | ~100    | A4 ✓, A5   | Nested-through edge cases                 |
| C3  | ~3    | ~30     | C1         | Preloader inverse wiring                  |
| D1  | ~3    | ~30     | —          | AssociationTypeMismatch error class       |
| D2  | ~24   | ~200    | Phase G    | has_one fixture bodies — external blocker |

### Recommended parallel lanes

If running multiple agents, these lanes have zero file overlap:

- **Lane A:** A5 (preloader core A1–A4 shipped → eager_load)
- **Lane B:** B2, B3 (HMT writes; B1 shipped — concat & delete paths independent)
- **Lane C:** C1 → C2 (inverse_of)
- **Lane E:** F2 (HABTM extend + scope chain — standalone; F1 shipped)

**Coverage:** 339 tests total. ~18 permanent-skip (marshal, Ruby-only),
~10 scattered single-test gaps (Track 9). All others accounted for above.

---

## Post-merge follow-ups

Items surfaced after the shipped batch (A1 #2550, A2 #2568, A3 #2555,
A4 #2559, B1 #2557, E1 #2567, F1 #2563, H1 #2556).

**From #2555 (A3 polymorphic guard):**

- [ ] ~30-50 LOC: implement `exceptions have suggestions for fix` in
      `eager.test.ts`. Needs "Did you mean?" on `AssociationNotFoundError`
      (`detailed_message` + DidYouMean). Add corrections field to
      `associations/errors.ts` and wire into `associations/instance-methods.ts`
      `association()` throw.
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

- [x] Done (this PR): the original A4 entry's claims were inaccurate. STI
      source grouping is already handled by `Branch.preloadersForReflection`.
      The "scope drop" overlaps A5 (JOIN branch). The stale A4 entry was
      dropped in this cleanup.
- [ ] ~30 LOC audit: sweep `@internal` marker functions at the bottom of
      `preloader/association.ts` for references to nonexistent Relation
      properties (one was fixed by #2559 — `strictLoadingValue` was dead code).
- Not ported: Rails' `through_scope` `elsif !reflection_scope.where_clause.empty?`
  JOIN branch was intentionally NOT ported — belongs with PR A5.

**From #2563 (F1 HABTM join-table):** F1 shipped TEST-ONLY (no impl change;
3 of 5 plan-doc gaps already worked). Follow-ups:

- [ ] ~150-250 LOC: `redefine habtm` — `SubDeveloper < Developer` with
      swapped FK options. Confirmed broken: subclass HABTM redeclaration writes
      null/parent-mapped join FKs AND parent middle has_many double-inserts.
      Files: `associations.ts` (`createHabtmJoinModel` + through insert),
      `builder/has-and-belongs-to-many.ts` (COW dedup keyed on derived middle
      name).
- [ ] F2-sized: `join_middle_table_alias` / `join_table_alias` —
      `.includes(:developers_projects)` with WHERE on aliased join-table names.
      Needs JOIN-based eager loading with Rails-compatible self-join alias
      naming via `associations/join-dependency.ts` + `alias-tracker.ts`
      (HABTM-through not wired in).
- Pre-existing orthogonal bug: pushing onto HABTM on a new (unsaved) owner
  leaves a stray join row with null FKs (filtered out by `loadHabtm` so
  invisible to reads). Worth its own ticket.

**From #2567 (E1 collection callback abort):**

- [ ] ~50 LOC: `dependent: :destroy` on parent does NOT route child removal
      through `removeRecords`, so before/after_remove don't fire on
      `owner.destroy`. Blocks "has many callbacks for destroy on parent".
- [ ] ~80 LOC: HABTM `_deleteThrough` join-row lookup gap — `before_remove`
      fires but join row isn't found, so `after_remove` never runs. Blocks
      "has and belongs to many remove callback" + "does not fire callbacks on
      clear".
- [ ] ~40 LOC: HABTM autosave/timing — blocks "has and belongs to many
      before/after add called before/after save" + "callbacks for save on
      parent".
- Loose end: three callback dispatch paths still exist
  (`collection-association.ts` unified; `collection-proxy.ts`
  `push`/`delete`/`_deleteThrough`/`create` each call
  `fireAssocCallbacks` directly). Future PR to fully collapse. Proxy's
  per-record `continue`-on-abort also diverges from Rails' all-or-nothing
  `catch(:abort)`.

**From #2568 (A2 preloader scope_for_association):**

- [ ] ~20 LOC: make `scopeForAssociation()` in `scoping/named.ts:55`
      Rails-faithful for the no-arg case. Currently falls through to `all()`
      which applies `current_scope`; branch logic diverges from Rails
      (`current_scope&.empty_scope? ? scope : default_scoped(scope)`). Other
      callers pass explicit scope so unaffected today; A2 routed `_buildScope`
      through it and hit a multi-DB regression.
- [ ] ~30 LOC + 41 tests: strict-loading cascade end-to-end.
      `_cascadeStrictLoading` wired but no-op until strict-loading preload scope
      is threaded. Needs `StrictLoadingViolation` wiring + `StrictLoadingScope`
      sentinel from `Relation#preloadAssociations`. Unblocks empty `it.skip`
      stubs in `strict-loading.test.ts`.

**From #2556 (H1 AssociationScope parity):** test-only PR.

- [ ] ~30 LOC: wire STI `type_condition` into `Base.unscoped()` /
      `relation()` so `AssociationScope` can drop both STI compensations
      (duplicated in `scope()` + `_buildEntryScope()`).
- [ ] ~20 LOC cleanup: delete or fix vestigial `@internal` module-level
      helper wrappers at the bottom of `association-scope.ts`
      (`valueTransformation`, `join`, `lastChainScope`, `transformValue`,
      `nextChainScope`, `getChain`, `addConstraints`, `applyScope`, `evalScope`).
      Some delegate with stale arity; `evalScope` references possibly-nonexistent
      `reflection.buildScope`. Verify api:compare still maps association_scope.rb
      13/13 after removal.
- Not ported: `scope()` omits Rails' `scope.extending! reflection.extensions`
  (`association_scope.rb:27`) — tracked under `extension.test.ts` / F2.
- Not ported: `_addConstraints` uses granular pushing instead of Rails'
  `Relation#merge!` with `.except(...)` for chain_head and `.only(...)` for
  non-head. `eager_load_values`/`includes_values` propagation through chain
  not implemented.
