# Associations gap plan

339 skipped tests across 33 files. 20 PRs across 9 tracks, organized
by unlock potential. Some tests are gated on multiple PRs (noted in
dependency graph). ~18 permanent-skip (marshal, Ruby-only), ~10
scattered single-test gaps (Track 9).

---

## Track 1: Preloader core (unlocks ~104 eager-loading + ~18 cascaded tests)

### PR A1: Preloader writes to real association target, not shadow map

**Problem:** `_associateRecordsToOwner` and `associateRecordsFromUnscoped`
write to `_preloadedAssociations` instead of calling
`owner.association(name).target = records`. The real proxy stays unloaded,
unpersisted collection members are dropped, and `association.loaded?` is
false after preloading.

**Files:**

- `associations/preloader/association.ts:228–252` — `_associateRecordsToOwner`
- `associations/preloader/association.ts:192–222` — `associateRecordsFromUnscoped`

**Rails ref:** `preloader/association.rb:245–256`

**Est:** ~80 LOC

---

### PR A2: `_buildScope` parity — `scope_for_association` + `cascade_strict_loading`

**Problem:** `_buildScope` uses `_allForPreload()` instead of
`klass.scope_for_association` (may miss `default_scope`). The
`cascadeStrictLoading` helper exists (line 563) but is never called.

**Files:**

- `associations/preloader/association.ts:296–320` — `_buildScope`
- `associations/preloader/association.ts:563` — dead `cascadeStrictLoading`

**Rails ref:** `preloader/association.rb:295–307`

**Est:** ~60 LOC

---

### PR A3: `groupedRecords` polymorphic guard + HABTM-through detection

**Problem:** `groupedRecords` swallows all exceptions via try/catch instead
of Rails' targeted `polymorphic_parent && !reflection` guard. HABTM-through
detection uses fragile `_associations` array scan instead of
`reflection.options.through`.

**Files:**

- `associations/preloader/branch.ts:153–177` — `groupedRecords`
- `associations/preloader/branch.ts:299–319` — `_preloaderFor`

**Rails ref:** `preloader/branch.rb:80–89`

**Est:** ~60 LOC

---

### PR A4: Through-association scope + STI source grouping

**Problem:** `_buildThroughScope` ignores the through reflection's
`join_scopes` — custom scopes on intermediates are dropped.
`_getSourcePreloaders` doesn't group by STI class at the source level.

**Files:**

- `associations/preloader/through-association.ts:351–376` — `_buildThroughScope`
- `associations/preloader/through-association.ts:171–197` — `_getSourcePreloaders`

**Rails ref:** `preloader/through_association.rb`

**Est:** ~100 LOC

---

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

## Track 2: has_many :through writes (unlocks ~40 tests)

### PR B1: `buildRecord` override for HMT

**Problem:** No `buildRecord` override — `post.comments.build()` on a HMT
returns a target record with no join row created and no inverse wired.

**Files:**

- `associations/has-many-through-association.ts` — add `buildRecord` override

**Rails ref:** `has_many_through_association.rb:90–114`

**Est:** ~80 LOC

---

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

## Track 5: Collection callbacks (unlocks ~12 tests)

### PR E1: Unify callback dispatch + abort semantics

**Problem:** `replaceOnTarget` reads `options.beforeAdd` directly;
`removeRecords` reads from `callbacksFor()`. Two dispatch paths. Neither
supports abort semantics (Rails `catch(:abort)`). `concatRecords` still
saves to DB even when `beforeAdd` returns false.

**Files:**

- `associations/collection-association.ts:689–780` — `removeRecords`, `replaceOnTarget`
- `associations/collection-association.ts:155–158` — `concatRecords`

**Rails ref:** `collection_association.rb` `replace_on_target`, `remove_records`

**Est:** ~100 LOC

---

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

## Track 6: HABTM (unlocks ~15 tests, 24 total — 4 scope-chain, 2 eager, 3 cross-blocker)

### PR F1: HABTM join-table quoting, aliasing, and timestamps

**Problem:** Multiple small gaps in the HABTM join-table insert/query path:

- String PKs are not quoted in the IN clause
- Join table is not aliased for disambiguation in self-joins
- `created_at`/`updated_at` not written on join inserts
- `partial_inserts: false` config not respected (should INSERT all columns)
- Duplicate `hasAndBelongsToMany` declarations don't replace prior ones

**Files:**

- `associations/builder/has-and-belongs-to-many.ts` — join insert path
- `associations/has-and-belongs-to-many-association.ts` — join query path

**Rails ref:** `has_and_belongs_to_many_association.rb` `insert_record`,
`has_and_belongs_to_many.rb` builder

**Est:** ~120 LOC

---

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

## Track 8: AssociationScope + nested-through (unlocks ~25 tests)

### PR H1: `AssociationScope` full scope-building parity

**Problem:** 13 tests in `association-scope.test.ts` cover the core
scope-building pipeline: hasMany/belongsTo FK constraints, STI
`type_condition`, polymorphic type WHERE, `scope_for_association`
(default_scope flow-through), 0-arity scope lambda with `this=relation`,
and through-chain `reverse_each` scope merging. Test bodies exist but
the scope builder doesn't fully implement these paths.

**Files:**

- `associations/association-scope.ts` — scope-building pipeline

**Rails ref:** `associations/association_scope.rb` `scope`, `add_constraints`

**Est:** ~150 LOC

---

### PR H2: Nested-through edge cases (distinct, STI, polymorphic scope, alias)

**Problem:** 12 tests in `nested-through-associations.test.ts` — distinct
on nested through, STI on nested through reflection, polymorphic scope
on nested through, and AliasTracker integration (table referenced
multiple times emits wrong aliases).

**Files:**

- `associations/join-dependency.ts` — AliasTracker alias emission
- `associations/preloader/through-association.ts` — nested chain walking

**Depends on:** PR A4 (through-association scope), PR A5 (JoinDependency)

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

```
A1 ──┐
A2   ├── A5 (eager_load JOIN path needs working preloader first)
A3 ──┤
A4 ──┘

B1 → B2 → B3 (each builds on prior HMT plumbing)

C1 → C2 → C3 (inverseName() must work before wiring it into collection/preloader)

D1 (standalone)
D2 (blocked on Phase G fixtures)

E1 → E2 (unified dispatch before create() can use it)

F1, F2 (standalone)

A5 → G1 (has_one :through eager loading needs nested eager_load)

H1 (standalone)
A4 + A5 → H2 (nested-through needs through-scope + JoinDependency)
```

## Recommended priority

Ordered by: (1) no unsatisfied dependencies, (2) tests unlocked per LOC,
(3) downstream unlock potential (how many later PRs does this gate?).

### Tier 1 — high leverage, no dependencies (start here)

These are independent of each other and can run in parallel.

| PR  | Tests | Est LOC | Why first                                                         |
| --- | ----- | ------- | ----------------------------------------------------------------- |
| A1  | ~40   | ~80     | Highest single-PR unlock; fixes the core preloader contract       |
| C1  | ~15   | ~20     | Smallest change, gates C2+C3; automatic inverse is table-stakes   |
| A3  | ~20   | ~60     | Polymorphic preload is broken for every polymorphic association   |
| B1  | ~15   | ~80     | HMT build is a user-visible API gap; gates B2+B3                  |
| H1  | ~13   | ~150    | AssociationScope is the foundation for scoped eager/preload paths |

### Tier 2 — high leverage, no dependencies but lower unlock ratio

| PR  | Tests | Est LOC | Why                                                                |
| --- | ----- | ------- | ------------------------------------------------------------------ |
| F1  | ~11   | ~120    | HABTM join-table correctness (quoting, aliasing, timestamps)       |
| A2  | ~10   | ~60     | `scope_for_association` + strict loading; completes preloader core |
| B3  | ~15   | ~120    | HMT delete/remove — independent of B1 if needed                    |
| A4  | ~15   | ~100    | Through-scope + STI grouping; gates A5, H2                         |
| E1  | ~8    | ~100    | Callback abort semantics — correctness fix                         |

### Tier 3 — gated on Tier 1/2

| PR  | Tests | Est LOC | Depends on     | Why                                        |
| --- | ----- | ------- | -------------- | ------------------------------------------ |
| C2  | ~5    | ~40     | C1             | Inverse on push — completes inverse track  |
| B2  | ~10   | ~100    | B1             | HMT concat — completes HMT write track     |
| F2  | ~8    | ~80     | —              | HABTM extend + scope chain                 |
| E2  | ~4    | ~80     | E1             | create() dedup — completes callback track  |
| A5  | ~20   | ~150    | A1, A2, A3, A4 | Nested eager_load — hardest PR in the plan |

### Tier 4 — gated on Tier 3 or external blockers

| PR  | Tests | Est LOC | Depends on | Why                                       |
| --- | ----- | ------- | ---------- | ----------------------------------------- |
| G1  | ~21   | ~200    | A5         | has_one :through eager loading            |
| H2  | ~12   | ~100    | A4, A5     | Nested-through edge cases                 |
| C3  | ~3    | ~30     | C1         | Preloader inverse wiring                  |
| D1  | ~3    | ~30     | —          | AssociationTypeMismatch error class       |
| D2  | ~24   | ~200    | Phase G    | has_one fixture bodies — external blocker |

### Recommended parallel lanes

If running multiple agents, these lanes have zero file overlap:

- **Lane A:** A1 → A2 → A5 (preloader core → eager_load)
- **Lane B:** B1 → B2 → B3 (HMT writes)
- **Lane C:** C1 → C2 (inverse_of)
- **Lane D:** H1 (association scope — standalone)
- **Lane E:** F1 (HABTM join table — standalone)

**Coverage:** 339 tests total. ~18 permanent-skip (marshal, Ruby-only),
~10 scattered single-test gaps (Track 9). All others accounted for above.
