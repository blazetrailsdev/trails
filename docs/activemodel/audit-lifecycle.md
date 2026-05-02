# ActiveModel Lifecycle/Errors/Naming/Serialization Audit

Date: 2026-05-02 (verified pass)
Scope: dirty, callbacks, conversion, errors, error, nested-error, secure-password, naming, translation, i18n, serialization, serializers/json, lint, deprecator, railtie.

Trails source: `packages/activemodel/src/`
Rails source: `scripts/api-compare/.rails-source/activemodel/lib/active_model/`

All findings below were re-verified against current source. False positives from the prior pass are listed in **Verification notes** at the bottom.

---

## 1. `dirty.ts` → `dirty.rb`

**Critical**

- **`restoreAttributeBang` bypasses writer.** Rails `dirty.rb:414-419` restores via `__send__("#{attr_name}=", ...)` — invokes writer (callbacks/casts). TS `dirty.ts:336-340` calls `attributes.set(name, original)` directly. Behavior gap if writer has side effects.
- **`changesApplied` does not call `forgetting_assignment` per attribute.** Rails `dirty.rb:272-279` calls `@attributes.map(&:forgetting_assignment)`, rebinding each Attribute's `@original_attribute` to current cast value. TS `dirty.ts:173-185` snapshots via `snapshotValues()` — different mechanism (observable equivalence likely but not identical for in-place-mutated values).

**Notable**

- **`clearChangesInformation` mechanism.** Rails `dirty.rb:326-329` sets `@mutations_before_last_save = nil` (returns to NullMutationTracker). TS `dirty.ts:195-198` clears in place. Observable behavior matches; mechanism differs.
- **`asJson` filtering.** Rails `dirty.rb:264-266` overrides `as_json` to exclude `mutations_from_database` / `mutations_before_last_save`. TS `dirty.ts:304-306` returns `this.changes` with no explicit filter override.
- **No `ForcedMutationTracker` / `NullMutationTracker` lazy chooser.** Rails `dirty.rb:382-396` chooses tracker lazily based on `@attributes` presence. TS uses single `DirtyTracker`. Edge cases for plain models without AttributeSet may diverge.

---

## 2. `callbacks.ts` → `callbacks.rb`

**Notable**

- **`skip_after_callbacks_if_terminated` not propagated.** Rails `callbacks.rb:112` passes this option into `define_callbacks`. TS `callbacks.ts:42-98` accepts only `only:`. The trails CallbackChain does halt-check in `runCallbacks`, so observable behavior is similar but the toggle is not configurable per-model.
- **Other `define_callbacks` options not forwarded.** `scope`, etc. silently dropped.
- **No block argument support.** Rails `set_callback` accepts `&block`. TS `callbacks.ts:113-168` accepts only `CallbackFn | CallbackObject`.
- **`assertValidKeys` partial.** TS validates outer `DefineModelCallbacksOptions` (`callbacks.ts:60-64`) but not the per-registration `CallbackConditions` keys at register time.

---

## 3. `conversion.ts` → `conversion.rb`

**Notable**

- **Module structurally split.** Rails `Conversion` module includes `to_model`, `to_key`, `to_param`, `to_partial_path`. TS `conversion.ts` only exports `_toPartialPath`; instance methods live on `Model`. Hosts mixing `Conversion` alone won't get the instance methods.

---

## 4. `errors.ts` → `errors.rb`

**Notable**

- **`delete` return type differs.** Rails `errors.rb:215-222` returns `nil` if empty (via `presence`). TS `errors.ts:205-210` returns `[]`. Callers checking truthiness will diverge.
- **`details` shape differs.** Rails `errors.rb:277-284` returns `{ attr => [{ error: :type, ...opts }] }`. TS `errors.ts:166-168` returns `ActiveModelError[]`. Different shape entirely.
- **`messages` default value.** Rails `errors.rb:268-273` sets `hash.default = EMPTY_ARRAY` and freezes it — accessing missing key returns `[]`. TS `errors.ts:293-295` returns plain hash; missing key returns `undefined`.
- **`toHash` doesn't accept `full_messages` boolean.** Rails `errors.rb:256-261` supports `to_hash(true)` for full messages. TS has no such param.
- **`added?` / `ofKind?` string-type branch missing.** Rails (`errors.rb:372-382`, `:395-403`): non-Symbol `type` checks `messages_for(attribute).include?(type)`. TS (`errors.ts:182-198`) always compares `error.type`. String-type lookups will diverge.

---

## 5. `error.ts` → `error.rb`

**Notable**

- **`message` dispatch ignores Symbol-vs-String distinction.** Rails `error.rb:136-141`: Symbol `raw_type` → `generate_message`; String `raw_type` → returned as message directly. TS `error.ts:107-117` always calls `generateMessage`. String-type `add(:name, "is bad")` triggers an extra (silent) I18n lookup in TS.
- **`generateMessage` missing `object: base` in i18n options.** Rails `error.rb:69-73` merges `{ object: base }`. TS `error.ts:292-296` does not — `%{object}` interpolation broken.
- **`generateMessage` doesn't promote symbol `message:` option.** Rails `error.rb:65` treats symbol message as new i18n type. TS `error.ts:280-282` only handles `typeof === "string"`.
- **`fullMessage` missing `[\d+]` array notation strip + dotted-namespace split.** Rails `error.rb:23-46` strips array notation, splits on `.` for namespaced i18n. TS `error.ts:228-272` does neither — nested/array attrs misformatted.
- **`attributesForHash` visibility.** Rails: `protected`. TS `error.ts:205`: public.

---

## 6. `nested-error.ts` → `nested_error.rb`

No deviations found. `dupWithBase` is an additive TS-only extension.

---

## 7. `secure-password.ts` → `secure_password.rb`

**Critical**

- **Challenge validation: WeakMap cache vs `_was`.** Rails `secure_password.rb:141-147` reads `attribute_digest_was` from dirty tracking. TS `secure-password.ts:167-175` uses `previousDigestCache` WeakMap populated in setter. Diverges in pre-load / re-set / dup scenarios where dirty `_was` is authoritative but the WeakMap was never populated.
- **`:password_too_long` error type mismatch.** Rails `secure_password.rb:152-154`: `:password_too_long`. TS `secure-password.ts:155`: `"too_long"`. Locale entry in `i18n.ts:293` is `password_too_long`; the TS code emits the wrong type, so the dedicated locale entry never resolves and the generic length message is used instead.
- **Blank-password digest check.** Rails uses `present?` (whitespace-aware). TS uses `!digest` (falsy). Empty/whitespace digests diverge.

**Notable**

- **`validatesConfirmationOf` `allow_blank: true` missing.** Rails `secure_password.rb:158` passes `allow_blank: true`. TS checks `!== undefined && !== null` instead.
- **`resetToken` is a no-op accepted option.** Rails `secure_password.rb:162-179` wires it to `generates_token_for`. TS `secure-password.ts:44-58` accepts but does nothing.

---

## 8. `naming.ts` → `naming.rb`

**Notable**

- **`i18nKey` is `string` not Symbol.** Internally consistent (i18n.ts uses strings) but diverges from Rails `naming.rb:180`.
- **`Name#human` accepts no options.** Rails `naming.rb:197-207` supports `:default` / `count: 1`. TS `naming.ts:362-379` (getter) takes none.
- **`modelNameFromRecordOrClass` doesn't call `toModel()`.** Rails `naming.rb:342-349` calls `record_or_class.to_model` first. TS `naming.ts:34-38` skips it — proxies/decorators that delegate `modelName` via `to_model` won't resolve.
- **`uncountable?` not on `ModelName` instances.** Rails `naming.rb:209-211` exposes it as instance method. TS only on `Naming` namespace (`naming.ts:48`).

---

## 9. `translation.ts` → `translation.rb`

**Critical**

- **`translation.ts` is interface-only.** No `humanAttributeName` / `lookupAncestors` / `i18nScope` impl in this file (just a `TranslationClassMethods` interface). The actual impl lives on `Model` at `model.ts:1177-1216`. Hosts mixing `Translation` alone get nothing — only `Model` subclasses do.
- **`humanAttributeName` missing dotted-attribute support.** Rails `translation.rb:51-67` splits on `.`, builds namespaced i18n keys, supports nested attribute lookup. TS `model.ts:1177-1196` treats the attribute as opaque.
- **`humanAttributeName` ignores `options` (no `:default` / `:raise` / interpolation forwarding).** Rails `translation.rb:74-80` supports `raise:` plus `Translation.raise_on_missing_translations` global. TS takes only `(attr: string)`.
- **`lookupAncestors` returns only `[this]`.** Rails `translation.rb:36-38` walks the class ancestor chain. TS `model.ts:1214-1216` does not — subclass humanization can't fall back to parent locale entries.

---

## 10. `i18n.ts` (no Rails counterpart)

Rails uses the `i18n` gem; trails defines a local registry. The only finding here is the cross-reference in §7: `i18n.ts:293` defines `password_too_long: "is too long"` but `secure-password.ts:155` adds error type `"too_long"`, so the dedicated entry never matches.

---

## 11. `serialization.ts` → `serialization.rb`

**Notable**

- **`serializableAddIncludes` resolves from preload cache only.** Rails `serialization.rb:192-195` uses `send(association)`. TS reads `_preloadedAssociations` / `_cachedAssociations` only. Method-defined associations not yet in the cache are silently omitted.
- **`methods` option function-vs-property check.** TS `serialization.ts:81-89` checks `typeof === "function"` first then falls through to property access. Rails `serialization.rb:138` always uses `send`. Equivalent in most cases; corner-case difference for accessor methods that shadow attributes.

---

## 12. `serializers/json.ts` → `serializers/json.rb`

No deviations found.

---

## 13. `lint.ts` → `lint.rb`

**Notable**

- **`testToKey` direction inverted.** Rails `lint.rb:31-35` patches `persisted? = false` and asserts `to_key.nil?`. TS `lint.ts:44-57` only asserts `null`-or-array shape and asserts non-null when persisted — never tests the unpersisted-nil case.
- **`testToParam` doesn't patch `persisted?`.** Rails `lint.rb:46-51` patches model and asserts `to_param.nil?` when unpersisted. TS only checks return type.
- **`testModelNaming` doesn't check instance↔class delegation.** Rails `lint.rb:89-91` asserts `model.model_name == model.class.model_name`. TS only checks class-level shape.
- **`testErrorsAref` uses `get("attribute")`.** Rails uses `errors[:hello]`. TS `Errors` exposes `get(...)` instead of `[]`.

---

## 14. `deprecator.ts` → `deprecator.rb`

**Cosmetic**

- TS adds `gemVersion()` / `version()` returning `"8.0.0"` — extra methods belonging in Rails to `gem_version.rb` / `version.rb`. No behavior gap in this file.

---

## 15. `railtie.ts` → `railtie.rb`

**Notable**

- **Deprecator initializer missing.** Rails `railtie.rb:12-14` registers `"active_model.deprecator"`. TS has no equivalent.
- **`config.active_model` `OrderedOptions` not implemented.** Rails `railtie.rb:10`. TS uses direct `RailtieConfig`. Code reading `config.active_model.i18n_customize_full_message` from a generic config store won't find it.
- **`i18nCustomizeFullMessage` only wired in manual `initialize()` call.** Auto-registered initializer at `railtie.ts:25-27` only sets `minCost`; the i18n flag never auto-applies — users must call `Railtie.initialize({ i18nCustomizeFullMessage: true })` explicitly.

---

## Verification notes — false positives dropped from prior pass

- §1 dirty: "`@internal` JSDoc missing on `mutationsFromDatabase` / `mutationsBeforeLastSave`" — both have `@internal` (`dirty.ts:213`, `:225`).
- §2 callbacks: "`skip_after_callbacks_if_terminated` not implemented" demoted from Critical to Notable — `runCallbacks` does halt-check beforeResult; the gap is that the option isn't configurable per `defineModelCallbacks` call.
- §3 conversion: "`paramDelimiter` class attribute missing" — present at `model.ts:96` (`static paramDelimiter: string = "-"`), used in `toParam` at `:2108-2114`.
- §3 conversion: "Missing `@internal` on `_toPartialPath`" — present in current source.
- §4 errors: "`include?` symbol normalization absent" dropped — TS uses strings throughout; not a real divergence.
