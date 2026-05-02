# ActiveModel — Rails Parity Audit

Date: 2026-05-02 (verified pass — every finding re-checked against current source)
Rails source pin: `scripts/api-compare/.rails-source/activemodel/lib/active_model/`
Trails source: `packages/activemodel/src/`

`api:compare` baseline: **621/625 methods (99.4%)**. Method-name parity is high; this audit catalogs **semantic / behavioral deviations** that `api:compare` cannot detect — i.e. methods that exist on both sides but behave differently.

Headline: ~40 verified deviations across 64 files (down from ~50 after dropping false positives — see each audit's Verification notes). None block users today, but several are silent footguns (cloned-vs-live `forceChange`, dropped i18n interpolation vars, lazy-attribute defaults silently ignored).

## Reports

- [audit-core.md](audit-core.md) — model, api, access, attribute-assignment, attribute-methods, attribute-mutation-tracker, attribute-registration, attribute, attributes, attribute-set, attribute-set/builder, yaml-encoder, forbidden-attributes-protection
- [audit-lifecycle.md](audit-lifecycle.md) — dirty, callbacks, conversion, errors, error, nested-error, secure-password, naming, translation, i18n, serialization, serializers/json, lint, deprecator, railtie
- [audit-types.md](audit-types.md) — type entry, value, string, immutable-string, integer, big-integer, float, decimal, boolean, binary, date, date-time, time, registry, helpers/, serialize-cast-value
- [audit-validations.md](audit-validations.md) — validations, validator, validates, with, presence, absence, acceptance, comparison, comparability, confirmation, format, exclusion, inclusion, length, numericality, clusivity, resolve-value, callbacks, _accessor
- [audit-crosscutting.md](audit-crosscutting.md) — i18n keys, module mixin coverage, inheritance hooks, dispatch wiring, frozen-state, error-class hierarchy, `@internal` compliance, generated-method invalidation

## Critical findings (silent footguns)

These are user-visible behavior gaps, not pure refactors — each is a real bug class likely to bite someone before it's noticed.

| # | Where | Bug | Reference |
|---|-------|-----|-----------|
| 1 | `attribute-set/builder.ts` `LazyAttributeHash` | Constructor takes only `(types, values)`, no `default_attributes`. Schema-level column defaults silently drop on lazy lookup. | core §12 |
| 2 | `attribute-set/yaml-encoder.ts` | TS encode/decode uses `YAML.stringify(set.toHash())` — type metadata is **lost** on round-trip. Rails uses `Psych::Coder` preserving Attribute objects. | core §13 |
| 3 | `attribute.ts` `withType` | Drops in-place changes silently — Rails calls `with_value_from_user(value).with_type(type)` to preserve. | core §8 |
| 4 | `attribute.ts` `withValueFromUser` | Skips `assert_valid_value(value)` — invalid values silently accepted. | core §8 |
| 5 | `attribute.ts` `Uninitialized#originalValue` | Returns `undefined` instead of `UNINITIALIZED_ORIGINAL_VALUE` sentinel — AR dirty tracking checks against this sentinel. | core §8 |
| 6 | `attribute-mutation-tracker.ts` `forceChange` | TS deep-clones; Rails stores live reference. **Inverted behavior** — in-place mutations after `forceChange` reflect in Rails dirty tracking but not TS. | core §6 |
| 7 | `attribute-assignment.ts` | `attributes=` alias missing — `model.attributes = hash` fails. | core §4 |
| 8 | `attribute-assignment.ts` `_assignAttribute` | Setter discovery via `findSetter` misses data properties (writable `value`-only descriptors); finds private setters Rails would skip. | core §4 |
| 9 | `attribute-methods.ts` | No `respond_to?` impl in this file — interface only. Form helpers depending on `respond_to?` semantics break. | core §5 |
| 10 | `attribute-methods.ts` | No `method_missing` (no JS equivalent). Dynamically registered attributes won't get methods unless `defineAttributeMethods` is re-called. | core §5 |
| 11 | `attribute-registration.ts` `attributeTypes` | Unknown-key lookup returns `undefined`; Rails returns `Type.default_value`. AR code relying on usable fallback type breaks. | core §7 |
| 12 | `dirty.ts` `restoreAttributeBang` | Bypasses writer; Rails uses `__send__("#{attr_name}=", ...)`. Behavior gap if writer has side effects. | lifecycle §1 |
| 13 | `dirty.ts` `changesApplied` | Doesn't call `forgetting_assignment` per attribute; uses `snapshotValues()`. Different mechanism. | lifecycle §1 |
| 14 | `errors.ts` `delete` | Returns `[]`; Rails returns `nil` (via `presence`). Truthiness checks diverge. | lifecycle §4 |
| 15 | `errors.ts` `details` | Returns `ActiveModelError[]`; Rails returns `{attr: [{error:, ...}]}`. Different shape entirely. | lifecycle §4 |
| 16 | `errors.ts` `messages` | Missing key returns `undefined`; Rails returns `[]` (frozen default). | lifecycle §4 |
| 17 | `errors.ts` `added?`/`ofKind?` | String-type branch missing — Rails checks `messages_for(...).include?(type)` for non-Symbol types. | lifecycle §4 |
| 18 | `error.ts` `message` | Always calls `generateMessage`; Rails returns String `raw_type` directly without I18n lookup. Extra (silent) lookup in TS. | lifecycle §5 |
| 19 | `error.ts` `generateMessage` | Missing `object: base` in i18n options — `%{object}` interpolation broken. | lifecycle §5 |
| 20 | `error.ts` `fullMessage` | Missing `[\d+]` array notation strip + dotted-namespace split. Nested/array attrs misformatted. | lifecycle §5 |
| 21 | `secure-password.ts` | Adds error type `"too_long"`; locale entry is `password_too_long` — **i18n key never resolves**. | lifecycle §7, crosscutting §1 |
| 22 | `secure-password.ts` | Challenge validation uses `WeakMap` cache vs Rails `_was`/dirty tracking — diverges in pre-load / re-set scenarios. | lifecycle §7 |
| 23 | `naming.ts` `modelNameFromRecordOrClass` | Doesn't call `.toModel()` first — proxies/decorators delegating `modelName` via `to_model` won't resolve. | lifecycle §8 |
| 24 | `translation.ts` | No real `humanAttributeName` impl — interface only. Hosts mixing `Translation` alone get nothing. | lifecycle §9 |
| 25 | `lint.ts` | Several test directions inverted vs Rails (`testToKey`, `testToParam` don't test the unpersisted case). | lifecycle §13 |
| 26 | ~~`validations.ts` strict path~~ | ~~unwired~~ — **FALSE POSITIVE removed** (verified: thrown at `model.ts:540` via the `isStrict` callback registered by `validates(..., { strict: true })`). | crosscutting §6 |
| 27 | `length.ts` | `:in` Range not converted in constructor; reserved options leak into i18n; no constraint-value validation. | validations §14 |
| 28 | `numericality.ts` | `odd`/`even` applied to float, not `.to_i`. `2.5 % 2 !== 0` → TS reports odd; Rails: `2.5.to_i.even?` → even. | validations §15 |
| 29 | `numericality.ts` | `came_from_user?` ignored — TS always reads `before_type_cast`; Rails uses cast value when value didn't come from user. | validations §15 |
| 30 | `presence`/`absence`/`confirmation`/`acceptance` | `errors.add` receives only `{message}` — drops `**options` (custom interpolation vars lost). | validations §5-7,10 |
| 31 | `with.ts` | Always calls `method.call(record, attribute)` — zero-arity user methods get unexpected argument. | validations §4 |
| 32 | `comparison.ts` | Manual type dispatch; custom comparable objects without explicit type support don't work. Rails uses `value.public_send(<op>, option_value)`. | validations §8 |
| 33 | `clusivity.ts` | `inclusionMethod` always returns `"include?"` — no native Range; numeric Range membership is O(n) instead of O(1). | validations §16 |
| 34 | `value.ts` `equals` | Only compares `this.constructor` — ignores `precision`, `scale`, `limit`. Two types with different limits compare equal. | types §2 |
| 35 | `string.ts` `changedInPlace` | Always coerces non-string with `String()`; Rails returns `nil` for non-string `new_value`. Spurious change detection. | types §3 |
| 36 | `immutable-string.ts` | Constructor missing `true:`/`false:` keyword args (custom boolean strings) — feature entirely absent. | types §4 |
| 37 | `immutable-string.ts` `type()` | Returns `"immutable_string"`; Rails returns `:string`. Schema-based lookups break. | types §4 |
| 38 | `big-integer.ts` | Subclasses `Type<bigint>` (not Integer); `serialize_cast_value` returns string vs Rails Integer. Different cast path + wire format. | types §6 |
| 39 | `float.ts` | `"NaN"` string returns `null`; Rails returns `Float::NAN`. No `serialize` override (skips cast-on-serialize). | types §7 |
| 40 | `binary.ts` | `cast` returns `Uint8Array`; Rails returns String wrapped in `Data` class. AR adapters depending on `Data` would break. | types §10 |
| 41 | `date.ts` / `time.ts` | Use `Temporal.from` (ISO 8601 only); Rails uses `Date._parse` (accepts "July 4, 2020", "3pm"). Non-ISO strings return null. | types §11, §13 |
| 42 | `helpers/accepts-multiparameter-time.ts` | Hardcoded defaults — Time type's `year=2000, month=1, day=1` not applied; TS uses `year=0` which trips the null guard. | types §16 |
| 43 | `helpers/mutable.ts` | `cast` doesn't round-trip (Rails: `deserialize(serialize(value))`); `changed_in_place?` always returns `true` → spurious dirty saves. | types §17 |
| 44 | `helpers/numeric.ts` | Mixin **disconnected** — exports standalone fns, not used by `IntegerType`/`FloatType`. `changed?` numeric-specific override absent. | types §18 |
| 45 | `helpers/time-value.ts` `serializeTimeValue` | Doesn't apply `seconds_precision` truncation. | types §19 |

## Notable but lower-priority

- `i18n` key coverage: **complete** — all 25 Rails en.yml keys present. (crosscutting §1)
- Module mixin coverage: **complete** — every Rails module composed into `Model`. (crosscutting §2)
- Inheritance hooks: copy-on-first-write correctly implemented for `_validators`, `_attributeDefinitions`, `_callbackChain`. Documented narrow edge cases. (crosscutting §3)
- Dispatch wiring: present and equivalent (two-level callback design vs Rails single-level). (crosscutting §4)
- Frozen-state: minor — `Model#freeze()` doesn't call `_attributes.freeze()` so writes throw native `TypeError` instead of typed `FrozenError`. (crosscutting §5)
- Error class hierarchy: all six Rails errors present and exported. `RangeError` → `ActiveModelRangeError` rename. (crosscutting §6)
- `@internal` JSDoc: spot-checked — no uncovered Rails-private methods. (crosscutting §7)
- Generated method invalidation: correct cycle, marker-based deletion, own-property guards. (crosscutting §8)

## Suggested triage

Critical (silent data corruption / wrong I18n / dropped behavior): **#1, #2, #3, #4, #6, #11, #18-21, #27-29, #34, #36, #43, #44**.

Notable (API surface gaps users will hit): **#7, #9, #10, #14-17, #23, #24, #30, #31, #36, #38**.

Cosmetic / format-only: rest. Fold into next privates pass or open as targeted PRs (≤300 LOC each per CLAUDE.md).
