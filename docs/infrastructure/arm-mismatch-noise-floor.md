# Arm-mismatch noise floor — the RFC 0113 measurement

RFC 0113 pre-committed, before any measurement, to a tripwire: **if more than
roughly one third of the arm mismatches `pnpm parity:api:arms:report` reports
are lowering artefacts rather than real divergences, take the ungated path** and
record the measured rate rather than tuning a gate until it agrees with us.

This is that measurement. Story: `measure-arm-mismatch-noise-floor`.

## Verdict

**Run ungated.** The measured artefact rate is **57.5%** — with a further 5.0%
attributable to defects in the extraction itself, so **62.5% of reported rows
are not real arm divergences**. That is roughly double the tripwire, and the
95% interval on the figure (±10.8 points, i.e. 51.9%–73.1% for the combined
non-real rate) does not come near ⅓.

| Verdict           | Rows | Share |
| ----------------- | ---: | ----: |
| real              |   30 | 37.5% |
| lowering artefact |   46 | 57.5% |
| extraction bug    |    4 |  5.0% |
| **total**         |   80 |  100% |

The report itself stays: 37.5% of 2,718 rows is ~1,020 genuine divergences, and
that signal is worth reading. What it cannot do is gate — a ratchet over this
population would spend most of its rows on spellings, and the only way to make
it green would be to baseline the noise, which is the outcome the tripwire
exists to prevent.

## Reproducing the sample

```bash
pnpm build                                  # the extractor reads dist/*.d.ts
API_COMPARE_FORCE=1 pnpm parity:api --calls # writes output/call-skeletons.json
pnpm tsx scripts/api-compare/report-arms.ts --sample=80 --seed=113
```

**Size 80, seed 113** (the RFC number). The draw is a seeded Fisher–Yates
shuffle (`mulberry32`) over the mismatch rows sorted by
`package/tsFile#tsName`, so the same seed re-draws the same 80 rows from the
same artifact. Population at the time of measurement: **2,718 mismatched pairs
across 559 files, out of 5,614 pairs compared** — 48.4% of all compared pairs
are flagged, which is itself a signal that the comparison is not selective.

80 rows separates ⅓ from ½ comfortably: the standard error on a proportion near
0.5 at n=80 is 5.6 points, so the 95% interval is ±11.

## Classification rules

Each row is exactly one of three, decided by asking **what would have to change
for this row to stop being reported**:

- **real** — a genuine missing, invented or reordered arm. The port would have
  to change. Includes an arm invented for a trails-specific mechanism
  (an override hook, an async halt protocol) and an arm dropped because the
  port reimplemented the method.
- **lowering artefact** — the same control flow spelled differently across the
  language boundary. Nothing about the port is wrong; the projection cannot see
  that the two spellings agree. Includes:
  - **nullability** — `?? default`, `x?.y`, a `typeof`/`Array.isArray` guard
    standing in for a Ruby duck-type or a kwarg default;
  - **`case` lowering** — Ruby `case` is ONE `if` token whatever its `when`
    count; its faithful TS `if`/`else if` chain is one token per arm, so every
    ported `case` with two or more `when`s reports;
  - **stdlib idiom** — `uniq`, `filter_map`, `drop_while`, `delete_if`,
    `compact!`, `concat` have no JS equivalent, so a faithful port spells them
    as a loop or a filter with a guard;
  - **Ruby-only guards** — `block_given?`, `defined?`, `to_enum`, `.nil?`
    chains that TS types make unreachable;
  - **exception idiom** — Ruby `rescue TypedError` / `catch`-`throw` lowers to
    `catch (e) { if (e instanceof X) …; throw e }`, and `ensure` around a
    possibly-async body lowers to `catch`+rethrow plus `finally`;
  - **Ruby Symbol convention** — `Symbol === k` becomes
    `typeof k === "string" && k.startsWith(":")`, two tokens for one;
  - **helper delegation** — the arms exist, in a same-file helper the sequence
    comparison deliberately does not union (`ArmVerdict`'s rejected option 1).
- **extraction bug** — the skeleton is wrong on one side, and fixing the
  extractor ALONE would clear the row.

## Extraction bugs found

Both are defects in RFC 0084's delivered tooling, filed there rather than
against RFC 0113's burndown.

1. **Ruby `||=` / `&&=` emits no arm; TS `??=` / `||=` / `&&=` emits one.**
   `extract-ruby-api.rb:2392` compares `op_assign_op(node[2])` — which returns
   the Ruby String `"||="` — against `SKELETON_LOGICAL_OPS`, which holds the
   Symbols `:"||"` / `:"&&"`. The test never passes, so every Ruby memo
   (`@x ||= …`) is silent while its faithful TS port (`this._x ??= …`, or the
   `if (!this._x)` spelling) reports an invented `if`. 4 of the 80 rows are
   this defect alone (rows 15, 43, 61, 66), and Ruby memos are everywhere, so
   its share of the full 2,718 is likely higher than 5%.
2. **The block-iteration fold covers only `each`.** `foldSkeletonTokens`
   derives `LOOP_SKELETON_NAMES` from the names that are BOTH a
   `JS_ENUMERABLE_ALIASES` entry aliasing `forEach` AND in `NO_JS_CALL_FORM`;
   in practice that set is `{each, forEach}`. `each_value`, `each_pair`,
   `each_key`, `each_with_index`, `each_with_object`, `reverse_each` and
   `filter_map` all stay `ref:` tokens, so their faithful `for…of` ports report
   an invented `loop`. RFC 0113's own story text says this artefact class
   "should NOT appear"; it does, for every iterator but one.

Two further asymmetries were observed but did not by themselves flag a row, so
they are recorded here rather than filed: Ruby's **modifier `rescue`**
(`@v = expr rescue nil`, a `rescue_mod` node) emits no `try` where the TS
`try`/`catch` port does, and Ruby's **`catch`/`throw`** block is an ordinary
call reach while its TS lowering is a `try` plus an `if` plus a `throw`.

## Per-row verdicts

Rows are numbered as `--sample=80 --seed=113` prints them.

| #   | pair                                                                           | verdict        | why                                                                |
| --- | ------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------ |
| 1   | rack `method-override.ts#methodOverrideParam`                                  | real           | the port inlines a whole form-parse implementation Rails delegates |
| 2   | activerecord `associations/builder/association.ts#build`                       | real           | invented array + repeated dangerous-name guards                    |
| 3   | activerecord `result.ts#castValues`                                            | artefact       | `is_a?(Array)` hoisted into one ternary                            |
| 4   | activesupport `log-subscriber.ts#color`                                        | artefact       | Symbol test spelled as `&&` + `?? ""`                              |
| 5   | trailties `…/change-generator.ts#editDevcontainerJson`                         | real           | reimplemented; Rails delegates to two helpers                      |
| 6   | activerecord `coders/column-serializer.ts#load`                                | artefact       | `object \|\|= …` spelled as an `if`                                |
| 7   | activerecord `migration.ts#runWithoutLock`                                     | artefact       | `?? ""` on the error argument                                      |
| 8   | actionview `digestor.ts#digest`                                                | real           | no cache, no dependency arm — a different method                   |
| 9   | activerecord `associations/through-association.ts#ensureMutable`               | real           | invented macro/owner guards                                        |
| 10  | activerecord `…/query-cache.ts#disableQueryCache`                              | artefact       | `ensure` over a maybe-async body                                   |
| 11  | activerecord `relation/predicate-builder.ts#build`                             | real           | invented scalar-normalisation arms                                 |
| 12  | activesupport `secure-compare-rotator.ts#secureCompareBang`                    | artefact       | kwarg-default lowering                                             |
| 13  | activerecord `migration/command-recorder.ts#invertChangeColumnDefault`         | artefact       | `is_a?(Hash)` needs an extra null test                             |
| 14  | trailties `generators/generated-attribute.ts#parse`                            | artefact       | truthiness guard on `type`                                         |
| 15  | activerecord `result.ts#columnIndexes`                                         | extraction bug | Ruby `@x \|\|=` emits no arm                                       |
| 16  | activerecord `reflection.ts#checkValidityOfInverseBang`                        | artefact       | identity compare spelled as two field compares                     |
| 17  | activerecord `associations/join-dependency.ts#constructModel`                  | real           | inlines the ported `column_aliases`                                |
| 18  | activesupport `json/encoding.ts#encode`                                        | artefact       | `fetch` lowered to `??`                                            |
| 19  | activerecord `…/reaper.ts#registerPool`                                        | real           | invented timer/discard guards                                      |
| 20  | globalid `locator.ts#use`                                                      | real           | drops the no-locator raise                                         |
| 21  | globalid `signed-global-id.ts#parse`                                           | real           | invented verifier assertion (documented deviation)                 |
| 22  | actiondispatch `http/mime-negotiation.ts#accepts`                              | artefact       | `?? ""` on the header                                              |
| 23  | activesupport `deprecation/deprecators.ts#each`                                | artefact       | `to_enum` arm has no TS analogue (the `+loop` half is bug 2)       |
| 24  | activerecord `…/extended-deterministic-uniqueness-validator.ts#installSupport` | real           | invented install guard and callable check                          |
| 25  | actiondispatch `…/page-dump-helper.ts#openFile`                                | real           | invented per-platform branches                                     |
| 26  | activemodel `type/binary.ts#cast`                                              | real           | drops the encoding arm                                             |
| 27  | activesupport `message-verifier.ts#decode`                                     | artefact       | `catch`/`throw` lowered to try/catch                               |
| 28  | activerecord `associations/association.ts#buildRecord`                         | real           | invented klass/reflection fallback arms                            |
| 29  | actiondispatch `middleware/flash.ts#empty`                                     | real           | tests a `_now` map Rails does not have                             |
| 30  | activerecord `associations/has-one-association.ts#_createRecord`               | real           | invented displaced-target load and rethrow                         |
| 31  | activerecord `…/transaction.ts#records`                                        | artefact       | `concat` spelled as a push loop                                    |
| 32  | activerecord `…/has-many-through-association.ts#markOccurrence`                | artefact       | body delegates to a same-file helper                               |
| 33  | activesupport `cache.ts#deserializeEntry`                                      | artefact       | typed `rescue` lowering                                            |
| 34  | activesupport `core-ext/hash/conversions.ts#processHash`                       | artefact       | `case` + `try(:empty?)` lowering                                   |
| 35  | actiondispatch `journey/formatter.ts#extractParameterizedParts`                | artefact       | `drop_while` / `delete_if` / `compact!` have no JS form            |
| 36  | activerecord `associations/preloader/branch.ts#targetClasses`                  | artefact       | `uniq` spelled as a Set filter, three times                        |
| 37  | activerecord `…/has-one-through-association.ts#replace`                        | real           | thirteen invented arms over a two-line Rails body                  |
| 38  | activerecord `…/envelope-encryption-key-provider.ts#primaryKeyProvider`        | real           | invented override branch                                           |
| 39  | actioncontroller `…/strong-parameters.ts#deepTransformKeysBang`                | artefact       | duck-typed `to_unsafe_h`                                           |
| 40  | activerecord `encryption/message-serializer.ts#validateMessageDataFormat`      | real           | invented headers-shape validation                                  |
| 41  | actiondispatch `middleware/debug-exceptions.ts#isApiRequest`                   | artefact       | guard clause hoisted, `\|\|`                                       |
| 42  | activerecord `relation/query-methods.ts#buildFrom`                             | real           | invented NotImplementedError arm                                   |
| 43  | activesupport `message-encryptor.ts#lengthOfEncodedAuthTag`                    | extraction bug | Ruby `@x \|\|=` emits no arm                                       |
| 44  | activerecord `schema-dumper.ts#constructor`                                    | artefact       | adapter duck-typing and `??`                                       |
| 45  | activesupport `hash-with-indifferent-access.ts#convertKey`                     | artefact       | Ruby-Symbol-as-`":name"` convention                                |
| 46  | activerecord `table-metadata.ts#isAssociatedWith`                              | artefact       | `&.` lowered to a guard clause                                     |
| 47  | actiondispatch `http/request.ts#readBodyStream`                                | artefact       | stream duck-typing guards                                          |
| 48  | activerecord `model-schema.ts#resetTableName`                                  | artefact       | Ruby `superclass` chain spelled with `hasOwnProperty`              |
| 49  | activerecord `associations/join-dependency.ts#instantiate`                     | real           | reimplemented; inlines ported collaborators                        |
| 50  | actioncontroller `base.ts#cookies`                                             | artefact       | `?? {}`                                                            |
| 51  | activerecord `counter-cache.ts#updateCounters`                                 | real           | drops the composite-key and Hash arms                              |
| 52  | actioncontroller `metal/rendering.ts#_processVariant`                          | artefact       | `defined?` / `.nil?` guards collapse into `present?`               |
| 53  | activerecord `…/oid/date-time.ts#castValue`                                    | artefact       | `case` lowered to an `if` chain                                    |
| 54  | activerecord `…/sqlite3/database-statements.ts#buildTruncateStatement`         | artefact       | `?? ` fallback quoting                                             |
| 55  | arel `visitors/dot.ts#visitEdge`                                               | real           | invented method-presence guard and raise                           |
| 56  | activerecord `…/postgresql/schema-definitions.ts#newColumnDefinition`          | real           | invented datetime physical-type arms                               |
| 57  | activesupport `notifications.ts#subscribe`                                     | artefact       | block-vs-callable duck typing                                      |
| 58  | activerecord `associations/preloader/branch.ts#likelyReflections`              | artefact       | `filter_map` spelled as loop + push guard                          |
| 59  | activerecord `attribute-methods.ts#formatForInspect`                           | artefact       | body delegates to a same-file helper                               |
| 60  | activerecord `relation/query-methods.ts#reverseSqlOrder`                       | artefact       | `case` + `\|\|` chain lowering                                     |
| 61  | trailties `…/change-generator.ts#database`                                     | extraction bug | Ruby `@x \|\|=` emits no arm                                       |
| 62  | activerecord `associations/preloader.ts#constructor`                           | real           | invented `_materialized` arm                                       |
| 63  | activerecord `future-result.ts#executeQuery`                                   | artefact       | kwarg default `?? false`                                           |
| 64  | activerecord `…/postgresql/schema-dumper.ts#prepareColumnOptions`              | real           | the enum arm is duplicated into an early return                    |
| 65  | activesupport `hash-utils.ts#deepStringifyKeysBang`                            | artefact       | Ruby-Symbol convention                                             |
| 66  | activesupport `number-helper/number-converter.ts#options`                      | extraction bug | Ruby `@x \|\|=` emits no arm                                       |
| 67  | activemodel `type/helpers/time-value.ts#fastStringToTime`                      | artefact       | Temporal needs the normalisation `Time.new` does internally        |
| 68  | activerecord `relation/finder-methods.ts#findTake`                             | artefact       | `?? null` twice (plus bug 1)                                       |
| 69  | actiondispatch `testing/request-encoder.ts#parser`                             | artefact       | modifier-if spelled as `&&` + ternary                              |
| 70  | activerecord `associations/builder/association.ts#addDestroyCallbacks`         | real           | invented halt/rescue protocol in the callback                      |
| 71  | activerecord `log-subscriber.ts#sql`                                           | artefact       | `??` fallbacks and a helper extraction                             |
| 72  | activesupport `notifications.ts#instrument`                                    | artefact       | `block_given?` has no TS analogue                                  |
| 73  | arel `nodes/casted.ts#isInfinite`                                              | artefact       | JS numbers have no `infinite?`                                     |
| 74  | activerecord `…/mysql/schema-statements.ts#typeWithSizeToSql`                  | artefact       | multi-`when` `case` lowering                                       |
| 75  | actionview `lookup-context.ts#detailsCacheKey`                                 | artefact       | `fetch`-with-block spelled as get/set, `?? []`                     |
| 76  | activerecord `insert-all.ts#disallowRawSqlBang`                                | real           | invented `permit` regex arm                                        |
| 77  | arel `select-manager.ts#lock`                                                  | artefact       | `case` lowering                                                    |
| 78  | activerecord `persistence.ts#incrementBang`                                    | real           | invented arity raise and touch-callback arm                        |
| 79  | actiondispatch `testing/assertions/response.ts#exceptionIfPresent`             | artefact       | `Minitest::UnexpectedError` has no analogue                        |
| 80  | activerecord `scoping/named.ts#scope`                                          | real           | drops the `to_proc` and extension arms                             |

## What this means for the RFC

- Open question 1 is answered: **ungated**. RFC 0113's 59 burndown stories are
  verified arm-for-arm against the cited Rails `file:line` in review, per its
  Rollout's ungated branch.
- `pnpm parity:api:arms:report` stays report-only, and stays useful: it is how a
  burndown story finds its rows.
- The two extraction bugs are worth fixing regardless of the gate decision —
  they cost the report roughly a twentieth of its rows outright, and the
  `||=` one silently biases every memoised reader in the corpus.

## Addendum — what the per-clause count and the helper splice cleared

RFC 0113's `skeleton-emits-one-arm-per-when-elsif-and-rescue-clause` and
`arms-report-unions-same-file-helper-skeletons` shipped together. Measured over
the same corpus on the same commit, the report moved **2,746 → 2,673 mismatched
pairs** (6,040 pairs compared; the population has grown since the 2,718/5,614
this document's sample was drawn from, so the row numbering above no longer
re-draws).

Two of this document's classifications turned out to be finer-grained than the
sample's shorthand, and are corrected here rather than silently:

- **`case` lowering.** One `if` per `when` CLAUSE is the right count, and it
  clears row 77 (`arel select-manager.ts#lock`). It does not clear rows 34, 53,
  60 or 74: each of those is a single `when` with several VALUES
  (`when nil, "tiny", "medium", "long"`,
  `mysql/schema_statements.rb:273`) or a `case` mixed with another artefact
  class, and a multi-value `when` is one arm in Ruby however many `===` tests
  its port spells.
- **Helper delegation.** Row 77's sibling class splices as designed, but neither
  row 32 nor row 59 does. Row 59 (`attribute-methods.ts#formatForInspect`)
  delegates ACROSS files, to `attribute-inspection.ts`, which the splice
  deliberately does not credit — the same line `effectiveTsCalls` draws. Row 32
  (`has-many-through-association.ts#markOccurrence`) is a same-file delegation
  from a method to a top-level function of the SAME name, so the reach resolves
  ambiguously under the per-(file, name) scoping compare.ts keys on; filed as
  `arms-splice-same-name-same-file-delegation`.

The splice is one-directional by construction: it can discharge a flag, never
raise one (`report-arms.ts#compareArms`). Taken naively in both directions it
charged every divergent helper's arms to each of its callers and inflated the
report to 3,684 rows.
