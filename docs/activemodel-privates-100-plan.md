# activemodel post-100% follow-up plan

`pnpm api:compare --package activemodel` reached **433/433 (100%)** on
2026-04-29 via PRs #971 / #974 / #978 / #982 / #988 / #989. Public
surface is done. This doc tracks the four follow-up tracks that
remain — privates, the validator-internal `resolveValue` consumption
gap, the small `test:compare` gap, and the `readAttribute` Rails-parity
refactor.

Read the Rails source before each PR. Don't paraphrase from memory.
Per CLAUDE.md: ≤ 300 LOC per PR, draft, branch from `main`, no
subagents, no `Co-Authored-By` lines.

Rails reference: `scripts/api-compare/.rails-source/activemodel/`.

## Current state

```
pnpm api:compare --package activemodel                                        → 433/433 (100%)
pnpm tsx scripts/api-compare/compare.ts --privates --package activemodel      → 505/625 (80.8%)
pnpm test:compare --package activemodel                                       → 959/963 (99.6%)
```

> ⚠️ **Don't run `pnpm api:compare --privates …` for the privates view.**
> The `api:compare` script chains four commands with `&&`, and pnpm
> forwards arguments only to the LAST command in the chain (the
> `build-rails-privates-manifest` step). `compare.ts` ends up running
> with no flags (= public-only mode), and the printed numbers come
> from the manifest builder, not from the comparison report. Always
> invoke `compare.ts` directly when you need privates totals.

The privates view is what surfaces internal Rails behaviors that the
public view doesn't enforce. Most of the validator-family
`resolveValue` consumption gap from PR #971 is captured here as
unported privates (`Clusivity#delimiter`, `Format#recordError`,
`Numericality#optionAsNumber`, etc.) — porting the privates _forces_
the consumption call site to materialize.

### Track A is complete

All Track A PRs are merged. Direct invocation of `compare.ts` shows
every validator file at 100% (Clusivity 5/5, Inclusion 6/6, Exclusion
6/6, Format 6/6, Length 5/5, Numericality 15/15, Confirmation 4/4,
Acceptance 4/4, Callbacks 4/4 — only `validator.rb` itself has 1
remaining miss: `prepareValueForValidation`). Track A's
`resolveValue` consumption gap is fully closed.

The earlier "extractor extension (A6)" hypothesis was based on a
stale extraction run from the default worktree, which sat behind
origin/main and predated #1015 / #1026 / #1028. Re-extraction at
HEAD confirms the `declare X: typeof X` + prototype assignment
pattern is already picked up by `extract-ts-api.ts` via its existing
`PropertyDeclaration` branch. No tooling fix needed.

---

## Track A — Validator privates port

Closes the issue first surfaced in PR #971: validators got
`resolveValue` attached as a mixin method, but their own dispatch logic
doesn't call it where Rails does. The privates view exposes exactly
which helpers are missing. Each PR is one Rails source file → one
trails source file.

| File                          | Privates today | Status                            |
| ----------------------------- | -------------: | --------------------------------- |
| `validations/clusivity.rb`    |   5/5 (100%) ✓ | done — A1                         |
| `validations/exclusion.rb`    |   6/6 (100%) ✓ | done — A1 (via Clusivity)         |
| `validations/inclusion.rb`    |   6/6 (100%) ✓ | done — A1 (via Clusivity)         |
| `validations/format.rb`       |   6/6 (100%) ✓ | done — A2                         |
| `validations/length.rb`       |   5/5 (100%) ✓ | done — A3                         |
| `validations/numericality.rb` |   4/4 (100%) ✓ | done — A4a/A4b (PRs #1015, #1026) |
| `validations/confirmation.rb` |   2/2 (100%) ✓ | done — A5 (PR #1028)              |
| `validations/acceptance.rb`   |   2/2 (100%) ✓ | done — A5 (PR #1028)              |
| `validations/callbacks.rb`    |   2/2 (100%) ✓ | done — A5 (PR #1028)              |

### PR A1 — Clusivity (cascades to Inclusion + Exclusion) — ✅ done

Rails refs:

- `validations/clusivity.rb:14-43`. `delimiter` is `options[:in] || options[:within]`. `include?(record, value)` does the membership test, calling `resolve_value(record, delimiter)` at line 22. `inclusion_method(enumerable)` chooses `:include?` vs `:cover?` based on Range vs Array.

Trails files: `clusivity.ts`, `inclusion.ts`, `exclusion.ts`.

Changes:

1. Port `delimiter` as a private getter on the host (Inclusion / Exclusion validators) — call site for `this.resolveValue(record, this.delimiter)`.
2. Port `include?` (TS: `isInclude`) — replaces inline membership logic in `inclusion.ts` / `exclusion.ts`.
3. Port `inclusionMethod` — Range detection. Trails has no Range type yet; for now, treat any iterable that isn't an Array as the "cover" path. Document the gap if Range becomes a concern.

Closes the Clusivity / Inclusion / Exclusion `resolveValue` consumption gap.

### PR A2 — Format — ✅ done

Rails refs: `validations/format.rb:8-58`. `record_error` is the shared error-add helper. `check_options_validity` validates `:with` / `:without` mutual exclusion + multiline-anchor check. `regexp_using_multiline_anchors?` is the safety check.

Changes:

1. Port the three privates with their Rails signatures.
2. Rewire `validateEach` to call `this.resolveValue(record, options.with)` and `this.resolveValue(record, options.without)` per `format.rb:12,15` — drops the existing `resolveRegexp` private.

Closes the Format `resolveValue` consumption gap.

### PR A3 — Length — ✅ done

Rails ref: `validations/length.rb:55, 69`. `skip_nil_check?(key)` returns true when the option allows nil. `validate_each` line 55 calls `resolve_value(record, check_value)`.

Changes:

1. Port `skipNilCheck`.
2. Rewire `validateEach` to call `this.resolveValue(record, checkValue)` per Rails. Drops the inline `resolveNum`.

Closes the Length `resolveValue` consumption gap. Smallest PR in the track.

### PR A4a — Numericality coercion pipeline — ✅ done (PR #1015)

Rails refs: `validations/numericality.rb:68-117`.

Privates: `option_as_number`, `parse_as_number`, `parse_float`, `round`, `is_number?`, `is_integer?`, `is_hexadecimal_literal?`.

`option_as_number(record, option_value, precision, scale)` is
`parse_as_number(resolve_value(record, option_value), precision, scale)`
— this is the call site that closes the Numericality `resolveValue`
consumption gap.

Note name collisions in the api-compare conventions: `is_number?` →
`isIsNumber`, `is_integer?` → `isIsInteger`, `is_hexadecimal_literal?`
→ `isIsHexadecimalLiteral` (the conventions doubler appends `is`
prefix to predicate methods that already start with `is_`). Verify
against `scripts/api-compare/conventions.ts` before naming.

### PR A4b — Numericality dispatch helpers — ✅ done (PR #1026)

Privates: `filtered_options`, `allow_only_integer?`,
`prepare_value_for_validation`, `record_attribute_changed_in_place?`.

`prepare_value_for_validation` is Rails' Float / BigDecimal cast hook
for AR; in AM it's a near-passthrough. Faithful port + wire into
`validateEach`.

Split from A4a because numericality is dense; A4a is the substantive
behavior change, A4b is the surface fill.

### PR A5 — Confirmation + Acceptance + Callbacks bundle — ✅ done (PR #1028)

Three small files, ~2 privates each. Ports landed in #1028 with
`setupBang` + `isConfirmationValueEqual` (Confirmation),
`setupBang` + `isAcceptableOption` (Acceptance), and
`setOptionsForCallback` + `runValidationsBang` (Callbacks). Shared
`inspectAccessor` helper extracted to `validations/_accessor.ts`
during review.

**Track A target met:** validator family privates at 100%. The
"validators don't consume resolveValue" gap is fully closed.

---

## Track B — Privates beyond validators

~120 misses across activemodel non-validator files. Real per-file
miss list (from `pnpm tsx scripts/api-compare/compare.ts --privates
--package activemodel --missing` at HEAD `1a9aaaf9b`):

| File                                                                     | Misses | Methods                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validations.rb`                                                         |     11 | contextForValidation, initInternals, runValidationsBang, raiseValidationError, \_mergeAttributes, predicateForValidationContext, \_validatesDefaultKeys, \_parseValidatesOptions, \_define{Before,Around,After}ModelCallback |
| `attribute_methods.rb`                                                   |     12 | isAttributeMethod, matchedAttributeMethod, missingAttribute, \_readAttribute, resolveAttributeName, … (12 total)                                                                                                             |
| `model.rb`                                                               |      8 | \_assignAttributes, \_assignAttribute, sanitizeForMassAssignment, contextForValidation, initInternals, … (overlaps validations + attribute_assignment)                                                                       |
| `api.rb`                                                                 |      8 | same shape as model.rb (both share the assignment / validation entrypoints)                                                                                                                                                  |
| `dirty.rb`                                                               |      8 | initInternals, attributePreviousChange, attributeWillChangeBang, restoreAttributeBang, isAttributeMethod, …                                                                                                                  |
| `type/integer.rb`                                                        |      7 | range, isInRange, castValue, ensureInRange, maxValue, minValue, \_limit                                                                                                                                                      |
| `attribute_registration.rb`                                              |      6 | applyTo, pendingAttributeModifications, resetDefaultAttributesBang, resolveAttributeName, resolveTypeName, …                                                                                                                 |
| `attributes.rb`                                                          |      6 | \_writeAttribute, isAttributeMethod, matchedAttributeMethod, missingAttribute, \_readAttribute, …                                                                                                                            |
| `type/date.rb`                                                           |      5 | castValue, fastStringToDate, fallbackStringToDate, newDate, valueFromMultiparameterAssignment                                                                                                                                |
| `attribute_set/builder.rb`                                               |      5 | additionalTypes, defaultAttribute, materialize, delegateHash, assignDefaultValue                                                                                                                                             |
| `type/date_time.rb`                                                      |      4 | castValue, microseconds, fallbackStringToTime, valueFromMultiparameterAssignment                                                                                                                                             |
| `type/decimal.rb`                                                        |      3 | castValue, convertFloatToBigDecimal, floatPrecision                                                                                                                                                                          |
| `type/helpers/numeric.rb`                                                |      3 | isEqualNan, isNumberToNonNumber, isNonNumericString                                                                                                                                                                          |
| `serializers/json.rb`                                                    |      3 | attributeNamesForSerialization, serializableAttributes, serializableAddIncludes                                                                                                                                              |
| `serialization.rb`                                                       |      3 | (same 3 — duplicated in serializers/json.rb)                                                                                                                                                                                 |
| `callbacks.rb`                                                           |      3 | \_define{Before,Around,After}ModelCallback                                                                                                                                                                                   |
| `attribute_assignment.rb`                                                |      2 | \_assignAttributes, \_assignAttribute                                                                                                                                                                                        |
| `type/helpers/time_value.rb`                                             |      2 | newTime, fastStringToTime                                                                                                                                                                                                    |
| `attribute.rb`                                                           |      2 | \_valueForDatabase, \_originalValueForDatabase                                                                                                                                                                               |
| `attribute_mutation_tracker.rb`                                          |      2 | fetchValue, typeCast                                                                                                                                                                                                         |
| `lint.rb`                                                                |      2 | model, assertBoolean                                                                                                                                                                                                         |
| `naming.rb`                                                              |      2 | \_singularize, i18nKeys                                                                                                                                                                                                      |
| `type/{value,boolean,float,immutable_string,string,time,big_integer}.rb` | 1 each | castValue (or maxValue for big_integer)                                                                                                                                                                                      |
| `type/registry.rb`                                                       |      1 | registrations                                                                                                                                                                                                                |
| `errors.rb`                                                              |      1 | normalizeArguments                                                                                                                                                                                                           |
| `error.rb`                                                               |      1 | attributesForHash                                                                                                                                                                                                            |
| `attribute_set.rb`                                                       |      1 | defaultAttribute                                                                                                                                                                                                             |
| `validator.rb`                                                           |      1 | prepareValueForValidation                                                                                                                                                                                                    |
| `validations/absence.rb`                                                 |      1 | \_mergeAttributes                                                                                                                                                                                                            |

**Cross-cutting observations:**

- **`castValue` family (10 files)**: Rails' `Type::Value#cast_value`
  is the protected hook subclasses override for the actual coercion.
  Trails uses inline logic in `cast`. Either rename + rewire, or add
  a thin `castValue` indirection per type. Single-PR-able if scoped
  carefully (one source-of-truth in `value.ts`, mechanical updates
  in subclasses).
- **Multiparameter cluster** (`type/date.rb`, `type/date_time.rb`,
  `type/helpers/time_value.rb`, `attribute_assignment.rb`):
  `valueFromMultiparameterAssignment`, `fastStringToTime`,
  `fallbackStringToTime`, `newTime`, `_assignAttribute(s)` —
  closely related, also overlaps with **Track C1's** hash-form
  multiparameter test ports.
- **Internals callback cluster** (`validations.rb`, `model.rb`,
  `api.rb`, `dirty.rb`, `attribute_registration.rb`, `callbacks.rb`):
  `initInternals`, `_defineBefore/Around/AfterModelCallback`,
  `contextForValidation`. These read like the same handful of methods
  re-exposed across files via Ruby `include` — likely small once
  one is ported.
- **Attribute-method dispatch cluster** (`attribute_methods.rb`,
  `attributes.rb`): `isAttributeMethod`, `matchedAttributeMethod`,
  `missingAttribute`, `_readAttribute`, `resolveAttributeName`. These
  overlap with **Track D** (the readAttribute/MissingAttributeError
  refactor); land Track D's caller-audit (D0) before scoping these
  further.

### Suggested PR breakdown

**PR B1 — `castValue` indirection across Type primitives**
Single PR rewiring every `Type` subclass to expose `castValue` as
the protected coercion hook (matching Rails). Closes ~10 misses
(value, boolean, float, immutable_string, string, time, big_integer,
date, date_time, decimal, integer's `castValue` slot). Mechanical
once the pattern is set in `value.ts`.

**PR B2 — Numeric primitives bundle (`type/integer.rb` + `type/decimal.rb` + `type/helpers/numeric.rb`)**
After B1 lands `castValue`. Adds the remaining numeric privates:
range/isInRange/ensureInRange/maxValue/minValue/\_limit (integer),
convertFloatToBigDecimal/floatPrecision (decimal),
isEqualNan/isNumberToNonNumber/isNonNumericString (numeric helpers).
~13 misses.

**PR B3 — Date/DateTime/TimeValue helpers + Multiparameter**
After B1. fastStringToDate/fallbackStringToDate/newDate (date),
microseconds/fallbackStringToTime (date_time), newTime/fastStringToTime
(time_value), valueFromMultiparameterAssignment (date+date_time).
~9 misses. **Coordinate with Track C1/C2/C3** — same surface.

**PR B4 — Serialization (`serialization.rb` + `serializers/json.rb`)**
attributeNamesForSerialization, serializableAttributes,
serializableAddIncludes. The two files share the trio (mixin), so
one PR closes 6 misses.

**PR B5 — Internals callbacks + validation lifecycle (`validations.rb` + `callbacks.rb` + cross-file initInternals)**
The 3 `_defineXxxModelCallback` methods + `initInternals` +
`runValidationsBang` + `raiseValidationError` +
`predicateForValidationContext` + `contextForValidation` +
`_mergeAttributes`. Mostly one shared cluster surfaced across
multiple files. ~15-18 misses across `validations.rb`, `callbacks.rb`,
`model.rb`, `api.rb`, `dirty.rb`. Likely needs splitting into B5a
(definitions) + B5b (consumption rewiring).

**PR B6 — Attribute method dispatch cluster (`attribute_methods.rb` + `attributes.rb` + `attribute_set/builder.rb`)**
isAttributeMethod, matchedAttributeMethod, missingAttribute,
\_readAttribute, \_writeAttribute, resolveAttributeName,
defaultAttribute, materialize. ~20 misses, but overlaps Track D —
**defer until Track D0 has scoped the readAttribute caller audit**.

**PR B7 — Tail (lint, naming, errors, error, attribute, attribute_registration, attribute_assignment, attribute_mutation_tracker, validator, validations/absence)**
The remaining 1-6 each. Bundle by reasonable cohesion, probably 2-3
PRs.

**Track B target:** activemodel privates 80.8% → ~99%. Final 1% is
non-portable Ruby internals (lifecycle hooks, `method_missing`,
etc.) that should remain in the api-compare skip list.

### Suggested order

1. **B1** (castValue) — unblocks B2+B3 cleanly; mechanical, low risk.
2. **B4** (serialization) — small, isolated, no dependencies.
3. **B5a** (internals callbacks definitions) — sets up the shared
   surface that B5b/B6 rewire to.
4. **B2 + B3** in parallel (numeric vs date/time clusters).
5. **B5b** (validation lifecycle consumption) — after B5a.
6. **Defer B6** until Track D0 lands the readAttribute audit.
7. **B7** in the gaps.

---

## Track C — `test:compare` push to 100%

Currently 959/963 (99.6%). Only 4 missing tests, but they're worth
identifying explicitly before scoping. Some may unblock for free as
Track A privates land.

**PR C0 — Investigation, no code — ✅ done (this section)**

The 4 missing tests are all in `type/`, none unblocked by Track A:

| Rails test                                                    | Behavior                                                                                                                                                                                                                | Trails gap                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type/date_test.rb` → **`returns correct year`**              | `Type::Date.new.cast({1=>1, 2=>1, 3=>1})` → `Date(year=1, mon=1, day=1)`. Pins that hash multiparameter assignment with `year=1` doesn't trigger Ruby's two-digit-year guess.                                           | Test name absent. Trails `date.test.ts` has multiparameter coverage via `PlainDateTime input extracts date (multiparameter support)`, but no hash-input case and no year=1 boundary. Verify `Type::Date.cast({1:1,2:1,3:1})` round-trips cleanly. |
| `type/date_time_test.rb` → **`hash to time`**                 | `Type::DateTime.new.cast({1=>2018, 2=>10, 3=>15})` → `Time.utc(2018,10,15,0,0,0)`. Hash-form multiparameter cast.                                                                                                       | Test name absent. Trails `date-time.test.ts` covers `PlainDateTime input is converted to Instant (multiparameter support)`, but not the raw `{1:..,2:..,3:..}` hash form. Confirm `Type::DateTime.cast(hash)` accepts hash directly.              |
| `type/date_time_test.rb` → **`string to time with timezone`** | Iterates over `["UTC", "US/Eastern"]` as `Time.zone_default`, then `Type::DateTime.new.cast("Wed, 04 Sep 2013 03:00:00 EAT")` → `Time.utc(2013,9,4,0,0,0)`. RFC2822-ish parse + named-zone abbreviation (EAT = +03:00). | Both gaps: (a) named-TZ-abbrev parsing (`EAT`, `EST`, etc.) is not in the existing `string with offset` helper; (b) no thread-local / AsyncLocalStorage default zone analogous to `Time.zone_default`.                                            |
| `type/time_test.rb` → **`user input in time zone`**           | `Time.use_zone("Pacific Time (US & Canada)") { type.user_input_in_time_zone(timeStr) }` — pulls offset from current zone, asserts `.hour` and `.formatted_offset`.                                                      | Trails `userInputInTimeZone` exists but takes the zone as an explicit second arg. The Rails test relies on a current-zone context. Need a thread-local zone (AsyncContext / global default) that `userInputInTimeZone(value)` reads.              |

**Findings:**

- 2 of 4 (Date `returns correct year`, DateTime `hash to time`) look like **pure test ports** — trails likely already supports the underlying behavior via existing multiparameter paths; verify and add the named tests.
- 2 of 4 (DateTime `string to time with timezone`, Time `user input in time zone`) need **real implementation work**: a current-zone context (analogue of Rails' `Time.zone`/`Time.use_zone`) and named-TZ-abbrev parsing in DateTime cast.

**PR C1 — Port `returns correct year` + `hash to time`**
Pure test additions, one per file. Verify behavior matches before
asserting; if it doesn't, fix the impl in the same PR (these are the
type primitives' multiparameter paths — small code change at most).

**PR C2 — Current-zone context + `user input in time zone`**
Add a current-zone slot (AsyncLocalStorage-backed
`Time.currentZone()` analogue or a module-level setter; pick the one
that fits trails' existing time-zone surface). Update
`userInputInTimeZone(value)` to default to it. Port the test name
verbatim.

**PR C3 — Named-TZ-abbrev parsing + `string to time with timezone`**
Extend the DateTime cast string parser to accept zone abbreviations
(EAT, EST, PST, etc.). Source the abbreviation table from the
existing `time-zone.ts` mapping if present; otherwise vendor the
small set Rails uses. Port the test name verbatim.

Order: C1 first (cheap, banks 2/4). C2 before C3 (the
`Time.zone_default` block in C3's test reuses the current-zone
infra C2 introduces).

**Track C target:** test:compare 959/963 → 963/963 (100%).

---

## Track D — `Model#readAttribute` → `MissingAttributeError`

The 217-call-site refactor that the post-100% review flagged but kept
out of scope because it's much larger than a cleanup PR.

Rails `attribute_methods.rb:553` raises `MissingAttributeError` via
`missing_attribute(attr_name, stack)`. Trails `Model#readAttribute`
returns `null` for unknown attributes — divergence currently documented
inline in `model.ts:readAttribute`. 217 internal call sites across 47
files (excluding tests / `dist/` / `.d.ts`) currently rely on
null-return. Naive flip raises in many code paths — `secure-password`,
validators, callbacks, dirty tracking.

**PR D0 — Caller audit, no code**
Categorize the 217 sites:

- (a) "definitely defined, raise on miss" → keep `readAttribute`.
- (b) "may be undefined, treat as nil" → switch to
  `hasAttribute(name) ? readAttribute(name) : null` or a new
  `tryReadAttribute(name)` helper.

Decide whether to introduce `tryReadAttribute` or require explicit
`hasAttribute` guards. Rails ActiveRecord overrides `_read_attribute`
to return nil via `@attributes.fetch_value(attr)`; ActiveModel raises.
Pick a stance.

Output: addendum to this doc with per-file caller breakdown + the
helper-vs-guard decision.

**PR D1 — Introduce `tryReadAttribute` (or chosen alternative)**
Pure addition. No behavior change to existing `readAttribute`.

**PR D2…Dn — Migrate callers, file by file or feature cluster**
Probably 4-6 PRs grouped by area: secure-password, validators,
callbacks, dirty tracking, ActiveRecord-side callers, the rest.
Each PR replaces the relevant `readAttribute` calls with the chosen
alternative.

**PR Dfinal — Flip `readAttribute` to raise**
Once all internal callers are migrated, flip the default. Remove the
divergence comment in `model.ts:readAttribute`.

**Track D target:** Trails `readAttribute` matches Rails' raise
semantics; activemodel divergence comment removed.

---

## Won't fix

**`attribute_missing` eager-dispatch divergence.** TS has no
`method_missing`. Trails routes ALL generated per-attribute methods
through `attributeMissing` so subclass overrides work; Rails only
routes the cold `method_missing` path. Behaviorally equivalent for
override semantics; mechanism mismatch is unavoidable. Comment in
`attributes.ts:defineDirtyAttributeMethods` documents it.

---

## Suggested execution order

1. **Track A** (5-6 PRs) — highest leverage. Closes the validator
   `resolveValue` consumption gap. Lifts privates from 74.8% → ~83%.
   Likely side-lifts test:compare.
2. **Track C0 investigation** — identifies the 4 missing tests; some
   probably already unblocked by Track A.
3. **Track C1+** in parallel with B — small, low-risk.
4. **Track B** — broader privates push. Sequence after A so validator
   patterns are established.
5. **Track D last** — biggest commitment, biggest risk. Don't start
   until A and B have a comfortable cadence so the Model touch surface
   is stable.
