# ActiveModel Alignment Plan

Date: 2026-05-02
Source audits: `docs/activemodel/{audit-core,audit-lifecycle,audit-types,audit-validations,audit-crosscutting}.md`
Headline: ~40 verified deviations across 64 files. None are user-blocking today; many are silent footguns.

## Conventions for this plan

- **PR size target**: ~250 LOC (additions + deletions, excluding lockfiles/snapshots). 300 cap stays. The `LazyAttributeHash` PR (P1) is allowed to exceed if needed; rationale documented in the PR body.
- **camelCase only** in all option keys, error types, locale keys (continue current trails convention; no snake_case anywhere).
- **No backwards-compat shims** — pre-release; rewrite straight.
- **Tests**: ActiveModel test:compare is at 100%. Each PR adds **targeted unit tests** (`*.test.ts` next to the source) covering the specific behavior change + edge cases unique to TS (e.g. `Symbol`-input cast paths, `Temporal.PlainDate` vs `Date` dispatch). Existing Rails-mirrored tests are not renamed.
- **Naming**: PR titles use `fix(activemodel): …` or `refactor(activemodel): …`. Numbered prefix `[AM-N]` in commit body for cross-reference.
- **Each PR carries a `@internal` JSDoc audit** for any Rails-private helpers it touches.

---

## Dependency graph

```
P1  LazyAttributeHash defaults  ──┬─► P2  Attribute lifecycle (withType/withValueFromUser/Uninitialized)
                                   ├─► P3  attributeTypes fallback type ─┐
                                   └─► P4  AttributeMutationTracker forceChange (live ref)
                                                                          │
P2 ──────────────────────────────────────────────────────────────────────┼─► P24a AttributeSetCoder + jsonCodec ──► P24b yamlCodec (/yaml entry)
                                                                          │
                                                          (P24a needs P3 for fallback-type behavior)

P5  Helpers::Numeric mixin wiring ─┬─► P6  Float NaN + serialize cast
                                    ├─► P7  BigInteger via Integer cast path
                                    └─► P8  Numeric changed? hooks (number_to_non_number / equal_nan)

P9  Errors shape + defaults  ──────► P10 Error message dispatch + fullMessage
                                                              │
                                                              ▼
                                                       P11 Translation impl + ancestors

P12 Mutable helper round-trip + change detection (independent)

(P24a needs P3 in addition to P1+P2 — schema-drift fallback uses the registry's `value` type.)
P13 Time / Date string parsing — Date._parse equivalent (independent)
P14 ImmutableString true:/false: + type() (independent)
P15 Validators: with.ts arity + presence/absence/acceptance/confirmation **options pass-through (independent)
P16 Numericality odd/even via to_i + came_from_user gating (depends on P5)
P17 Length :in range conversion + RESERVED_OPTIONS (independent)
P18 String#changedInPlace nil-on-non-string (independent)
P19 Value#equals precision/scale/limit (independent)
P20 SecurePassword challenge via _was + password_too_long type (independent)
P21 Multiparameter time defaults per-type (independent)
P22 Lint testToKey/testToParam unpersisted-nil + testModelNaming instance↔class (independent)
P23 Railtie: deprecator initializer + auto-i18n_customize_full_message (independent)
P24 AttributeSetCoder pluggable codec (JSON default, YAML opt-in) (depends on P1, P2)
P25 OID layering refactor — drop activemodel uuid/json/array, redirect to AR PG OIDs (independent; touches multiple packages)
```

**Critical-path chain**: P1 → P2 → P24 (attribute object lifecycle correctness).
**Numeric chain**: P5 → {P6, P7, P8, P16}.
**Errors/i18n chain**: P9 → P10 → P11.
**Parallelizable** at any time: P12, P13, P14, P15, P17, P18, P19, P20, P21, P22, P23, P25.

Suggested merge order (one cluster at a time): **P1 → P2 → P3 → P4** (attribute lifecycle); **P5 → P6 → P7 → P8 → P16** (numeric); **P9 → P10 → P11** (errors/i18n); then anything from the parallelizable set; **P24** last; **P25** any time.

---

## PR specifications

### P1 — LazyAttributeHash accepts `defaultAttributes`

**Audit ref**: core §12 (#1).
**Files**:

- Trails: `packages/activemodel/src/attribute-set/builder.ts` (`LazyAttributeHash` constructor + `materialize`).
- Rails: `activemodel/lib/active_model/attribute_set/builder.rb:55-110` (`LazyAttributeHash#initialize` takes `(types, values, additional_types, default_attributes, delegate_hash = {})`).
  **Story**: Add `defaultAttributes: Map<string, Attribute>` as a constructor arg to `LazyAttributeHash`. On lazy materialization (currently in `materialize()` / `assign(name)`), prefer `defaultAttributes.get(name)` over building a fresh `Attribute.uninitialized` when the key is absent from `values`. Update `AttributeSet.Builder#build` to pass through `defaultAttributes` (mirror Rails `builder.rb:32-40`). Update all internal call sites.
  **Tests**: New test file `attribute-set/builder-defaults.test.ts` covering: (a) lazy materialization returns the schema default attribute, (b) values override defaults, (c) absent-from-both returns `Uninitialized`.
  **LOC estimate**: 280 (allowed to exceed 300 if `attribute-registration.ts` ripple is meaningful).
  **Blocks**: P2, P3, P24.

### P2 — `Attribute` lifecycle: `withType`, `withValueFromUser`, `Uninitialized#originalValue`

**Audit ref**: core §8 (#3, #4, #5).
**Files**:

- Trails: `packages/activemodel/src/attribute.ts`.
- Rails: `activemodel/lib/active_model/attribute.rb:73-87` (`with_value_from_user`), `:101-103` (`with_type`), `:230-243` (`Uninitialized`).
  **Story**:

1. `withType(type)`: change to call `withValueFromUser(value).withType(type)` semantics — preserve in-place changes by re-assigning original value through the new type's user-input path. Match Rails `attribute.rb:101-103`.
2. `withValueFromUser(value)`: add `assert_valid_value(value)` call before constructing the new attribute. Match Rails `attribute.rb:73-87`.
3. `Uninitialized#originalValue`: return `UNINITIALIZED_ORIGINAL_VALUE` sentinel (export from `attribute.ts`) instead of `undefined`. Match Rails `attribute.rb:236-241`. AR dirty tracking checks against this sentinel.
   **Tests**: Extend `attribute.test.ts` — `withType` preserves in-place mutations; `withValueFromUser` rejects invalid values via type's `assertValidValue`; `Uninitialized.originalValue === UNINITIALIZED_ORIGINAL_VALUE`.
   **LOC estimate**: 180.
   **Depends on**: P1 (sentinel export ordering; otherwise stand-alone-shippable).
   **Blocks**: P24.

### P3 — `attributeTypes` fallback type for unknown keys

**Audit ref**: core §7 (#11).
**Files**:

- Trails: `packages/activemodel/src/attribute-registration.ts` (`attributeTypes` getter).
- Rails: `activemodel/lib/active_model/attribute_registration.rb:39-45` (`attribute_types`).
  **Story**: When the `_attribute_types` Map lookup misses, return `Type.default_value` (the registry's `"value"` factory) rather than `undefined`. Mirror Rails: `_default_attributes[name]&.type || Type.default_value`. Update `attributeTypes(name: string)` accessor to match.
  **Tests**: `attribute-registration.test.ts` — `attributeTypes("nonexistent")` returns ValueType instance (not undefined / not throw). Add a test for AR-style consumer code that calls `.cast(...)` on the fallback.
  **LOC estimate**: 120.
  **Depends on**: P1.
  **Blocks**: none.

### P4 — `AttributeMutationTracker#forceChange` stores live reference

**Audit ref**: core §6 (#6).
**Files**:

- Trails: `packages/activemodel/src/attribute-mutation-tracker.ts` (`forceChange`, `forcedChanges` Map).
- Rails: `activemodel/lib/active_model/attribute_mutation_tracker.rb:131-138` (`force_change`).
  **Story**: Drop the `structuredClone(value)` in `forceChange`; store the live attribute reference. In-place mutations after `forceChange` then reflect in dirty tracking, matching Rails. Update the `forced_changes` storage to keep the Attribute object identity.
  **Tests**: Extend `attribute-mutation-tracker.test.ts` — mutate an array attribute after `forceChange`, assert the change is observed; assert `originalValue` still returns the snapshotted original.
  **LOC estimate**: 90.
  **Depends on**: P1.
  **Blocks**: none.

### P5 — Wire `Helpers::Numeric` mixin into Integer/Float/Decimal

**Audit ref**: types §18 (#44).
**Files**:

- Trails: `packages/activemodel/src/type/integer.ts`, `type/float.ts`, `type/decimal.ts`, `type/helpers/numeric.ts`.
- Rails: `activemodel/lib/active_model/type/helpers/numeric.rb:7-34` (`cast`/`serialize`/`changed?`); `type/integer.rb:5` (`include Helpers::Numeric`); `type/float.rb:37`; `type/decimal.rb:9`.
  **Story**: Convert `NumericMixin` from a standalone export into an applied mixin. Provide `applyNumericMixin<T extends new (...args: any[]) => Type>(Base): Base` (TS pattern matching how `Mutable` is consumed elsewhere). Apply to `IntegerType`, `FloatType`, `DecimalType`. Mixin provides:
- `cast(value)`: blank-string → null short-circuit; non-numeric string raises (matches Rails `numeric.rb:7-29`).
- `serialize(value)`: calls `cast(value)` (Rails `numeric.rb:23-26`).
- `changed?(oldValue, newValue, rawNewValue)`: delegates to `isNumberToNonNumber` / `isEqualNan` exported from `numeric.ts:57-103` (already present).
  **Tests**: Extend `integer.test.ts`, `float.test.ts`, `decimal.test.ts` — blank-string cast → null; non-numeric raises (or returns null per current trails policy — confirm with current `castNumeric` behavior); `changed?` returns true for `10 → "abc"`; `changed?` returns false for two `NaN`s.
  **LOC estimate**: 240.
  **Depends on**: none.
  **Blocks**: P6, P7, P8, P16.

### P6 — Float `"NaN"` string cast + serialize override

**Audit ref**: types §7 (#39).
**Files**:

- Trails: `packages/activemodel/src/type/float.ts`.
- Rails: `activemodel/lib/active_model/type/float.rb:53-60` (`cast_value` recognizes `"NaN"`).
  **Story**: In `FloatType#castValue`, recognize `"NaN"` (case-sensitive per Rails) and return `Number.NaN`. With P5 in place, `serialize` is now inherited from `Helpers::Numeric` (calls cast) — verify the round-trip `"NaN" → NaN → NaN` instead of `"NaN" → null`.
  **Tests**: `float.test.ts` — `cast("NaN")` returns `NaN`; `serialize("NaN")` returns `NaN`; `cast("nan")` returns `null` (Rails-faithful — only exact `"NaN"`).
  **LOC estimate**: 70.
  **Depends on**: P5.
  **Blocks**: none.

### P7 — BigInteger inherits from Integer

**Audit ref**: types §6 (#38).
**Files**:

- Trails: `packages/activemodel/src/type/big-integer.ts`.
- Rails: `activemodel/lib/active_model/type/big_integer.rb:25-29` (`class BigInteger < Integer`).
  **Story**: Refactor `BigIntegerType` to extend `IntegerType` instead of `Type<bigint>`. Override `maxValue()` to return `Number.POSITIVE_INFINITY`. Override `castValue` to coerce numeric strings/numbers/booleans through `BigInt(...)` only when value would overflow Number.MAX_SAFE_INTEGER; fall back to Integer's `.to_i`-equivalent path otherwise. Drop `serializeCastValue` returning string — return `bigint` (or `number` for in-range values) matching Rails Integer wire format. AR PG adapter consumers will need the bigint path; document as such in PR body.
  **Tests**: `big-integer.test.ts` — plain `{}` casts to `0n` (matching Rails `to_i`); large-string `"99999999999999999999"` casts to bigint; `serialize` returns numeric (no string coercion).
  **LOC estimate**: 200.
  **Depends on**: P5.
  **Blocks**: none.

### P8 — Numeric `changed?` hooks

**Audit ref**: types §18 (#44 second bullet).
**Files**:

- Trails: `packages/activemodel/src/type/value.ts` (`isChanged` virtual hook), `type/helpers/numeric.ts`.
- Rails: `activemodel/lib/active_model/type/helpers/numeric.rb:31-34`.
  **Story**: With P5 mixin in place, expose `isChanged(oldValue, newValue, rawNewValue)` override on the numeric mixin that consults `isNumberToNonNumber` and `isEqualNan`. Wire AR `Attribute#changed?` to call `type.isChanged(...)` (verify dirty.ts respects type-level override).
  **Tests**: dirty tests around `attribute = 10; attribute = "abc"` (Rails: not changed because `"abc".to_i == 0` and `non_numeric_string`); `attribute = NaN; attribute = NaN` (Rails: not changed via `equal_nan`).
  **LOC estimate**: 160.
  **Depends on**: P5.
  **Blocks**: none.

### P9 — Errors shape & defaults parity

**Audit ref**: lifecycle §4 (#14, #15, #16).
**Files**:

- Trails: `packages/activemodel/src/errors.ts`.
- Rails: `activemodel/lib/active_model/errors.rb:215-222` (`delete`), `:268-273` (`messages`), `:277-284` (`details`), `:256-261` (`to_hash(full_messages = false)`).
  **Story**:

1. `delete(attr)`: return `null` when no errors removed (instead of `[]`). Callers can `if (errors.delete(...))` Rails-style.
2. `messages` getter: return a Map-like with default `[]` for missing keys (a frozen empty array singleton). Update return type accordingly.
3. `details` getter: return `Map<string, Array<{error: string, ...opts}>>` instead of `ActiveModelError[]`. Mirror Rails shape exactly.
4. `toHash(fullMessages = false)`: support the boolean param.
5. `added?` / `ofKind?`: when `type` is a string (not symbol — TS uses strings throughout, but the distinction here is "type as enum value vs. type as full message string"), fall back to `messagesFor(attribute).includes(type)` per Rails `errors.rb:372-403`.
   **Tests**: New `errors-shape.test.ts` — round-trip `details` matches Rails fixture shape; `messages.get("missing")` returns frozen `[]`; `delete` returns `null`/error array; `added?("attr", "is bad")` matches via fullMessage path.
   **LOC estimate**: 280.
   **Depends on**: none (errors.ts is leaf-ish).
   **Blocks**: P10.

### P10 — `Error` message dispatch + `fullMessage` formatting

**Audit ref**: lifecycle §5 (#18, #19, #20).
**Files**:

- Trails: `packages/activemodel/src/error.ts`.
- Rails: `activemodel/lib/active_model/error.rb:23-46` (`full_message`), `:65` (symbol message promotion), `:69-73` (`generate_message` options merge), `:136-141` (`message` dispatch).
  **Story**:

1. `message` getter: dispatch on `rawType` shape — string `rawType` → return as-is (no I18n lookup); symbol-shape (or "looks like an i18n key": dotted, or in known type registry) → `generateMessage`. Mirror Rails `error.rb:136-141`. Convention: trails uses string types throughout; treat any `rawType` containing a `%` placeholder or matching a registered i18n type as the "symbol" branch.
2. `generateMessage`: merge `{ object: this.base }` into i18n options so `%{object}` interpolation works.
3. `generateMessage`: if `options.message` is itself a string that matches an i18n key (e.g. `"blank"`), promote to new type — currently only handles `typeof === "string"` literally.
4. `fullMessage`: strip `[\d+]` array notation from attribute name; split on `.` for namespaced i18n lookup. Mirror Rails `error.rb:23-46`.
5. Make `attributesForHash` `protected` (currently public at `error.ts:205`).
   **Tests**: New `error-fullmessage.test.ts` covering: `errors.add("items[0].name", "blank")` → fullMessage strips `[0]`; `%{object}` interpolation populated; nested-namespace i18n key resolution.
   **LOC estimate**: 260.
   **Depends on**: P9 (shared error-shape changes).
   **Blocks**: P11.

### P11 — Translation impl moves to `translation.ts` + ancestor walk

**Audit ref**: lifecycle §9 (#24); also touches §8 (`humanAttributeName` correctness).
**Files**:

- Trails: `packages/activemodel/src/translation.ts`, `packages/activemodel/src/model.ts:1177-1216`.
- Rails: `activemodel/lib/active_model/translation.rb:36-85`.
  **Story**:

1. Move the actual `humanAttributeName(attr, options?)` implementation from `model.ts` into `translation.ts` as an exported `this`-typed function. Re-attach as `Model.humanAttributeName = humanAttributeName` per the trails mixin pattern (CLAUDE.md "Module mixins" section).
2. Implement dotted-attribute support: split on `.`, build namespaced i18n keys, separator `/` for namespace and `.` for the trailing key (Rails `translation.rb:51-67`).
3. Implement `lookupAncestors`: walk `Object.getPrototypeOf(this)` chain collecting classes that have a `modelName` static getter. Replace the current `[this]`-only return.
4. Add `options` support: `:default`, `:raise`, plus passthrough to I18n for interpolation. Honor module-level `raiseOnMissingTranslations` (already present in `translation.ts:21-26`).
   **Tests**: New `translation.test.ts` — dotted attribute (`"address.street"`) resolves via namespaced key; subclass falls back to parent's locale entry via ancestor walk; `raise: true` throws on missing translation.
   **LOC estimate**: 220.
   **Depends on**: P10 (i18n pathway alignment).
   **Blocks**: none.

### P12 — Mutable helper round-trip + change detection

**Audit ref**: types §17 (#43).
**Files**:

- Trails: `packages/activemodel/src/type/helpers/mutable.ts`.
- Rails: `activemodel/lib/active_model/type/helpers/mutable.rb:7-20`.
  **Story**:

1. Add `cast(value)` to `MutableMixin`: returns `this.deserialize(this.serialize(value))` — round-trip ensures cast values are detached from the input reference.
2. Replace `changedInPlace(_, _) → true` with `changedInPlace(rawOldValue, newValue) → rawOldValue !== this.serialize(newValue)`.
3. Convert `MutableMixin` from a plain object spread into a proper subclass-applier so `this.serialize` resolves to the consuming type's serialize method.
   **Tests**: New `mutable.test.ts` (or extend existing) — array attribute round-trips via cast; spurious dirty save no longer triggered when value unchanged; in-place push still detected.
   **LOC estimate**: 140.
   **Depends on**: none.
   **Blocks**: none.

### P13 — Time / Date string parsing parity

**Audit ref**: types §11, §13 (#41).
**Files**:

- Trails: `packages/activemodel/src/type/date.ts`, `type/time.ts`, new `type/helpers/loose-date-parse.ts`.
- Rails: `activemodel/lib/active_model/type/date.rb:57-63`, `type/time.rb:69-83`.
  **Story**: Add `looseDateParse(input: string): { year, month, day, hour, minute, second } | null` to a new helper module. Implementation: layered fallback — (1) try `Temporal.PlainDate.from(input)`; (2) try `Temporal.PlainDateTime.from(input)`; (3) try a regex set covering `"July 4, 2020"`, `"July 4 2020"`, `"4 July 2020"`, `"7/4/2020"`, `"3pm"`, `"3:00 PM"`. Use `@blazetrails/activesupport` `parseDateLike` if available; otherwise add the regex set to the helper. Wire into `DateType#castValue` and `TimeType` string path.
  **Tests**: `date.test.ts`, `time.test.ts` — non-ISO strings return parsed values (not null); document the supported formats in helper JSDoc.
  **LOC estimate**: 280.
  **Depends on**: none.
  **Blocks**: none.

### P14 — ImmutableString `true:`/`false:` + `type()` returns `"string"`

**Audit ref**: types §4 (#36, #37).
**Files**:

- Trails: `packages/activemodel/src/type/immutable-string.ts`, `type/string.ts`.
- Rails: `activemodel/lib/active_model/type/immutable_string.rb:38-55`.
  **Story**:

1. Constructor accepts `{ true: string, false: string, precision?, scale?, limit? }` (camelCase: `trueString` / `falseString` to avoid the JS reserved-word collision; this is the only camelCase-vs-Rails rename in the plan, and is necessary because `true` is a reserved property name in strict mode getters). Default to `"t"` / `"f"`.
2. `castValue(true)` returns `this.trueString`; `false` returns `this.falseString`.
3. `serialize` switches on `Numeric|Symbol|Duration` per Rails `immutable_string.rb:48-55` (Symbol/Duration not relevant to JS — keep `Numeric → String(value)` branch).
4. `type()` returns `"string"` (matching Rails) instead of `"immutable_string"`. Update `StringType` to also return `"string"` (already does — verify).
5. `StringType#toImmutableString()` passes `trueString` / `falseString` through.
   **Tests**: `immutable-string.test.ts` — `new ImmutableStringType({ trueString: "aye", falseString: "nay" }).cast(true)` returns `"aye"`; `type()` returns `"string"`.
   **LOC estimate**: 180.
   **Depends on**: none.
   **Blocks**: none.

### P15 — Validators: `**options` pass-through + `with.ts` arity

**Audit ref**: validations §4-§7, §10 (#30, #31).
**Files**:

- Trails: `packages/activemodel/src/validations/{with,presence,absence,acceptance,confirmation}.ts`.
- Rails: `activemodel/lib/active_model/validations/with.rb:8-16`, `presence.rb:7`, `absence.rb:9`, `acceptance.rb:30-32`, `confirmation.rb:18-20`.
  **Story**:

1. `with.ts`: detect arity via `record[methodName].length`. If 0, call `method.call(record)`; otherwise `method.call(record, attribute)`.
2. Presence/absence/confirmation/acceptance validators: replace `errors.add(attr, type, { message: this.options.message })` with `errors.add(attr, type, { ...this.filteredOptions(value), message: this.options.message })`. Each validator must define a `filteredOptions(value)` that strips its own reserved keys (e.g. acceptance strips `:accept` / `:allowNil`; confirmation strips `:caseSensitive`). Pattern matches Rails `**options.except(...)`.
   **Tests**: For each validator, add a test passing a custom interpolation var (`validates :name, presence: { message: "is %{custom_var}", custom_var: "wrong" }`) and asserting the interpolation lands. Plus zero-arity `with: :myCheck` test.
   **LOC estimate**: 240.
   **Depends on**: none.
   **Blocks**: none.

### P16 — Numericality `odd`/`even` via integer truncation + `cameFromUser` gating

**Audit ref**: validations §15 (#28, #29).
**Files**:

- Trails: `packages/activemodel/src/validations/numericality.ts`.
- Rails: `activemodel/lib/active_model/validations/numericality.rb:51`, `:120-141`.
  **Story**:

1. `odd`/`even` checks at `numericality.ts:206-210`: change `num % 2 === 0` → `Math.trunc(num) % 2 === 0` (mirroring Rails `value.to_i.odd?`). `2.5` then validates as even (Rails-faithful).
2. `prepareValueForValidation` (`numericality.ts:537-567`): consult a new `cameFromUser(attrName)` host method. If host defines it and returns false, prefer cast value over `readAttributeBeforeTypeCast`. If host doesn't define it, current behavior. Add `cameFromUser` to the `RecordWithRawAttribute` interface as optional. AR's `AttributeSet#cameFromUser?` becomes the integration point.
   **Tests**: `numericality.ts` — `2.5` validates as even; numeric attribute set via `writeFromDatabase` (`cameFromUser → false`) validates against cast value, not raw string.
   **LOC estimate**: 160.
   **Depends on**: P5 (numeric mixin shape stable).
   **Blocks**: none.

### P17 — Length `:in` Range + `RESERVED_OPTIONS` strip

**Audit ref**: validations §14 (#27).
**Files**:

- Trails: `packages/activemodel/src/validations/length.ts`.
- Rails: `activemodel/lib/active_model/validations/length.rb:15-27`, `:50-60` (`RESERVED_OPTIONS = [:minimum, :maximum, :within, :is, :tokenizer, :too_short, :too_long]`).
  **Story**:

1. In constructor, convert `:in` / `:within` to `minimum` / `maximum`. Accept `[number, number]` tuple (current trails shape) and a Rails-style `Range`-like object `{ begin, end, excludeEnd? }`. Validate at definition time that one of the constraint keys is present.
2. Add `RESERVED_OPTIONS` const + `filteredOptions(value)` method. Strip reserved keys before `errors.add` so `:minimum` doesn't leak into i18n interpolation.
3. Tighten `checkValidity`: each numeric constraint must be non-negative integer or `Infinity`.
4. Add `validatesSizeOf` alias to `HelperMethods` interface.
   **Tests**: `length.test.ts` — `:in: [3, 10]` and `:in: { begin: 3, end: 10 }` both work; reserved keys do not appear in `errors.first.options`; non-integer constraint throws at definition time.
   **LOC estimate**: 220.
   **Depends on**: none.
   **Blocks**: none.

### P18 — `StringType#changedInPlace` returns false for non-string newValue

**Audit ref**: types §3 (#35).
**Files**:

- Trails: `packages/activemodel/src/type/string.ts`.
- Rails: `activemodel/lib/active_model/type/string.rb:16-20`.
  **Story**: Replace the always-coerce `String(rawOldValue) !== String(newValue)` with a guard returning `false` when `typeof newValue !== "string"`. Mirrors Rails `if new_value.is_a?(::String)` returning nil otherwise.
  **Tests**: `string.test.ts` — assigning `42` to a string-typed attribute that already holds `"42"` does not register as changed-in-place (Rails: nil; cast still produces `"42"` on next write).
  **LOC estimate**: 80.
  **Depends on**: none.
  **Blocks**: none.

### P19 — `ValueType#equals` compares precision/scale/limit

**Audit ref**: types §2 (#34).
**Files**:

- Trails: `packages/activemodel/src/type/value.ts`.
- Rails: `activemodel/lib/active_model/type/value.rb:121-126`.
  **Story**: `equals(other)` returns `this.constructor === other.constructor && this.precision === other.precision && this.scale === other.scale && this.limit === other.limit`. Subclasses with additional metadata override.
  **Tests**: `value.test.ts` — two `IntegerType({ limit: 8 })` are equal; `IntegerType({ limit: 8 })` and `IntegerType({ limit: 4 })` are not equal.
  **LOC estimate**: 90.
  **Depends on**: none.
  **Blocks**: none.

### P20 — SecurePassword challenge via dirty `_was`; `passwordTooLong` type

**Audit ref**: lifecycle §7 (#21, #22).
**Files**:

- Trails: `packages/activemodel/src/secure-password.ts`, `packages/activemodel/src/i18n.ts`.
- Rails: `activemodel/lib/active_model/secure_password.rb:141-154`.
  **Story**:

1. Replace `previousDigestCache` WeakMap with a read of `record.attributeWas(\`${attribute}Digest\`)`(from the dirty mixin). Falls back to current value if dirty tracking isn't loaded (matches Rails`\*\_was`).
2. Change error type emitted at `secure-password.ts:155` from `"too_long"` to `"passwordTooLong"`. Update `i18n.ts:293` key from `password_too_long` to `passwordTooLong` (camelCase consistency).
3. `validatesConfirmationOf`: add `allowBlank: true` (already-present `!== undefined && !== null` is stricter than Rails — replace).
4. Use `isPresent(digest)` (whitespace-aware via activesupport) instead of `!digest`.
   **Tests**: `secure-password.test.ts` — challenge scenario: load record from DB, set new password, set challenge equal to old DB-loaded digest → passes (currently fails because WeakMap was never populated); too-long password → error type is `passwordTooLong`.
   **LOC estimate**: 200.
   **Depends on**: none.
   **Blocks**: none.

### P21 — Multiparameter time per-type defaults

**Audit ref**: types §16 (#42).
**Files**:

- Trails: `packages/activemodel/src/type/helpers/accepts-multiparameter-time.ts`, `type/date.ts`, `type/date-time.ts`, `type/time.ts`.
- Rails: `activemodel/lib/active_model/type/helpers/accepts_multiparameter_time.rb:36-50`.
  **Story**: Convert `AcceptsMultiparameterTime` from a static helper into a per-type-configurable mixin accepting `{ defaults: Record<string, number> }`. Defaults:
- `DateType`: `{}` (year/month/day required).
- `DateTimeType`: `{ "4": 0, "5": 0 }` (hour/min default to 0).
- `TimeType`: `{ "1": 2000, "2": 1, "3": 1, "4": 0, "5": 0 }` (Rails-faithful base date 2000-01-01).
  Apply defaults before the year/month/day null-guard. The Time type then no longer hits the `year === 0` short-circuit at `:71`.
  **Tests**: New `accepts-multiparameter-time-defaults.test.ts` — `TimeType.cast({ "4": 15 })` returns `Time(2000-01-01 15:00:00)` instead of null.
  **LOC estimate**: 200.
  **Depends on**: none.
  **Blocks**: none.

### P22 — Lint test parity

**Audit ref**: lifecycle §13 (#25).
**Files**:

- Trails: `packages/activemodel/src/lint.ts`.
- Rails: `activemodel/lib/active_model/lint.rb:31-105`.
  **Story**:

1. `testToKey`: in addition to current shape check, mutate the model fixture to return `false` from `isPersisted` and assert `toKey()` is `null`. Use a temporary monkey-patch (define a property descriptor) to avoid permanently mutating the input.
2. `testToParam`: same pattern — patch `isPersisted` → false, assert `toParam()` is `null`.
3. `testModelNaming`: assert `model.modelName === model.constructor.modelName` (instance↔class delegation).
4. `testErrorsAref`: keep `get("attribute")` (TS API) but also test the proxy `errors["attribute"]` if present — or document that trails uses `.get`.
   **Tests**: `lint.test.ts` covering each new assertion direction.
   **LOC estimate**: 150.
   **Depends on**: none.
   **Blocks**: none.

### P23 — Railtie: deprecator initializer + auto i18n customize

**Audit ref**: lifecycle §15.
**Files**:

- Trails: `packages/activemodel/src/railtie.ts`.
- Rails: `activemodel/lib/active_model/railtie.rb:12-22`.
  **Story**:

1. Register `"active_model.deprecator"` initializer that wires the AM deprecator into `app.deprecators[:activeModel]` (verify activesupport's deprecator registry shape; mirror Rails initializer name).
2. Auto-register `"active_model.i18n_customize_full_message"` initializer that reads `config.activeModel?.i18nCustomizeFullMessage` and applies to `Error.i18nCustomizeFullMessage`. Currently only the manual `initialize()` path wires it.
3. Introduce a `RailtieConfig.activeModel: { i18nCustomizeFullMessage?: boolean }` shape — keep flat `RailtieConfig` working as a fallback for existing callers.
   **Tests**: `railtie.test.ts` — auto-init applies `i18nCustomizeFullMessage` from config without a manual `Railtie.initialize()` call; deprecator registered.
   **LOC estimate**: 180.
   **Depends on**: none.
   **Blocks**: none.

### P24a — `AttributeSetCoder` with pluggable codec; JSON default

**Audit ref**: core §13 (#2).
**Files**:

- Trails: rename `packages/activemodel/src/attribute-set/yaml-encoder.ts` → `attribute-set/coder.ts`; new `attribute-set/codecs/json.ts`; update `attribute-set.ts` and `index.ts` exports; update `packages/activerecord/src/model-schema.ts:483-484` (rename `yamlEncoder()` SchemaHost helper → `attributeSetCoder()`); update all callers of the old helper name.
- Rails: `activemodel/lib/active_model/attribute_set/yaml_encoder.rb:17-44` (`Psych::Coder` round-trip preserving `Attribute` objects).
  **Story**: Replace the YAML-only encoder with a format-agnostic `AttributeSetCoder` that delegates wire format to an injected codec. Ship JSON in core; YAML lands in P24b.

1. Define the envelope schema:
   ```ts
   interface AttributeSetEnvelope {
     v: 1; // schema version — bump on breaking envelope changes
     types: Record<string, string>; // attr → registry type key
     values: Record<string, unknown>; // attr → raw value
     additionalTypes?: Record<string, string>;
     defaultAttributes?: string[]; // attrs that should resolve to schema default on decode
   }
   ```
2. Define the codec interface:
   ```ts
   interface AttributeSetCodec {
     encode(envelope: AttributeSetEnvelope): string;
     decode(input: string): AttributeSetEnvelope;
   }
   ```
3. `AttributeSetCoder`:
   ```ts
   class AttributeSetCoder {
     constructor(types: TypeRegistry, opts: { codec?: AttributeSetCodec } = {}) {
       this.codec = opts.codec ?? jsonCodec;
     }
     encode(set: AttributeSet): string; // builds envelope, delegates to codec
     decode(input: string): AttributeSet; // codec → envelope → reconstruct Attributes via registry
   }
   ```
4. **Built-in `jsonCodec`** (`attribute-set/codecs/json.ts`): `JSON.stringify` / `JSON.parse`. No external dep. Default for `AttributeSetCoder`. Always exported from main entry.
5. **Reconstruction on decode**: for each `attr` in `envelope.types`, look up the registry factory by the type key, instantiate, then build the `Attribute` via the type's user-input path (uses P2's `withValueFromUser` semantics so cast + assertions run).
6. **Schema-drift policy on decode** (mirrors Rails' implicit Psych behavior — document explicitly in coder.ts JSDoc):
   - **Unknown type key**: fall back to the registry's `value` type (P3 makes this a real fallback, not undefined). Emit a one-time `console.warn` per unknown key per process (gated by an opt-out `silenceDriftWarnings: true` constructor option).
   - **`v` mismatch**: throw `AttributeSetCoderError("envelope version v=N not supported")`. Future major bumps must ship a migrator.
   - **Attr present in envelope but not in current schema**: keep the value on the decoded set as an `additional` attribute (matches AR's behavior for legacy serialized payloads).
   - **Attr present in schema but not in envelope**: resolve via `defaultAttributes` if listed there; otherwise via schema default; otherwise `Uninitialized`.
7. **No backwards compat**: drop the old `YAMLEncoder` export entirely (pre-release; no shim).

**Tests**:

- `attribute-set/coder.test.ts`: round-trip with default `jsonCodec` preserves type identity (via registry lookup); `precision`/`scale`/`limit` survive (relies on P19 `equals`); uninitialized attributes round-trip via `defaultAttributes` (relies on P1); unknown type key falls back to `value` + warns once; `v` mismatch throws; envelope-attr-not-in-schema kept as additional; schema-attr-not-in-envelope resolves to default.
- `attribute-set/codecs/json.test.ts`: stringify/parse contract; envelope shape stability snapshot (regression guard against accidental envelope-shape changes).
- `model-schema.test.ts`: update tests using the renamed `attributeSetCoder()` helper.

**LOC estimate**: 260.
**Depends on**: P1, P2, P3.
**Blocks**: P24b.

### P24b — `yamlCodec` behind `/yaml` entry point + optional peer dep

**Audit ref**: core §13 (#2).
**Files**:

- Trails: new `packages/activemodel/src/attribute-set/codecs/yaml.ts`; update `packages/activemodel/package.json` (`exports` map adds `"./yaml": "./dist/attribute-set/codecs/yaml.js"`; `yaml` moves from `dependencies` → `peerDependencies` with `peerDependenciesMeta.yaml.optional: true`).
- Rails: same as P24a (parity reference for the YAML wire format only — Psych YAML output).
  **Story**: Add the YAML codec as a separately importable module so apps that don't ingest YAML payloads don't pull the `yaml` package into their bundle.

1. `attribute-set/codecs/yaml.ts` exports `yamlCodec: AttributeSetCodec` — `YAML.stringify(envelope)` / `YAML.parse(input)`.
2. Lazy import inside the codec functions (top-level `import YAML from "yaml"` is fine — the entry-point split is what isolates the dep, since Node + bundlers won't load `/yaml` unless explicitly imported).
3. Update `package.json` `exports` map. Verify with `pnpm pack` + `tar -tzf` that `dist/attribute-set/codecs/yaml.js` ships.
4. Move `yaml` from `dependencies` → `peerDependencies` + `peerDependenciesMeta.yaml.optional: true`. Document in the package README that YAML codec users must `pnpm add yaml`.
5. `activesupport` continues to depend on `yaml` directly for `configuration-file.ts` — unchanged. Apps depending on `activesupport` keep `yaml` in their tree transitively, so most existing consumers see no install-time change.

**Tests**:

- `attribute-set/codecs/yaml.test.ts`: same round-trip suite as the JSON codec, run against `yamlCodec`; covers the same drift cases as P24a (unknown type, version mismatch, schema drift) since the drift handling lives in the coder, not the codec.

**LOC estimate**: 140.
**Depends on**: P24a.
**Blocks**: none.

### P25 — OID layering refactor: drop AM `uuid`/`json`/`array`, redirect to AR PG OIDs

**Audit ref**: types appendix.
**Files**:

- Trails: delete `packages/activemodel/src/type/uuid.ts`, `type/json.ts`, `type/array.ts` (and their `.test.ts` siblings). Remove the four `register(...)` calls from `packages/activemodel/src/type/registry.ts:47-54`. Update any AM internal consumers to use `value` type as a fallback or import the AR PG OIDs directly. Verify AR PG OIDs at `packages/activerecord/src/connection-adapters/postgresql/oid/{uuid,jsonb,array}.ts` cover the same surface; backfill any features only present in the AM versions.
- Rails: AR PG OID layout — `activerecord/lib/active_record/connection_adapters/postgresql/oid/{uuid,jsonb,array}.rb`.
  **Story**:

1. Audit current AM consumers of `:uuid`/`:json`/`:array` registry keys (`grep -r '"uuid"\|"json"\|"array"' packages/activemodel`). For each, decide: (a) drop the consumer if AR-only, (b) replace with `:value` if AM-internal, (c) move to AR.
2. Diff AM vs AR PG OID feature parity for uuid/json/array. Backfill any features unique to AM into the AR OIDs.
3. Remove the AM files and registry registrations.
4. Add a registry test asserting `lookup("uuid")` throws on AM-only registry (PG type lookup happens via AR's registry, which is separate).
   **Note**: `value` stays AM-internal (a sane fallback for unknown types). `internal/DateInfinity` sentinels stay AM-internal (Date type uses them; AR PG OID dates depend on them).
   **Tests**: AM registry test for the throw; AR PG OID tests covered elsewhere.
   **LOC estimate**: 250 (mostly deletions).
   **Depends on**: none (but coordinate with any open AR work touching PG OIDs).
   **Blocks**: none.

---

## Deferred / out of scope

- Module split for `Conversion`, `Translation`, `AttributeAssignment` so they can be mixed into non-`Model` hosts standalone (lifecycle §3, §9). Trails uses the `this`-typed function pattern intentionally; further fragmentation has no consumer demand.
- `Validator.kind` Symbol return + `BlockValidator#validateEach` private (cosmetic; no behavior gap).
- `Errors#include?` Symbol normalization (TS uses strings throughout).
- `_assignAttribute` setter discovery refinement (core §4) — current behavior matches Rails for the valid-input set; the divergence is on edge inputs (private setters, data properties) where the right answer isn't obvious for JS.

---

## Tracking

Update `docs/activemodel/README.md` after each cluster lands; strike the table row and link to the merged PR.
