# ActiveModel Cross-Cutting Audit

Date: 2026-05-02 (verified pass)
Scope: i18n keys, module mixin coverage, inheritance hooks, dispatch wiring, frozen-state propagation, error class hierarchy, `@internal` JSDoc compliance, generated-method invalidation.

Trails source: `packages/activemodel/src/`
Rails source: `scripts/api-compare/.rails-source/activemodel/lib/active_model/`

---

## 1. i18n / Locale

All 25 keys from Rails `locale/en.yml` are present in `i18n.ts:259-296`.

| Rails key                                         | Trails line | Notes                                                                        |
| ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `errors.format`                                   | 301         | via `defaultEnTranslations`                                                  |
| `errors.messages.model_invalid`                   | 295         | match                                                                        |
| `errors.messages.inclusion`                       | 285         | match                                                                        |
| `errors.messages.exclusion`                       | 286         | match                                                                        |
| `errors.messages.invalid`                         | 260         | match                                                                        |
| `errors.messages.confirmation`                    | 288         | match                                                                        |
| `errors.messages.accepted`                        | 289         | match                                                                        |
| `errors.messages.empty`                           | 290         | match                                                                        |
| `errors.messages.blank`                           | 261         | match                                                                        |
| `errors.messages.present`                         | 262         | match                                                                        |
| `errors.messages.too_long` (one/other)            | 267-270     | match                                                                        |
| `errors.messages.password_too_long`               | 293         | match (cross-ref: secure-password emits wrong type — see lifecycle audit §7) |
| `errors.messages.too_short`                       | 263-266     | match                                                                        |
| `errors.messages.wrong_length`                    | 271-274     | match                                                                        |
| `errors.messages.not_a_number` / `not_an_integer` | 275-276     | match                                                                        |
| `errors.messages.greater_than(_or_equal_to)`      | 277-278     | match                                                                        |
| `errors.messages.equal_to`                        | 281         | match                                                                        |
| `errors.messages.less_than(_or_equal_to)`         | 279-280     | match                                                                        |
| `errors.messages.other_than`                      | 282         | match                                                                        |
| `errors.messages.in`                              | 283         | match                                                                        |
| `errors.messages.odd` / `even`                    | 284-285     | match                                                                        |

Trails extras (additive, not in Rails en.yml): `taken` (287), `not_a_date` (291), `required` (292) — AR-compatible additions.

**No missing keys.**

---

## 2. Module Mixin Coverage

Rails `include`/`extend` is unavailable in TS. Trails uses `this`-typed functions assigned as static methods on `Model`.

| Rails module              | Trails equivalent                                                         | Status                                                              |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `AttributeAssignment`     | `_assignAttributes` (model.ts:2077), `_assignAttribute` (:2083)           | Present                                                             |
| `Validations`             | `isValid`, `validate`, `validateBang`, `validatesWith`, `_validators` Map | Present                                                             |
| `Conversion`              | `_toPartialPath`, `toParam`, `toKey`, `toModel`                           | Present                                                             |
| `Naming`                  | `ModelName`, `modelName` static                                           | Present                                                             |
| `Translation`             | `humanAttributeName`                                                      | Present (impl in model.ts; see lifecycle §9 for translation.ts gap) |
| `Callbacks` + `:validate` | `CallbackChain`, `defineModelCallbacks`, `_ensureOwnCallbacks` (:956)     | Present                                                             |
| `Access`                  | `slice`, `valuesAt`                                                       | Present                                                             |
| `AttributeMethods`        | full surface                                                              | Present                                                             |
| `Dirty`                   | `DirtyTracker` via `_dirty` field                                         | Present                                                             |
| `Serialization`           | `serializableHash`, `toJson`                                              | Present                                                             |

**No missing modules.**

---

## 3. Inheritance Hooks

Rails uses `inherited` (via `ActiveSupport::DescendantsTracker`) to eagerly copy `_validators`, `_attribute_definitions`, callback chains. JS has no equivalent. Trails uses copy-on-first-write.

- **`_attributeDefinitions` / `_pendingAttributeModifications`:** `attribute-registration.ts:110-116` `registerWithSuperclass` lazy on first `_defaultAttributes()`. Documented divergence window in `model.ts:107-128` — narrow; common `static { this.attribute(...) }` pattern hits at class-definition time.
- **`_validators`:** `_ensureOwnValidators` copy-on-first-write. Same documented narrow window.
- **`_callbackChain`:** `_ensureOwnCallbacks()` (model.ts:956-960) clones parent `CallbackChain` on first write. `hasOwnProperty`-guarded.

**No actionable gaps.** All three registries correctly implement copy-on-first-write.

---

## 4. Dispatch Wiring

| Rails                                  | Trails                                                                       | File                              |
| -------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `run_validations!`                     | `runValidationsBang()`                                                       | model.ts:1501, validations.ts:312 |
| `_run_validate_callbacks` (full chain) | `_runValidateCallbacks()` (before only) + outer `runCallbacks("validation")` | model.ts:1555-1558, :1525         |
| `_assign_attributes`                   | `_assignAttributes()`                                                        | model.ts:2077                     |
| `_write_attribute`                     | `_writeAttribute()`                                                          | model.ts:1380                     |

Two-level design: outer `runCallbacks("validation")` wraps `runValidationsBang` which calls `_runValidateCallbacks` (before) — equivalent observable behavior to Rails' single-level chain. Naming is slightly confusing but functionally correct.

**No missing dispatch wiring.**

---

## 5. Frozen-State Propagation

- **`attribute-set.ts`:** `freeze()` (`:23-26`) sets `_frozen=true`; `assertNotFrozen()` (`:33-38`) guards `set` (`:63`), `writeFromUser` (`:91`), `writeFromDatabase` (`:103`), `writeCastValue` (`:113`), `reset` (`:184`), `forcedChange` (`:282`). Thorough.
- **`attribute-mutation-tracker.ts`:** No own freeze guard but holds reference to `AttributeSet`. Mutation paths flow through the set, which guards.
- **`dirty.ts`:** No `isFrozen()` check before recording. `_dirty` is frozen via `Object.freeze(this)` in `Model#freeze()` — native `TypeError` on subsequent writes.
- **`model.ts` `freeze()` (`:1599-1608`):** Pre-materializes errors + `contextForValidation()` (matching Rails `validations.rb:372-377`), then `Object.freeze(this)`. **Does not call `this._attributes.freeze()`**.

**Minor gap:** Frozen-Model writes that reach `AttributeSet` throw native `TypeError` instead of the typed `FrozenError` from `assertNotFrozen()`. Behavior correct (write throws); error type differs.

---

## 6. Error Class Hierarchy

| Rails                      | Trails                     | Export      | Source                               |
| -------------------------- | -------------------------- | ----------- | ------------------------------------ |
| `ValidationError`          | `ValidationError`          | index.ts:11 | validations.ts:141                   |
| `MissingAttributeError`    | `MissingAttributeError`    | index.ts:18 | attribute-methods.ts:29              |
| `UnknownAttributeError`    | `UnknownAttributeError`    | index.ts:7  | errors.ts                            |
| `ForbiddenAttributesError` | `ForbiddenAttributesError` | index.ts:19 | forbidden-attributes-protection.ts:6 |
| `StrictValidationFailed`   | `StrictValidationFailed`   | index.ts:6  | errors.ts                            |
| `RangeError`               | `ActiveModelRangeError`    | index.ts:8  | errors.ts                            |

All six present and exported. `ActiveModelRangeError` rename avoids clobbering global `RangeError` — reasonable TS choice.

**Strict path verified wired:** `StrictValidationFailed` is thrown at `model.ts:540` by the `isStrict` callback registered by `validates(..., { strict: true })` (`model.ts:528-543`). The earlier audit claim that the strict path was unwired was a false positive.

**No missing error classes.**

---

## 7. `@internal` JSDoc Compliance

Spot-checked `attribute-registration.ts`, `attribute-methods.ts`, `validations.ts`, `dirty.ts`, `model.ts` (27 `@internal` tags), `attribute-set.ts`. Every Rails-private helper checked carries `@internal`.

**No uncovered Rails-private methods found in spot-checks.** ESLint rule `blazetrails/rails-private-jsdoc` provides ongoing enforcement.

---

## 8. Generated Method Invalidation

`attribute-methods.ts`:

- **`undefineAttributeMethods` (`:214-235`):** Iterates `_generatedMethods`, deletes from `prototype` only if marked `__generatedAttributeMethod` (preserves manual defs of same name). Clears `_generatedMethods`. Clears `_attributeMethodPatternsCache` only if own property (avoids clearing parent's cache via prototype lookup).
- **`defineAttributeMethods` (`:237-248`):** Per-name `defineAttributeMethod`, then generates alias methods.
- **Invalidation cycle:** `attributeMethodPrefix/Suffix/Affix` (`:158-186`) call `undefineAttributeMethods` then `defineAttributeMethods` after pushing the new pattern — matches Rails' `undefine_attribute_methods` → `define_attribute_methods` cycle exactly.
- **Pattern cache:** cleared in `undefineAttributeMethods` (`:230`), populated lazily in `attributeMethodPatternsMatching` (`:380`).
- **`defineAttributeMethodPattern` (`:258-277`):** Guards against overwriting non-generated methods unless `override: true`. Marks generated fns with `__generatedAttributeMethod = true`.

**No deviations.** The invalidation cycle is correctly implemented at every registration site.
