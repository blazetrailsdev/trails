# ActiveModel Core Audit (verified)

Date: 2026-05-02 (verification pass)
Scope: model, api, access, attribute-assignment, attribute-methods, attribute-mutation-tracker, attribute-registration, attribute, attribute/user-provided-default, attributes, attribute-set, attribute-set/builder, attribute-set/yaml-encoder, forbidden-attributes-protection.

Trails source: `packages/activemodel/src/`
Rails source: `scripts/api-compare/.rails-source/activemodel/lib/active_model/`

Every finding below was confirmed by reading both the TS and Rails source. False positives from the original audit are listed at the bottom under "Verification notes" with the reason for removal.

---

## 1. `model.ts` → `model.rb`

No deviations within this file. Rails `ActiveSupport.run_load_hooks` infrastructure intentionally omitted.

---

## 2. `api.ts` → `api.rb`

**Notable**

- TS `api.ts` is structured as a re-export module with an `API` interface (`api.ts:13-15`); Rails `api.rb:59-98` defines the `API` module with concrete `initialize` (`:80-84`) and `persisted?` (`:95-97`) instance methods. Trails puts the implementations on `Model`; consumers who only `implements API` (TS) get only the interface, while a Ruby class that `include ActiveModel::API` gets the methods. Behaviorally equivalent for `Model` users.
- `Conversion`/`Naming` are not surfaced through `api.ts` at all — Rails `api.rb:62-68` includes/extends them. Trails composes them into `Model` directly.

---

## 3. `access.ts` → `access.rb`

**Notable**

- Rails `access.rb:9` `slice` resolves each method via `public_send(method)` (so a user-defined reader override participates). Trails' implementation lives on `Model` (`model.ts:2194-2200`) and uses `this.readAttribute(m)`, which goes straight to the attribute store. **A user override of a getter is bypassed by `Model#slice` / `Model#valuesAt`.**
- Rails wraps the result in `with_indifferent_access` (`access.rb:9`); TS returns a plain `Record<string, unknown>` (`model.ts:2195`). Idiomatic for JS and unlikely to affect callers.

---

## 4. `attribute-assignment.ts` → `attribute_assignment.rb`

**Critical**

- **`attributes=` setter missing.** Rails `attribute_assignment.rb:37` `alias attributes= assign_attributes`. Trails' `Model` defines a getter only (`model.ts:1457-1459`); there is no setter. `model.attributes = hash` will silently no-op (sloppy mode) or throw (strict).

**Notable**

- `_assignAttribute` setter discovery (`attribute-assignment.ts:73-83`) walks the prototype chain looking for accessor descriptors (`desc.set === "function"`). User-defined `set name(v) { ... }` declarations on a subclass prototype are found correctly, as are framework-installed setters (which `attributes.ts:124-132` defines via `Object.defineProperty`/`set`). A user who instead declares `name = "default"` as a TS class field gets a _data_ descriptor on the instance, which `findSetter` will not match — assignment falls through to `model.writeAttribute(key, value)`. The corresponding Rails path uses `public_send("#{k}=", v)` which does dispatch to `attr_writer`-style readers regardless. Effect is narrow: the framework-installed accessor still runs `writeAttribute` in either case, but a user expecting their hand-rolled class-field initializer to act as a "writer hook" won't get one.
- `sanitizeForMassAssignment` (`attribute-assignment.ts:9-19`) does not call `.to_h` on a permitted-style param object. Rails `forbidden_attributes_protection.rb:26` does `attributes.to_h` after the permitted check, which strips non-enumerable extras from `ActionController::Parameters`. Only matters for AR + ActionController flows.

---

## 5. `attribute-methods.ts` → `attribute_methods.rb`

**Critical**

- **No `respond_to?` implementation.** Rails `attribute_methods.rb:528-538` overrides `respond_to?` so attribute methods (including auto-generated dirty cascades) report `true`. The trails `AttributeMethods` interface (`attribute-methods.ts:14`) declares `respondTo(method)` but no implementation is provided in this file. Form-helper-style callers that probe via `respondTo` get nothing useful here.
- **No `method_missing` analogue.** Rails (`:507-514`) routes unknown methods through `method_missing` → `matched_attribute_method` → `attribute_missing`. JS has no `method_missing`, so trails eagerly generates per-attribute methods at `attribute()` call time (`attributes.ts:135` → `defineDirtyAttributeMethods`). Attributes added after class definition need a fresh `defineAttributeMethods` call.

**Notable**

- `attribute_method_prefix` / `_suffix` `parameters:` keyword ignored. Rails `:106-109, :140-143` accept `parameters:` and thread it into the generated method signature. TS `attribute-methods.ts:158-174` takes only `...prefixes` / `...suffixes` and never reads `parameters` (the `AttributeMethodPattern` constructor does accept it, but the pattern-registration entry points don't pass it through).
- `isInstanceMethodAlreadyImplemented` checks only the trails-tracked `_generatedMethods` set (`attribute-methods.ts:359-364`); Rails (`:404-406`) checks `generated_attribute_methods.method_defined?` against the inherited generated module. Methods inherited from a parent class (which trails' copy-on-first-write does correctly populate via `_generatedMethods`) match either way; arbitrary methods defined on the trails prototype outside the framework's tracking would not be detected.
- `attribute_method?` divergence (`attribute-methods.ts:455-457` vs `:541-543`). Rails goes through the public `attributes` reader (so a subclass override of `attributes` participates); TS reads `_attributes.has(...)` directly.
- `_read_attribute` divergence. Rails (`:556-558`) is `def _read_attribute(attr); __send__(attr); end` — public reader dispatch. TS (`:483-494`) reads `_attributes.fetchValue` directly unless an instance-level `_readAttribute` override is present. Subclass reader overrides are bypassed in TS.
- `missing_attribute(attr_name, stack)` arity. Rails (`:552-554`) takes a `stack` for backtrace propagation; JS has no `caller` equivalent so the parameter is dropped (`attribute-methods.ts:472-476`). Cosmetic.
- `AttrNames.define_attribute_accessor_method` signature. Rails (`:577`) uses `(owner, attr_name, writer:)` with a `yield` block; TS (`:66-80`) returns `{ methodName, attrNameRef }` directly. Different idiom; both compute the same names.
- `CALL_COMPILABLE_REGEXP` constant absent in TS. Rails (`:68`) defines it for the eval path; TS has no eval, so the constant is unused in any case.

---

## 6. `attribute-mutation-tracker.ts` → `attribute_mutation_tracker.rb`

**Critical**

- **`AttributeMutationTracker#forceChange` clones; Rails stores live reference.** Rails `:63-65` `force_change(attr_name); forced_changes[attr_name] = fetch_value(attr_name); end`. TS `attribute-mutation-tracker.ts:121-125` calls `cloneValue(value)`. Behavioral inversion: subsequent in-place mutation of the value is reflected in Rails dirty tracking (since the live ref keeps observing the same object) but not in TS.
- **`AttributeMutationTracker#forceChange` early-returns if already set; Rails overwrites.** TS `:122` guards `if (this.forcedChanges.has(name)) return;`. Rails has no such guard at `:63-65` and re-stores `fetch_value` every call. A second call after a mutation refreshes the snapshot in Rails but is a no-op in TS.

**Notable**

- `ForcedMutationTracker#forceChange` cloning differs in mechanism, not presence. Both clone (Rails `:122` `clone_value(attr_name) unless attribute_changed?`, TS `:189-193` `cloneValue(value)`). Rails `clone_value` (`:144-149`) is `value.duplicable? ? value.clone : value` rescuing exceptions; TS `cloneValue` (`:5-28`) deep-clones plain objects/arrays/Date but **returns class instances unchanged** (line 22). A model attribute holding a custom class instance would diverge.
- `ForcedMutationTracker#fetchValue` not overridden in TS. Rails (`:140-142`) overrides to call `attributes.send(:_read_attribute, attr_name)`; TS inherits the base `attributes.fetchValue(name)` (line 138-140). Path through Ruby's `_read_attribute` allows subclass override; TS path does not.
- `changedValues` returns `HashWithIndifferentAccess` in Rails (`:18-24`); TS returns plain `Record` (`:55-63`). Idiomatic for JS.
- `NullMutationTracker` is a `Singleton` in Rails (`:157`); plain class in TS (`:210`). Reference-equality checks against the singleton would never match in TS.
- `NullMutationTracker.forceChange`/`forgetChange`/`finalizeChanges` are no-ops in TS (`:243-245`); Rails defines no such methods, so a Rails caller would `NoMethodError`. TS is more lenient.

---

## 7. `attribute-registration.ts` → `attribute_registration.rb`

**Critical**

- **`attributeTypes()` lookup missing default fallback.** Rails `:37-41` builds the hash with `hash.default = Type.default_value`, so `attribute_types[:unknown]` returns the default Value type. TS `:263-265` returns the plain map; `attributeTypes()[unknownName]` is `undefined`. `typeForAttribute` (`:273-275`) explicitly returns `null` for unknown names; Rails returns `Type.default_value`.

**Notable**

- `decorateAttributes` (`:230-255`) eagerly applies the decorator to `_attributeDefinitions` in addition to pushing the `PendingDecorator` onto the queue. Rails (`:23-29`) only pushes pending. The eager path is documented inline as a backward-compat measure for `typeForAttribute` reads that don't go through `_defaultAttributes`.
- `resetDefaultAttributesBang` (`:299-306`) only clears `_cachedDefaultAttributes` (and `_attributesBuilder`). Rails (`:96-99`) clears both `@default_attributes` and `@attribute_types`. Equivalent today because TS `attributeTypes()` doesn't memoize separately, but fragile if a memoization optimization is added later.
- `type_for_attribute` block form. Rails (`:43-51`) accepts `&block` as a fallback; TS `typeForAttribute` (`:273-275`) returns null on miss with no callback.
- `resolveTypeName` options forwarding. Rails (`:105-107`) `Type.lookup(name, **options)`. TS (`:327-333`) ignores its `_options` parameter and calls `typeRegistry.lookup(name)`. The trails registry doesn't accept options either (see audit-types §14), so options would have nowhere to go even if forwarded.

---

## 8. `attribute.ts` → `attribute.rb`

**Critical**

- **`withType` drops both in-place changes AND `originalAttribute`.** Rails `:91-97`:
  ```ruby
  def with_type(type)
    if changed_in_place?
      with_value_from_user(value).with_type(type)
    else
      self.class.new(name, value_before_type_cast, type, original_attribute)
    end
  end
  ```
  TS `:106-108`: `return Attribute.withCastValue(this.name, this.value, type);` — unconditionally creates a `WithCastValue`, dropping `originalAttribute` and not preserving `valueBeforeTypeCast`. In-place changes also silently lost.
- **`withValueFromUser` skips `assert_valid_value`.** Rails `:78-81`: `type.assert_valid_value(value)` first. TS `:94-96`: no validation call. Invalid values silently accepted.
- **`Uninitialized#originalValue` returns `undefined`, not the `UNINITIALIZED_ORIGINAL_VALUE` sentinel.** Rails `:243` defines the sentinel and `:255-257` returns it. TS `Uninitialized` (`:312-336`) has no `originalValue` override; inherits the base which returns `this.value` → `undefined`. AR dirty tracking checks against the sentinel (e.g. `original_value == UNINITIALIZED_ORIGINAL_VALUE`); the trails `undefined` would never trip that branch.

**Notable**

- `Uninitialized#value` block form. Rails `:249-253` yields `name` to a block when given. TS `:317-319` is a getter returning `undefined`. The Rails block form is consumed by the lazy attribute set's `fetch_value`; trails uses a different lazy path (see §12) so the practical impact is limited.
- `Null#withType` not overridden. Rails `:231-233` returns `with_cast_value(name, nil, type)`. TS Null has no override; falls through to base `withType` → `Attribute.withCastValue(this.name, this.value, type)` where `this.value` is `null`. Functionally equivalent.
- `Null#withCastValue` not aliased to error. Rails `:239` aliases to `with_value_from_database` (which raises `MissingAttributeError`). TS Null overrides `withValueFromDatabase`/`withValueFromUser` (`:303-309`) but not `withCastValue` — calling it on a `Null` succeeds in TS, raises in Rails.
- `initialize_dup` not implemented. Rails `:155-159` dups `@value` if duplicable. TS has no dup hook; `AttributeSet#cloneAttribute` (`attribute-set.ts:194-214`) uses `Object.assign(Object.create(proto), attr)` which shallow-copies — mutable cast values are shared between original and clone.
- `==` / `eql?` / `hash` not implemented. Rails `:115-125`. TS `equals(other)` (`:143`) only. Attributes can't be used as Map keys with value-equality semantics.
- `init_with` / `encode_with` (YAML) not implemented in this file. Rails `:127-141`. TS handles YAML separately in `yaml-encoder.ts`.

---

## 9. `attribute/user-provided-default.ts` → `attribute/user_provided_default.rb`

**Critical**

- **`withType` not overridden.** Rails `:25-27` constructs a fresh `UserProvidedDefault(name, user_provided_value, type, original_attribute)` so the user's value/proc is preserved across type changes. TS has no `withType` override; falls through to base `Attribute#withType` → `Attribute.withCastValue(...)`, returning a `WithCastValue` and losing the user-provided-default context (and the proc re-evaluation behavior).

**Notable**

- `marshal_dump` doesn't preserve a memoized cast value. Rails `:29-37` includes `value` in the dump only if `defined?(@value)`. TS `:61-63` always dumps `[name, valueBeforeTypeCast, type, originalAttribute]` (4 items), never the cast value. Round-trip works (a re-cast happens on load) but is slightly wasteful and diverges from Rails' dump shape.

---

## 10. `attributes.ts` → `attributes.rb`

**Notable**

- `Attributes` class (`:248-288`) has no `freeze` override. Rails `:150-153` freezes the cloned attribute set before delegating to `super`. The trails `Model.freeze` does its own pre-materialization but doesn't freeze `_attributes`; writes after freezing throw a native `TypeError` (because the model itself is `Object.freeze`-d) instead of the typed `FrozenError` thrown by `AttributeSet#assertNotFrozen`.
- `Attributes` class has no `initialize_dup` analogue. Rails `:111-114` deep-dups `@attributes`. JS lacks an automatic dup hook; a shallow spread/copy of an `Attributes` instance shares its `_attributes` reference.
- `attribute=` private alias missing. Rails `:159` aliases to `_write_attribute`; trails has no equivalent (related to the missing `attributes=` setter — §4).
- `Attributes::ClassMethods.attribute_names` (class method) not exposed on the trails `Attributes` class itself. Rails `:74-76`. `Model` has its own static `attributeNames` method; consumers using the bare `Attributes` class do not.

**Equivalent via different mechanism**

- Rails `:161-163` `private def attribute(attr_name); @attributes.fetch_value(attr_name); end` — the per-attribute reader dispatch. Trails installs per-attribute getters via `Object.defineProperty` in `attribute()` (`attributes.ts:124-132`).

---

## 11. `attribute-set.ts` → `attribute_set.rb`

**Notable**

- `delegate :each_value, :fetch, :except` (Rails `:10`) absent. TS exposes `forEach`, `entries`, `[Symbol.iterator]`, but not `fetch` or `except`.
- `==` not implemented. Rails `:106-108` compares inner attribute hashes; TS has no `equals`.
- `to_h` alias missing. Rails `:39`. TS only has `toHash`.
- `include?`/`key?` aliases missing. Rails `:41-44`. TS has `has(name)` and `isKey(name)` (functionally equivalent under JS naming).
- `initialize_dup` / `initialize_clone` (Rails `:77-85`) not implemented. TS has `deepDup` (`:216-225`).

---

## 12. `attribute-set/builder.ts` → `attribute_set/builder.rb`

**Critical**

- **`buildFromDatabase` returns an eager `AttributeSet` in TS; Rails returns `LazyAttributeSet`.** Rails `:15-17` `LazyAttributeSet.new(values, types, additional_types, default_attributes)`. TS `:14-34` materializes every column up front into a fresh `AttributeSet`. Performance gap on wide tables; semantic gap if attribute access is supposed to be lazy.
- **`LazyAttributeSet` shape diverges fundamentally.** Rails (`:21-92`) carries `@values`, `@types`, `@additional_types`, `@default_attributes`, `@casted_values`, `@materialized` and short-circuits `fetch_value` through the `@casted_values` cache. TS `LazyAttributeSet` (`:43-87`) extends `AttributeSet` and carries only `_additionalTypes`. The hot-path cast-value cache is absent; lazy materialization is approximated through `materialize()` which copies into the underlying attribute store.
- **`LazyAttributeHash` constructor signature differs.** Rails `:97` `initialize(types, values, additional_types, default_attributes, delegate_hash = {})` (5 args). TS `:99` `(types, values)` (2 args). `additional_types` and `default_attributes` are not stored, so `assignDefault` (`:185-198`) ignores both — schema column defaults from `default_attributes` silently drop.
- **`LazyAttributeHash#assignDefaultValue` ignores `default_attributes`.** Rails `:165-179` checks `default_attributes[name]` and dups it; TS `:185-198` either constructs `Attribute.fromDatabase` (if a value is present) or `Attribute.uninitialized` (if a type is present) — never falls back to a configured default attribute.

**Notable**

- `marshal_dump` shape differs (Rails 5 items at `:142-144`, TS 2 items at `:164-166`). Cross-language Marshal/JSON round-trip wasn't a thing anyway; cosmetic.

---

## 13. `attribute-set/yaml-encoder.ts` → `attribute_set/yaml_encoder.rb`

**Critical**

- **Different protocol entirely.** Rails `:12-30`: `encode(attribute_set, coder)` writes Attribute objects (with `with_type(nil)` size optimization for default types) into `coder["concise_attributes"]`; `decode(coder)` reads `coder["concise_attributes"]` or `coder["attributes"]` and reconstructs an `AttributeSet`. TS `:16-18`: `encode(set): string` returns `YAML.stringify(set.toHash())` — flattens to a plain hash of cast values, **dropping all type metadata**. `decode(encoded): Record<string, unknown>` returns a plain object — does NOT reconstruct an `AttributeSet`. The two encoders are not interoperable and the TS round-trip cannot recover types.

**Notable**

- `types()` getter is TS-only (`:33-35`). No Rails counterpart.

---

## 14. `forbidden-attributes-protection.ts` → `forbidden_attributes_protection.rb`

**Notable**

- The TS file (`forbidden-attributes-protection.ts`, 11 lines) only exports the `ForbiddenAttributesError` class; the `sanitize_for_mass_assignment` logic lives in `attribute-assignment.ts` (cross-ref §4). Rails has it as a real `ForbiddenAttributesProtection` module (`forbidden_attributes_protection.rb:21-32`).
- `sanitize_forbidden_attributes` alias missing. Rails `:31`.

---

## Summary — verified critical findings

1. `attribute-set/builder.ts` — `LazyAttributeHash` constructor takes only `(types, values)`; `default_attributes` and `additional_types` are dropped, so schema column defaults silently disappear on lazy lookup.
2. `attribute-set/builder.ts` — `buildFromDatabase` is eager; the `@casted_values` hot-path cache is missing from TS `LazyAttributeSet`.
3. `attribute-set/yaml-encoder.ts` — different protocol; type metadata is lost on the TS round-trip.
4. `attribute.ts` — `withType` always returns a `WithCastValue` regardless of `changed_in_place?` and drops `originalAttribute`.
5. `attribute.ts` — `withValueFromUser` skips `assert_valid_value`.
6. `attribute.ts` — `Uninitialized#originalValue` returns `undefined`; the `UNINITIALIZED_ORIGINAL_VALUE` sentinel that AR dirty tracking checks against is absent.
7. `attribute/user-provided-default.ts` — `withType` not overridden; user-provided context is lost on type change.
8. `attribute-mutation-tracker.ts` — `AttributeMutationTracker#forceChange` clones in TS but stores live references in Rails, AND TS early-returns on duplicate calls where Rails overwrites.
9. `attribute-registration.ts` — `attributeTypes`/`typeForAttribute` returns `undefined`/`null` for unknown names; Rails returns `Type.default_value`.
10. `attribute-assignment.ts` — `attributes=` setter missing; `model.attributes = hash` fails.
11. `attribute-methods.ts` — no real `respond_to?` implementation in this file; no `method_missing` analogue (compensated by eager generation but with caveats for late-added attributes).

---

## Verification notes

The following original-audit claims were dropped or rewritten in this verified pass:

- §4 "\_assignAttribute ... finds private setters that Rails would skip" — **dropped.** JS has no runtime concept of private accessor; the comparison was incoherent.
- §4 "Error type for non-hash arg ... close enough" — **dropped.** Trails (`attribute-assignment.ts:34-38`) emits exactly the same message format as Rails (`attribute_assignment.rb:30`); not a deviation.
- §5 "isInstanceMethodAlreadyImplemented ... plus a 'dangerous methods' guard" — **rewritten.** Rails `:404-406` does not implement a dangerous-methods guard at this level; that check lives in ActiveRecord, not ActiveModel.
- §5 "AttrNames.DEF_SAFE_NAME regex `\A`/`\z` vs `^`/`$`" — **dropped.** The original audit even noted "behaviorally equivalent for single-line names." Not a deviation in non-multiline mode.
- §6 "ForcedMutationTracker#force*change: same clone-vs-no-clone pattern" — **rewritten.** Both implementations clone; the actual divergence is in the cloning \_mechanism* (Rails `value.clone` rescuing exceptions vs trails' `cloneValue` which preserves class instances unchanged).
- §7 "decorateAttributes ... could double-decorate if `_defaultAttributes` is replayed" — **rewritten.** The eager-apply touches `_attributeDefinitions`, while pending-replay touches `AttributeSet`. Different stores; no double-decoration risk.
- §7 "reset_default_attributes!: only clears `_cachedDefaultAttributes` ... Effectively equivalent today" — **demoted from Critical to Notable.** Audit already acknowledged equivalence; severity was wrong.
- §9 "Constructor passes `undefined` as `valueBeforeTypeCast`" — **dropped.** Trails `UserProvidedDefault` overrides the `valueBeforeTypeCast` getter (`user-provided-default.ts:34-43`), so the base-class field is never observably read. No behavior gap.
- §11 "`reverseMergeBang` semantics match" — **dropped.** Positive note, not a finding.
- §14 (and §4) `to_h` step in `sanitizeForMassAssignment` — **kept once in §4** rather than duplicated in §14 (single source of truth).
- §14 `ForbiddenAttributesProtection` "module not modeled separately ... no behavior gap" — **demoted to Notable.** Architectural note, not a behavior deviation.
