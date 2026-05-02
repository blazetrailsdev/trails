# ActiveModel Validations Audit

Date: 2026-05-02 (verified pass)
Scope: validations, validator, validates, with, presence, absence, acceptance, comparison, comparability, confirmation, format, exclusion, inclusion, length, numericality, clusivity, resolve-value, callbacks, \_accessor.

Trails source: `packages/activemodel/src/`
Rails source: `scripts/api-compare/.rails-source/activemodel/lib/active_model/`

All findings re-verified against current source. False positives from the prior pass are listed in **Verification notes** at the bottom.

---

## 1. `validations.ts` vs `validations.rb`

**Notable**

- `initialize_dup` not implemented. Rails `validations.rb:311` nils `@errors` on dup; duped models share `Errors` until next validate cycle.
- `freeze` not implemented in this file. Rails `validations.rb:372-377` materializes errors + `context_for_validation` before freezing. (Trails has a `freeze()` impl in `model.ts:1599-1608` doing the same — see crosscutting §5.)
- `read_attribute_for_validation` not declared on `Validations` interface. Lives only on `EachValidator` (`validator.ts:97-105`).
- `ValidationsClassMethods.validates` interface omits `validates_each` (Rails `validations.rb:88` first-class).
- `VALID_OPTIONS_FOR_VALIDATE` constant not exported.

---

## 2. `validator.ts` vs `validator.rb`

**Notable**

- `Validator.kind` returns `string` (`validator.ts:58-60`); Rails returns `Symbol|nil` (`validator.rb:104`); no anonymous-validator nil path.
- `EachValidator` constructor doesn't mutate the passed `options` object; Rails `EachValidator#initialize` (`validator.rb:141`) deletes `:attributes` in-place. Visible-effect equivalence; user-passed hash retention differs.
- TS exposes both `checkValidity()` and `checkValidityBang()` (`validator.ts:137-143`); Rails only `check_validity!`. Bang variant is a thin delegate.
- `BlockValidator#validateEach` is public in TS (`validator.ts:162`); Rails private (`validator.rb:186`).

---

## 3. `validates` (inlined in `validations.ts`) vs `validates.rb`

**Critical**

- **`_parseValidatesOptions` Range routing.** Rails routes both `Range` and `Array` to `{in:}`. TS only `Array` (`validations.ts:381-388`); range-like input misrouted to `{with:}`.

**Notable**

- `_validatesDefaultKeys` returns string keys with camelCase (`"allowBlank"`, `"allowNil"`, `"exceptOn"`) (`validations.ts:365`); Rails returns symbols (`:allow_blank`, etc.). Validators must consume camelCase consistently — already a project convention.

---

## 4. `validations/with.ts` vs `validations/with.rb`

**Notable**

- **Zero-arity user methods get unexpected argument.** Rails `with.rb:8-16` checks `record.method(method_name).arity == 0` and calls without args; >0 passes attribute. TS `with.ts:15-23` always calls `method.call(record, attribute)`.
- TS `checkValidity` (`with.ts:5-13`) raises if `:with` absent; Rails defers to runtime `NoMethodError`. Different error class/timing.
- `ClassMethods#validates_with` (instance + class) only partially ported — `WithValidator` here, instance method assumed in `Model`.

---

## 5. `validations/presence.ts` vs `validations/presence.rb`

**Notable**

- **Custom interpolation vars dropped.** Rails `presence.rb:7` passes `**options` to `errors.add`. TS `presence.ts:7-9` passes only `{ message: this.options.message }`.

---

## 6. `validations/absence.ts` vs `validations/absence.rb`

**Notable**

- Same `**options`-vs-`{message}` issue as presence (`absence.ts:26-29`).
- Uses `!isBlank(value)`; equivalent to Rails `present?` only if activesupport `isBlank` mirrors Rails exactly.

---

## 7. `validations/acceptance.ts` vs `validations/acceptance.rb`

**Notable**

- **Custom interpolation vars lost on `errors.add`.** Rails strips `:accept` and `:allow_nil` via `**options.except(:accept, :allow_nil)`. TS passes only `{ message }`.
- `LazilyDefineAttributes` uses Mutex in Rails; TS skips (JS single-threaded — acceptable).
- `allowNil: true` default lives in inline `?? true` rather than constructor merge — accidentally equivalent.

---

## 8. `validations/comparison.ts` vs `validations/comparison.rb`

**Notable**

- **Custom comparable objects without explicit type support don't work.** Rails `comparison.rb:27` calls `value.public_send(COMPARE_CHECKS[option], option_value)` — uses Ruby's polymorphic `<=>`/operators. TS `compare` (`comparison.ts:32-56`) manually dispatches by type.
- Error key uses snake_case string in TS (`"greater_than"` etc.) matching Rails error key format.

---

## 9. `validations/comparability.ts` vs `validations/comparability.rb`

No deviations found.

---

## 10. `validations/confirmation.ts` vs `validations/confirmation.rb`

**Notable**

- Rails reads via `record.public_send("#{attribute}_confirmation")` — raises `NoMethodError` if missing. TS uses `record.readAttribute?.(...)?.[name] ?? record[name]` — silent `undefined` if absent.
- Rails strips `:case_sensitive` via `except`; TS only passes `{ message, attribute }`. Other custom vars lost.

---

## 11. `validations/format.ts` vs `validations/format.rb`

No deviations found. `matchStateless` (TS-only) handles JS `RegExp#test` `lastIndex` mutation — not a semantic deviation.

---

## 12. `validations/exclusion.ts` vs `validations/exclusion.rb`

No deviations found.

---

## 13. `validations/inclusion.ts` vs `validations/inclusion.rb`

No deviations found.

---

## 14. `validations/length.ts` vs `validations/length.rb`

**Critical**

- **`:in`/`:within` Range not constructor-converted.** Rails (`length.rb:15-27`) converts to `minimum`/`maximum` in constructor and validates Range type. TS `validateEach` (`length.ts:57-59`) reads `options.in` as `[number, number]` tuple at validation time. Consequences: non-range/non-tuple `:in` not caught at definition time; `exclude_end?` semantics not replicated.
- **`RESERVED_OPTIONS` not stripped before `errors.add`.** Reserved keys (`:minimum`, etc.) leak into i18n interpolation.

**Notable**

- `check_validity!` in Rails validates check values are non-negative Integer / `Float::INFINITY` / Symbol / Proc. TS `checkValidity` (`length.ts:24-35`) only checks at-least-one-constraint presence.
- `validates_size_of` alias missing from `HelperMethods` interface.
- `skipNilCheck` checks `=== undefined`; Rails `.nil?`. TS guard misses explicit `null` for `allowNil`/`allowBlank`.

---

## 15. `validations/numericality.ts` vs `validations/numericality.rb`

**Critical**

- **`odd`/`even` applied to float.** Rails `numericality.rb:51` calls `value.to_i.odd?` — truncates first. TS `numericality.ts:206-210` uses `num % 2` directly on the float. `2.5` → Rails: even, TS: odd.
- **`came_from_user?` ignored.** Rails `numericality.rb:122-141` checks `${attr}_came_from_user?` first; only uses `before_type_cast` if true. TS `numericality.ts:537-567` always reads `readAttributeBeforeTypeCast` (deliberate skip — documented inline).

**Notable**

- `record_attribute_changed_in_place?` short-circuit deliberately skipped (documented).
- `:in` option: Rails uses `Range#cover?` (endpoint semantics). TS treats as `[min, max]` tuple — exclusive-end and Range-object semantics absent.

---

## 16. `validations/clusivity.ts` vs `validations/clusivity.rb`

**Notable**

- Rails `inclusion_method` returns `:cover?` for numeric/time/date Ranges (O(1)). TS always returns `"include?"` (no native Range; numeric Range membership is O(n) via the tuple representation).
- TS `checkValidityBang` is broader/more permissive than Rails — accepts duck-typed `.has` methods.

---

## 17. `validations/resolve-value.ts` vs `validations/resolve_value.rb`

**Notable**

- Rails handles Symbol via `record.send(value)`. TS handles strings; falls back to property value (not call) for non-functions. Rails would call `send(:symbol)` → method call, raising for non-callable. Low practical risk.

---

## 18. `validations/callbacks.ts` vs `validations/callbacks.rb`

**Notable**

- Rails `after_validation` sets `options[:prepend] = true` for LIFO ordering (`callbacks.rb:88-95`). TS `setOptionsForCallback` (`callbacks.ts:55-71`) doesn't handle prepend.
- Rails wraps `super` (which calls `_run_validate_callbacks`) inside `_run_validation_callbacks { super }`. TS `runValidationsBang` (`callbacks.ts:88-100`) calls `runValidations?.()` inside `_runValidationCallbacks`. Naming/chain difference; observable behavior equivalent in current tests.

---

## 19. `validations/_accessor.ts` — Trails-Only

No Rails counterpart. Helper for `acceptance.ts` / `confirmation.ts` accessor walking.

---

## `validations/helper_methods.rb` Coverage

Rails defines only `_merge_attributes`. Ported as `_mergeAttributes` (`validations.ts:345-354`). TS uses `flat(Infinity)` + `String(n)` coercion; Rails uses `flatten!` preserving symbol keys.

---

## Verification notes — false positives dropped from prior pass

- §3: "`StrictValidationFailed` not defined anywhere" — **FALSE POSITIVE.** Defined in `errors.ts`, exported from `index.ts:6`, and thrown at `model.ts:540` via the `isStrict` callback wired by `validates({ strict: true })`. The strict path is fully wired.
- §3: "`validatesBang` never raises `StrictValidationFailed`" — same root cause; the strict path is reached via `validates(..., { strict: true })` (callback at `model.ts:528-543`), not through a separate `validatesBang` method.
