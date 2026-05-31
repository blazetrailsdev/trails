# Patterns in the extras

Run on 2026-05-15 against `main`. Total novel extras across all
Rails-mirroring packages: **2,135**. The clusters below explain ~70% of
that volume.

## 1. Ruby-private methods promoted to TS-public surface

By far the dominant pattern. Rails marks lots of internal helpers as
`private` in Ruby; trails frequently exports them as ordinary functions
or methods because:

- TS has no `private` _file-level_ — to share between sibling files,
  you must `export`;
- `protected` doesn't reach across files either;
- The Rails-private convention in this repo is the leading `_`-prefix,
  which only some authors apply.

The audit filters `internal: true` on the Ruby side (private/protected)
so these never enter `allowed`, then filters `_`-prefix on the TS side
so the convention-following exports are exempt. What's left in `novel`
is genuine: TS public surface that mirrors a Rails private API.

**Examples**

| TS file                                   | Promoted symbol                                                                           | Rails counterpart                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `relation/finder-methods.ts`              | `findOne`, `findSome`, `findNth*`, `findTake*`                                            | `Relation::FinderMethods#find_one` etc., all `private` in Rails |
| `relation/calculations.ts`                | `executeGroupedCalculation`, `executeSimpleCalculation`, `performCount`, `performMaximum` | `Relation::Calculations`, all `private`                         |
| `autosave-association.ts`                 | `validateBelongsToAssociation`, `saveCollectionAssociation`, `autosaveBelongsTo`          | `AutosaveAssociation`, all `private`                            |
| `connection-adapters/abstract-adapter.ts` | `arelVisitor`, `buildStatementPool`, `configureConnection`                                | `AbstractAdapter`, all `private`                                |

**Recommendation:** wrap with `_`-prefix or move into nested scope when
practical. Where TS modular splits make `export` necessary, add the
`@internal` JSDoc tag — the audit filters that already, and the
`blazetrails/rails-private-jsdoc` ESLint rule keeps it from leaking into
public types.

Total cluster size: ~120 across `perform*` (44), `findNth*` (10),
`validate*`/`autosave*` (21), `cast*`/`typeCast*` (16), `raise*` (6), etc.

## 2. `method_missing` / dynamic dispatch → explicit TS methods

Where Rails uses Ruby's `method_missing` or dynamic `define_method` to
materialize a family of methods on demand, trails has to enumerate each
one statically because TS lacks the introspection surface and the type
system needs concrete signatures.

**Example: `migration/command-recorder.ts`** — Rails' `CommandRecorder`
uses `method_missing` to forward any call to a recorded array and then
generates an `invert_<verb>` mirror at playback time. trails enumerates
all 36 verbs explicitly:

```
invertAddCheckConstraint        invertAddColumn        invertAddColumns
invertAddExclusionConstraint    invertAddForeignKey    invertAddIndex
invertAddReference              invertAddTimestamps    invertAddUniqueConstraint
invertChangeColumn              invertChangeColumnDefault invertChangeColumnNull
invertChangeTable               invertCreateEnum       invertCreateJoinTable
invertCreateTable               invertDisableExtension invertDropEnum
invertDropJoinTable             invertDropTable        invertDropVirtualTable
invertEnableExtension           invertRemoveCheckConstraint  …
```

This is genuine architectural divergence, not bugs. It IS extra surface,
but pruning it doesn't make sense — the Rails-private `inverse_of` lookup
isn't expressible as a single helper in TS without giving up type safety.

**Recommendation:** treat this cluster as intentional. Either add
`@internal` JSDoc and let the audit filter it, or accept the noise and
exclude with `--exclude-glob migration/command-recorder.ts`.

## 3. Schema/connection helpers exposed for testability

Files like `connection-adapters/abstract-adapter.ts`,
`connection-adapters/postgresql-adapter.ts`, and
`connection-adapters/abstract/schema-statements.ts` expose `addColumnForAlter`,
`addIndexForAlter`, `addTimestampsForAlter`, `buildCreateIndexDefinition`,
`buildTruncateStatement`, etc. — Rails has these but marks them `private`
in the adapter. trails exposes them because the test suite (and parity
infrastructure) needs to drive them directly.

This overlaps with cluster 1 but warrants its own bucket because the
fix isn't always "make it private" — sometimes the test-only access
is load-bearing.

**Recommendation:** audit each one; for the ones genuinely test-only,
prefer a `@internal` tag. For ones that need to remain public, document
why (a comment naming the call site is enough).

## 4. `arel*` accessor helpers

`relation/calculations.ts`, `relation/query-methods.ts`, and similar
expose `arelColumn`, `arelColumnsFromHash`, `arelColumnWithTable`,
`arelFromRelation`. Rails has equivalent private methods that build Arel
nodes inline; trails extracted them as named helpers so the Arel
construction logic is reusable across relation methods.

Often legitimate. The `arel*` naming makes the cluster easy to grep,
and the methods are typically narrow and well-named.

## 5. TS language idioms

Symbol-keyed properties have no Ruby analog:

- `[Symbol.iterator]`, `[Symbol.asyncIterator]` — make a class iterable
  (CollectionProxy, Relation, etc.).
- `[Symbol.toPrimitive]` — the TS analog of Ruby `to_s` coercion (e.g.
  `globalid/signed-global-id.ts`).
- `[Symbol.for("nodejs.util.inspect.custom")]` — V8 inspection hook;
  the TS analog of Ruby `inspect`. Filtered via `TS_ALWAYS_ALLOWED`.
- `[ADDITIONAL_VALUE_BRAND]`, `[ATTRIBUTE_BRAND]` — branded-type
  discriminants for nominal typing.

**Recommendation:** leave alone. These are necessary TS idioms.

## 6. Barrel re-exports

`connection-adapters.ts` (438 moved), `base.ts` (223 moved), and
`associations.ts` (79 moved) lead the **moved** column because they
re-export classes/values from sibling files. Each re-exported public
method appears in `tsMethodsByFile[barrel]` from the extractor's
viewpoint even though the actual definition lives elsewhere.

Mostly noise for prune-toward-Rails work. Filter with `--exclude-glob
connection-adapters.ts --exclude-glob base.ts` (or use `--novel-only`).

## 7. Snake-case typos (real bugs)

Found via the audit:

- `autosave-association.ts:897` exports `is_recordChanged` (snake-case,
  should be `isRecordChanged`). Three of these total. Worth a separate
  fix-up PR.

## 8. Predicate-form ambiguity

`activeConnectionsQ`, `applicationRecordClassQ` and similar `Q`-suffix
names — trails-internal convention for predicates that already have
non-predicate sibling methods (`activeConnections` returns a count,
`activeConnectionsQ` returns boolean). Rails uses the `?` suffix which
our convention maps to `is*`/camel forms; `Q` is a third trails-only
form not generated by `rubyMethodToTs`.

**Recommendation:** decide whether to widen `rubyMethodToTs` to also
emit a `Q`-suffix candidate, or rename the trails-side to the canonical
`is*`. A single-PR sweep would close ~15 of these. Out of scope here.

## Filter recipes

```bash
# Highest-signal prune candidates (Ruby-private promotions, no barrel noise)
pnpm api:extra --novel-only \
  --exclude-glob connection-adapters.ts \
  --exclude-glob base.ts \
  --exclude-glob inheritance.ts \
  --exclude-glob model.ts

# One package, novel only
pnpm api:extra --package activerecord --novel-only --top 30

# Audit a specific subdir
pnpm api:extra --json --top 1000 \
  | jq '.topN[] | select(.tsFile | startswith("relation/"))'
```
