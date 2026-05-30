# Relation gap plan

Remaining gaps in the relation layer, grouped by cluster. Residual edge cases
from clusters whose core work is done are tracked under **Post-merge
follow-ups** below.

---

## Remaining open clusters

| Cluster                                                   | Tests | Status / root cause                                                                            |
| --------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| load_async / FutureResult                                 | 28    | Ruby-thread-only; PERMANENT-SKIP                                                               |
| Query cache                                               | 27    | Blocked on connection-pool (per-thread cache architecture)                                     |
| WhereChain `.associated`/`.missing` with enums            | 5     | 5 `missing with enum*` blocked on join table-aliasing                                          |
| Standalone relation (joins, eager, race, fixture)         | 8     | Parameterized joins (2 — R6c deferred), eager_load toSql (3 → assoc A5), race/fixture/Ruby (3) |
| Calculations with associations                            | 12    | Fixture-dependent + grouped association join                                                   |
| Misc (batches, update-all, delegation, predicate-builder) | ~6    | Scattered single-test gaps                                                                     |

Residual edge cases for WHERE associations/polymorphic/CPK, hash-form select,
`order()`/`reverseOrder`, lock, and `inOrderOf` are itemized under **Post-merge
follow-ups**.

---

## WhereChain `.associated`/`.missing` with enums — 5 remain

**Still blocked:** the 5 `missing with enum*` tests join `reading_listing`
(inner) AND left-join `unread_listing` — two has_one associations on the SAME
target table (Book) differentiated only by enum scope. Rails aliases the
second join; `_addAssocJoin` (`relation.ts` ~line 168) throws on the same-table
collision because join table-aliasing isn't implemented. They remain `it.skip`
with that root-cause note; they need the join-aliasing feature (large, separate
track), not a predicate-builder change.

---

## Track 6: Standalone relation gaps (unlocks ~20 actionable tests)

### PR R6c: Parameterized join strings

**Problem:** `joins("INNER JOIN ... WHERE x = ?", value)` — interpolated
bind parameters in join string not implemented.

**Files:**

- `relation/query-methods.ts` — `joins` string-with-binds branch

**Note:** deferred. Rails `joins(*args)` wraps string joins in `Arel.sql` with
no bind interpolation, so `joins("... WHERE x = ?", value)` is not
Rails-faithful. Needs a design decision before any implementation (see
post-merge follow-ups from #2564).

**Est:** ~40 LOC (2 tests)

---

## Permanently skipped / cross-blocked (not actionable here)

| Cluster                               | Tests | Reason                                     |
| ------------------------------------- | ----- | ------------------------------------------ |
| load_async / FutureResult             | 28    | Ruby thread pool; no JS equivalent         |
| Query cache (per-thread architecture) | 14    | Blocked on connection-pool track (see P12) |
| Query cache (GVL/fork)                | 6     | Ruby-only                                  |
| SimpleDelegator where                 | 2     | Ruby-only; no JS equivalent                |
| eager_load toSql + STI + non-preload  | 3     | Blocked on associations track (see A5)     |
| findOrCreateBy race condition         | 1     | Concurrency edge case; low priority        |
| Calculations with associations        | 12    | Fixture-dependent + Phase G                |
| Alternate PK where                    | 1     | Fixture-dependent                          |

---

## Dependency graph

Remaining:

```
R6c (parameterized join strings — deferred, needs design decision)
```

## Recommended priority

| PR  | Tests | Est LOC | Depends on | Why                                                  |
| --- | ----- | ------- | ---------- | ---------------------------------------------------- |
| R6c | 2     | ~40     | —          | Parameterized join strings — deferred, design needed |

The remaining edge cases beyond R6c (join table-aliasing for `missing with
enum*`, raw-SQL/table-alias hash select, etc.) are itemized under
**Post-merge follow-ups** below.

**Remaining coverage:**

- **Actionable here:** ~2 tests (R6c, deferred).
- **Cross-blocked:** ~47 tests (connection-pool P12, associations A5,
  Phase G fixtures, join table-aliasing)
- **Permanently skipped:** ~36 tests (load_async, GVL/fork, SimpleDelegator)

---

## Post-merge follow-ups

Forward-looking items needing follow-up work, grouped into PR-sized work units.

### follow-up: EnumType in the global type caster (~30–50 LOC)

Files: `type-caster/map.ts` (`typeCastForDatabase`), `relation.ts`
(`inOrderOf` enum branch). Source: #2671.

**Partially shipped.** `TypeCasterMap.typeCastForDatabase` now resolves enum
attributes through their `EnumType` so the database-cast path serializes keys →
integers, and the local `getEnumDefinitions` branch in `inOrderOf` is deleted —
the method is now a 1:1 Rails mirror (`type_caster.type_cast_for_database`).

**Why not full `type_for_attribute` decoration (the remaining gap):** Rails
decorates the attribute itself with `EnumType` via `decorate_attributes`, so
`type_for_attribute` returns the `EnumType` and in-memory storage holds the
_label_. Our enum implementation diverges: it stores the **raw subtype value**
(integer) in `_attributes` and presents labels via accessors / `readEnumValue`.
Decorating the attribute (or routing the predicate-builder `cast` path through
`EnumType`) flips in-memory storage to labels, which breaks ~61 enum tests
(`readEnumValue`, predicates, `whereValuesHash` → `scopeForCreate` round-trip).
So only the **serialize** path (`typeCastForDatabase`) is wired here, not the
`cast` path (`typeForAttribute`).

**Remaining follow-up:** `where({ enumCol: "label" })` value serialization still
does not map a string label → integer (the predicate builder casts via the raw
subtype, not `EnumType`). Closing it cleanly requires the larger enum-as-
attribute-type refactor: decorate the attribute with `EnumType` _and_ rework
`readEnumValue` / the generated predicates / `whereValuesHash` consumption to
work with label-based storage. Tracked as its own work unit; > 300 LOC.

### Actionable PR queue

Open `[ ]` items bundled into ≤300-LOC work units, ordered by readiness.
Detail/rationale in the per-PR sections below.

**Ready now:**

- **RF1 — FK-derivation consolidation** (~40–60 LOC, refactor). Fold the four
  near-identical `derive_foreign_key` reimplementations in `relation.ts`
  (`_resolveAssociationTarget` ~584, `_resolveHasManySubquery` ~620,
  `_resolveHasManyJoin` ~655, `_resolveAssociationJoin` ~1455) into one helper
  mirroring `Reflection#derive_foreign_key`, plus a direct-assertion test sweep
  of the `.joins` string resolver's through/HABTM/STI branches. Files:
  `relation.ts`, `relation/where.test.ts`. Source: #2590.
- [x] Done (#2671) — **RF3 — `inOrderOf` type-cast.** Added
      `type_cast_for_database` value casting in `inOrderOf` via `TypeCasterMap`,
      plus an enum fallback. Files: `relation.ts`,
      `relation/field-ordered-values.test.ts`. See the EnumType global
      type-caster follow-up at the top of this section.

**Blocked / needs a design decision (not a clean PR yet):**

- **Join table-aliasing** (large, separate track) — two has_one associations to
  the same target table in one query. Unblocks the 5 `missing with enum*` tests
  (relation) and overlaps the associations H2 self-join work (AF6). Source:
  #2582.
- **Enum write-casting from string labels** — `create({ enumCol: "label" })` /
  `where({ enumCol: "label" })` store/compare as `null` instead of casting
  label → integer (enum _scope_ methods already cast). Source: #2582.
- **Select-narrowing edges** — `select with hash and table alias`, `... with few
tables` (per-join table aliasing); `reselect with default scope select`;
  `select`/`select`-block arity validation. Feature-gated. Source: #2562.
- **R6c — parameterized join strings** — `joins("... WHERE x = ?", value)` is
  not Rails-faithful (`joins(*args)` wraps in `Arel.sql`, no bind interpolation).
  Needs a design decision before any implementation. Source: #2564.
- **Async `inspect()`** — the unloaded path needs sync DB I/O Rails does but JS
  can't in a string-returning method; 4 `#inspect` + 3 `#pretty_print` tests
  stay on weakened assertions until an async-inspect API is designed. Source:
  #2617.

**From #2551 (R3 Arel order identity / reverseOrder):**

- The 3 `reorder replaces existing order` tests have no verbatim Rails
  counterpart (Rails names this behavior `test_finding_with_reorder` /
  `test_reorder_deduplication` in `relations_test.rb`). Pre-existing in our
  suite. Don't rename in place — instead verify each maps to a real Rails
  test and, where it does, align body + name to that counterpart so
  test:compare matches; otherwise document the genuine test:compare gap.

**From #2562 (R2 hash-form select):**

- Still skipped (blocked on other features): `select with hash and table
alias`, `select with hash argument with few tables` (need per-join table
  aliasing); `reselect with default scope select` (default_scope+select);
  `select without any arguments` + `select with block without any arguments`
  (need arity/block-form validation).

**From #2564 (R6 bundle — lock + having-hash):**

- Pre-existing internal divergence: Rails `lock!` stores `true` for default
  and lets Arel expand to `FOR UPDATE`; trails `lockBang` stores literal
  `"FOR UPDATE"` in `_lockValue`. SQL output identical. Strict `lock_value`
  parity would differ.
- **R6c (parameterized join strings) deferred.** Rails `joins(*args)` wraps
  string joins in `Arel.sql` with no bind interpolation, so
  `joins("... WHERE x = ?", value)` is not Rails-faithful. Synthetic empty-body
  test `joins with string sql and string interpolation` (relations.test.ts:~1395)
  remains `it.skip`. Needs design decision before any implementation.

**From #2566 (R1 polymorphic/nested where):**

- Still skipped (need join+fixture infra): `belongs to nested where with
relation`, `where not polymorphic id and type as nand`, `where not
association as nand`, `polymorphic nested array where not`, `type casting
nested joins`, `where with through association`, `where with relation on
has many association`, `where with relation on has one association`,
  `where on association with select relation`, `where on association with
collection polymorphic relation`.
- Type-system gaps: `where with rational for string column` (no JS
  Rational), `where with duration for string column` (ActiveSupport::Duration
  cast not wired).

**From #2569 (R5 inOrderOf extensions):**

- Minor: `resolveColumnNameMatcher` vs `resolveColumnNameWithOrderMatcher` in
  `relation.ts` are near-duplicates — candidate for a shared helper. **Subsumed
  by `query-cache-mixin-plan.md` Phase 3**: once the `QueryCacheAdapter` wrapper
  is removed there is no `adapter.inner` chain to walk, so both resolvers (plus
  `resolveOrderMatcher` in `relation/query-methods.ts`) collapse to one-line
  direct static lookups — no shared helper needed. (A standalone dedup, PR #2639,
  was opened and closed for this reason.) Track in that plan, not here.
- [x] ~10-20 LOC: `type_cast_for_database` value casting in `inOrderOf` shipped
      in #2671. Follow-up surfaced in the EnumType global type-caster section at
      the top of the Post-merge follow-ups.
- belongsTo accessor returns `null` in minimal inline-model + handler-suite
  test setups: `await book.author === null` despite valid `author_id`. Join
  SQL + ordering correct; only accessor broken. Worth own investigation (may
  affect other association tests).

**From #2573 (R3b scoped-select hasAttribute):**

- `narrowToProjectedColumns` (`inheritance.ts`) uses `columnNames()`, which
  includes every declared `attribute()` (not just schema-reflected columns).
  Sound today (validators register no attributes; a declared attribute with no
  column fails on INSERT), but fragile: if trails ever gains true virtual/in-set
  attributes a projected SELECT would wrongly uninitialize them. The schema
  cache (`getCachedColumnsHash`) is the correct source but `isCached` is `false`
  under `defineSchema`-based tests. Revisit if in-set virtual attributes land.
- Implicit `id` PK is not tracked in `_attributes` for inline-declared models —
  `hasAttribute("id")` is false when `id` isn't in the projected row, whereas
  Rails retains the nil-initialized PK default. Pre-existing; orthogonal.

**From #2582 (R4 fold association scope into joins):**

- [ ] (large, separate track) Join table-aliasing — unblocks the 5 `missing
with enum*` tests (two has_one associations to the same target table in
      one query). Next actionable PR in the WhereChain enum track.
- [ ] (separate gap) Enum write-casting from string labels is NOT wired:
      `Model.create({ enumCol: "label" })` and `Model.where({ enumCol: "label" })`
      both store/compare as `null` instead of casting label → integer. Enum
      _scope_ methods (`Book.reading()`) DO cast correctly. This is why R4's
      fixture inserts raw integers and uses the generated enum scope method.
- `_appendAssociationScope` is anchored to JoinDependency
  (`join-dependency.ts:272-282`) as source of truth (converged after 5 Copilot
  rounds): invoke unconditionally via `invokeScopeLambda` with `owner=undefined`,
  no arity gate, no error rescue. Cite that convergence if reopened.
