# ActiveModel ↔ Rails audit

Date: 2026-04-23
Scope: `packages/activemodel/src/**` vs pinned Rails source at
`scripts/api-compare/.rails-source/activemodel/lib/active_model/**`.

Structured as a list of **landable PRs**, each ≤20 methods (per CLAUDE.md),
with `file:line` pointers on both sides. Headline surface numbers from
`pnpm run api:compare --package activemodel`: **341/342 public (99.7%)**,
**12/141 private (8.5%, mostly comparator false-negatives from
snake→camel renames)**, **40/41 inheritance (Railtie mismatch)**.
`pnpm run test:compare --package activemodel`: **963/963 tests (100%)**,
**56/56 files**, **0 misplaced** — so test layout is not the risk;
behavioral coverage is.

Every deviation below was confirmed by reading both the TS and Rails
source (no "verify" stubs). Line numbers are current as of HEAD
(`2808cfc0`).

Legend: `TS` = our file, `Rails` = Rails source.

---

## PR 1 — `toParam` persisted check + `param_delimiter` (2 methods)

**Ship value:** silent correctness bug in URL generation.

- `TS packages/activemodel/src/model.ts:1466-1470` returns a param string
  for unpersisted models and hard-codes `"-"` as the join delimiter.
  `Rails scripts/api-compare/.rails-source/activemodel/lib/active_model/conversion.rb:91`:
  `(persisted? && (key = to_key) && key.all?) ? key.join(self.class.param_delimiter) : nil`.
- Add class-level `paramDelimiter` (Rails:
  `conversion.rb:32 class_attribute :param_delimiter, instance_reader: false, default: "-"`).
  Tests already present at
  `TS packages/activemodel/src/conversion.test.ts:15,62`.

Methods touched: `Model#toParam`, `Model.paramDelimiter` (new class attr).

---

## PR 2 — `Conversion._toPartialPath` demodulize parity (1 method)

- `TS packages/activemodel/src/conversion.ts:32` calls
  `underscore(this.name)` without demodulizing.
  `Rails conversion.rb:114` uses
  `ActiveSupport::Inflector.underscore(ActiveSupport::Inflector.demodulize(name))`.
- Coincidentally works when `modelName` is configured (because our
  `ModelName` also strips the namespace — see PR 11), but divergent for
  classes without configured `modelName`. **Order with PR 11:** land
  PR 11 first. Once `ModelName` emits namespaced `singular`/`element`,
  this path needs `demodulize` so the fallback branch stops double-
  namespacing.

Methods touched: `_toPartialPath`.

---

## PR 3 — `AttributeAssignment` routes through user setters (1 method)

**Ship value:** standard Rails extension point silently broken.

- `TS packages/activemodel/src/attribute-assignment.ts:47-61`
  (`assignAttribute`) calls `model.writeAttribute(key, value)` directly.
  `Rails attribute_assignment.rb:67-70` does
  `setter = "#{k}="; public_send(setter, v)`, so user-defined
  `def name=(v)` overrides participate in mass assignment.
- Fix: prefer a JS setter (`name` → descriptor on the prototype or an
  own `#{name}` setter) before falling back to `writeAttribute`.

Methods touched: `assignAttribute` (private).

---

## PR 4 — `Errors.copy!` replace semantics + `objects` alias + `uniq!` (3 methods)

**Ship value:** silent data corruption when called on a non-empty Errors.

- `TS packages/activemodel/src/errors.ts:125-131` `copy` **appends** to
  `this._errors`. `Rails errors.rb:138` `copy!(other)` replaces
  `@errors` with deep-duped errors bound to the new base
  (`@errors = other.errors.deep_dup; @errors.each { |e| e.instance_variable_set(:@base, @base) }`).
  Our `copyBang` (`errors.ts:138`) delegates to `copy`, inheriting the
  same bug.
- Expose `objects` (Rails alias for the internal array —
  `errors.rb:108 alias :objects :errors`).
- Expose `uniq!` (Rails delegates via `errors.rb:103 def_delegators
:@errors, :each, :clear, :empty?, :size, :uniq!`).

Methods touched: `copy`, `copyBang`, `objects`, `uniqBang`.

---

## PR 5 — `Errors` option-aware filtering (4 methods)

- `where` — `TS errors.ts:50-54` accepts only `type`.
  `Rails errors.rb:339-348 def where(attribute, type = nil, **options)`
  filters by `options` too.
- `delete` — `TS errors.ts:107-117` same gap.
  `Rails errors.rb:413 def delete(attribute, type = nil, **options)`.
- `added?` — `TS errors.ts:103-105` has `_options?: Record<string, unknown>`
  but the param is unused (`_options`). `Rails errors.rb:372-388`
  compares normalized options for exact match; without it, duplicate
  suppression in `add` can't distinguish `count: 24` from `count: 25`.
- `import` — `TS errors.ts:177-180` accepts only `{ attribute?: string }`.
  `Rails errors.rb:158 def import(error, override_options = {})`
  supports `:attribute` + `:type` + arbitrary option overrides and
  nested-error attribute prefixing.

Methods touched: `Errors#where`, `#delete`, `#added` (rename to `isAdded`
if staying camelCase-predicate style; currently `added`), `#import`.

---

## PR 6 — `Errors` enumerability + strict-mode wiring (2 surface changes)

- Add `[Symbol.iterator]` on `Errors` so `[...errors]`, `for (e of errors)`,
  `Array.from(errors)` work. Rails: `errors.rb:62 include Enumerable`.
- `add` currently returns `void` (`TS errors.ts:33-40`) and ignores the
  `strict:` option. Rails `errors.rb:321-333` returns the new `Error`
  and raises `StrictValidationFailed` (or the custom class) when
  `strict: true`. `StrictValidationFailed` is already exported at
  `errors.ts:212-217` — just never thrown.

Methods touched: `Errors#add` (return type + strict branch),
`Errors[Symbol.iterator]`.

---

## PR 7 — `Validations` return-shape parity (3 methods)

**Ship value:** public API shape mismatch with Rails.

- `validate(ctx?)` — `TS model.ts:1127-1130` returns `this`.
  Rails `validations.rb:370 alias_method :validate, :valid?` — returns
  `Boolean`. Either change the return type or alias properly.
- `isInvalid()` — `TS model.ts:1132-1134` takes no args.
  Rails `validations.rb:408 def invalid?(context = nil)` takes context.
- `validateBang(ctx?)` — `TS model.ts:1534-1542` returns `boolean`.
  Rails `validations.rb:417 def validate!(context = nil)` returns `true`
  **or raises `ValidationError`** — never returns `false`.

Methods touched: `Model#validate`, `#isInvalid`, `#validateBang`.

---

## PR 8 — `ValidationContext` array-of-contexts support (3 touch points)

- `TS validations.ts:63-76` — `ValidationContext` is an immutable holder
  whose `.context` getter returns `.name`. Rails `validations.rb:503`
  `class ValidationContext; attr_accessor :context; end` — mutable, and
  `context` itself is `Symbol | Array<Symbol>`.
- `TS model.ts:1525` `get validationContext(): string | null` collapses
  the type. Rails returns `Symbol | [Symbol] | nil` so
  `valid?([:create, :publish])` can round-trip.
- Port `predicate_for_validation_context`
  (`Rails validations.rb:294-306`) — shared per-class memoization used
  when `on:` is set and when `except_on:` is an Array.

Methods touched: `ValidationContext` (new fields), `Model#validationContext`,
`Model.predicateForValidationContext` (private static).

---

## PR 9 — `ValidationError` I18n + `Validations#freeze` (2 methods)

- `TS validations.ts:46-56` — `ValidationError` message hard-codes
  `"Validation failed: …"`. Rails `validations.rb:496-500`:
  `I18n.t(:"#{model.class.i18n_scope}.errors.messages.model_invalid",
errors: ..., default: :"errors.messages.model_invalid")`.
- `Rails validations.rb:372-377` overrides `freeze` to pre-materialize
  `errors` and `context_for_validation` before delegating to `super`.
  No equivalent on our `Model` (grep `"freeze"` in `model.ts` — no
  override). Frozen models can't lazy-init errors.

Methods touched: `ValidationError#constructor`, `Model#freeze`.

---

## PR 10 — `_validators` hash shape + O(1) `validatorsOn` + `inherited` (3 methods)

- `TS model.ts:71` `static _validators: Array<...>` — flat.
  `Rails validations.rb:50`: `class_attribute :_validators, … default:
Hash.new { |h,k| h[k] = [] }` keyed by attribute symbol.
- `TS model.ts:466-475` `validators()` returns flat list; `validatorsOn`
  at `model.ts:475-485` scans the full array. Rails
  `validations.rb:204-206 def validators; _validators.values.flatten.uniq`
  and `:267-270 def validators_on(*attributes); attributes.flat_map { _validators[a.to_sym] }`
  — both are trivial over the hash.
- `Rails validations.rb:287-291 def inherited(base)` does a per-attribute
  dup: `dup = _validators.dup; base._validators = dup.each { |k,v| dup[k] = v.dup }`.
  Our inherited callback needs the equivalent to avoid subclasses
  mutating parent arrays.

Methods touched: `Model._validators` (shape change), `.validators`,
`.validatorsOn`, `.inherited`.

---

## PR 11 — `ModelName` namespace-aware singular/plural/keys (5 fields)

**Ship value:** routes, forms, strong params, I18n paths differ for
namespaced classes.

- `TS naming.ts:91-103` strips the namespace via
  `className.includes("::") ? className.split("::").pop()! : className`,
  then `underscore(baseName)`. Four downstream fields are wrong for
  namespaced classes.
- `Rails naming.rb:166-185` (`ActiveModel::Name#initialize`):

  | Field        | Rails (for `Blog::Post`)                             | Ours       |
  | ------------ | ---------------------------------------------------- | ---------- |
  | `singular`   | `"blog_post"`                                        | `"post"`   |
  | `plural`     | `"blog_posts"`                                       | `"posts"`  |
  | `element`    | `"post"`                                             | `"post"` ✓ |
  | `collection` | `"blog/posts"`                                       | `"posts"`  |
  | `paramKey`   | `"blog_post"` (or unnamespaced for scoped namespace) | `"post"`   |
  | `routeKey`   | `"blog_posts"`                                       | `"posts"`  |
  | `i18nKey`    | `:"blog/post"`                                       | `"post"`   |

  Key derivations to port: `_singularize`
  (`naming.rb:216-218`:
  `ActiveSupport::Inflector.underscore(string).tr("/", "_")`) and
  `collection = Inflector.tableize(@name)`.

Methods touched: `ModelName#constructor` — all seven derived fields.

---

## PR 12 — `ModelName` string-ness (`==`, `<=>`, `toString`, `match?`) (5 methods)

- Rails `naming.rb:9-89` — `class ActiveModel::Name; include Comparable`
  delegates `==`, `===`, `=~`, `match?`, `to_s`, `<=>` to `@name`.
- TS: plain class (`naming.ts:59-104`). `model.class.modelName == "BlogPost"`
  is `false`; `modelName.match(/Post/)` throws.
- Add instance methods: `equals(other)`, `compare(other)`, `match(re)`,
  `toString()` (override), and `[Symbol.toPrimitive]` for coercion.

Methods touched: `ModelName#equals`, `#compare`, `#match`, `#toString`,
`[Symbol.toPrimitive]`.

---

## PR 13 — `ModelName` constructor signature + `uncountable?` instance method (2 methods)

- Rails `naming.rb:166`: `initialize(klass, namespace = nil, name = nil, locale = :en)`.
  Ours `naming.ts:86`: `(className: string, options?: { namespace?, klass? })`.
  Callers doing `new ModelName(klass)` Rails-style fail. Accept a
  class-like arg as first param (matching the Ruby signature) or add a
  `ModelName.fromClass(klass, …)` static factory.
- Add instance `isUncountable` (Rails `naming.rb:209-211
def uncountable?; @uncountable; end`). We expose it only at module
  level (`naming.ts:33-36 Naming.isUncountable(recordOrClass)`).

Methods touched: `ModelName#constructor`, `#isUncountable`.

---

## PR 14 — `ModelName` uncountables via ActiveSupport::Inflector (1 method)

- `TS naming.ts:73-80` hard-codes six uncountables in a private Set.
  Rails uses the global `ActiveSupport::Inflector` configuration, which
  users extend with `ActiveSupport::Inflector.inflections { |i|
i.uncountable 'news' }`.
- Replace the set with a call into `@blazetrails/activesupport`'s
  inflector so user-registered uncountables take effect.

Methods touched: `ModelName` uncountable lookup (1 touch point in
constructor).

---

## PR 15 — `Dirty` per-attribute generated methods (batch of ~10)

**Ship value:** core Rails API every downstream user expects.

- `TS dirty.ts` exposes only generic forms: `attributeChanged(name)`,
  `attributeWas(name)`, `attributeChange(name)`,
  `attributePreviouslyChanged(name)`, etc.
  (`dirty.ts:91-102, 95-98, 100-102, model.ts:1159-1305`).
- Rails generates per-attribute methods via `define_attribute_methods`.
  Cascade per attribute `X`: `X_changed?`, `X_change`, `X_was`,
  `X_will_change!`, `restore_X!`, `X_previously_changed?`,
  `X_previous_change`, `X_previously_was`, `saved_change_to_X?`,
  `saved_change_to_X`, `X_before_last_save`, `will_save_change_to_X?`,
  `X_in_database`. (Rails `dirty.rb` via
  `attribute_methods.rb:120-150` prefix/suffix generation.)
- In TS we can't `define_method` per name statically. Two options:
  (a) Proxy wrapper (virtualized path already used by
  `virtualized-dx-tests`), or (b) codegen at attribute-declaration time
  as own-properties on the instance. Decide which path; keep under 20
  method _generators_ per PR.

Methods touched: ~10 `*_` pattern generators. Split into two PRs if
testing expands.

---

## PR 16 — `Dirty` `mutations_from_database` vs `mutations_before_last_save` split (4 methods)

- Rails `attribute_mutation_tracker.rb:1-189` plus `dirty.rb` tracks two
  distinct states: pre-save diff (`mutations_from_database`) vs
  last-commit diff (`mutations_before_last_save`). Our
  `DirtyTracker` (`dirty.ts:35-161`) conflates them — `_previousChanges`
  doubles for both.
- Port: `mutations_from_database`, `mutations_before_last_save`,
  `forget_attribute_assignments`, `clear_attribute_change`.

Methods touched: `DirtyTracker#mutationsFromDatabase`,
`#mutationsBeforeLastSave`, `#forgetAttributeAssignments`,
`#clearAttributeChange`.

---

## PR 17 — `AttributeMethods` `alias_attribute` cascade (3 methods)

- `TS attribute-methods.ts:150-152` `aliasAttribute` just stores
  `newName → oldName` in `_attributeAliases`.
- Rails `attribute_methods.rb` `alias_attribute` generates the full
  method cascade: `X`, `X=`, `X?`, plus all dirty (`X_changed?`,
  `X_was`, …) and type-cast (`X_before_type_cast`) aliases.
- `attribute-methods.ts:250` has `aliasAttributeMethodDefinition`; wire
  it into `aliasAttribute` so dynamic methods resolve through
  `_attributeAliases` without the caller having to go through
  `readAttribute`/`writeAttribute`.

Methods touched: `aliasAttribute`, `aliasAttributeMethodDefinition`,
`resolveAlias`.

---

## PR 18 — `Callbacks` generic `setCallback` / `skipCallback` / `_run_*_callbacks` (3 methods)

- `TS model.ts:571-888` has named convenience registrars
  (`beforeSave`, `afterCreate`, `aroundUpdate`, …) — covers the common
  case — but no generic `setCallback(event, kind, fn, options)` /
  `skipCallback(event, kind, fn)` / public `runCallbacks(event, &block)`
  entry points. `model.ts:1565` exposes `runCallbacks(event, block)`
  ✓ (half done).
- Rails (`ActiveSupport::Callbacks` via
  `validations/callbacks.rb` + `callbacks.rb`) gives users
  `set_callback :validate, :before, ...`. Required for any third-party
  plugin that wants to register callbacks without knowing the event
  name at compile time.

Methods touched: `Model.setCallback`, `.skipCallback`,
`.resetCallbacks`.

---

## PR 19 — `Serialization`: `asJson` type coercion (1 method)

- `:include` recursion is **already implemented** at
  `TS serialization.ts:88-108` (`normalizeIncludes` at line 110-120),
  supporting string / string[] / `{ assoc: { only, except } }` forms.
  Close parity with Rails `serialization.rb:125-167`.
- Real gap: `asJson` (`model.ts:1339-1350`) returns values as-is —
  `Date`/`BigInt`/`BigDecimal`-like values flow through whatever
  `JSON.stringify` happens to do. Rails delegates through
  `ActiveSupport::JSON` which forces ISO8601 for Time/Date and
  string-encodes BigDecimal. Add a normalization pass in `asJson`
  before returning.

Methods touched: `asJson` (one branch added).

---

## PR 20 — I18n fallback chain + `%{key}` interpolation (scoped to I18n module)

- `TS packages/activemodel/src/i18n.ts` (170 lines) is a minimal
  lookup. No pluralization rules (CLDR), no locale fallback, `{key}`
  instead of `%{key}` with lambda + reserved-key (`count`, `default`)
  support. Affects `translation.ts:humanAttributeName`, every Rails
  error-message key, and `ValidationError`'s `:model_invalid` key
  (PR 9).
- Rails has no `i18n.rb` in `active_model`; it ships `locale/en.yml`
  and relies on the global `i18n` gem. Port enough of the gem's
  interpolation + fallback to match.

Methods touched: `I18n.t`, `I18n.translate` interpolation helper,
fallback chain walker.

---

## PR 21 — `Railtie` base class (1 change)

- `api:compare` inheritance mismatch — `TS packages/activemodel/src/railtie.ts:33`
  has no super class. Rails `railtie.rb:12
class Railtie < ::Rails::Railtie`.
- Wire up trailties' base `Railtie` and have ActiveModel's extend it
  (small; but requires a trailties API, which may be scoped
  separately).

Methods touched: `Railtie` superclass.

---

## PR 22a — `BooleanType` FALSE_VALUES parity (1 set)

- `TS type/boolean.ts:19-31` contains `[false, 0, "0", "f", "F",
"false", "FALSE", "off", "OFF", "no", "NO"]` — **11 entries,
  including `"no"` and `"NO"` that Rails does not have.** Rails
  `type/boolean.rb:15-24`:
  `[false, 0, "0", :"0", "f", :f, "F", :F, "false", :false, "FALSE",
:FALSE, "off", :off, "OFF", :OFF]` — 9 unique values (symbols collapse
  to strings in JS).
- Remove `"no"` / `"NO"`. Any test that passes "no" → `false` today is
  wrong vs Rails.

## PR 22b — `IntegerType` error class + helpers (5 methods)

- `TS type/integer.ts:27` throws **JS builtin `RangeError`**; Rails
  `type/integer.rb:95` raises `ActiveModel::RangeError`. We export
  `ActiveModelRangeError` at `errors.ts:242-246` but don't use it here.
  Fix: throw `ActiveModelRangeError` with the Rails message shape:
  `"#{value} is out of range for #{self.class} with limit #{_limit} bytes"`.
- Expose `range`, `inRange`, `ensureInRange`, `maxValue`, `minValue`,
  `_limit` (Rails `type/integer.rb:83-105`) so user subclasses can
  override bounds.

## PR 22c — `DateType` / `DateTimeType` fast-path parsers (5 private methods)

- Rails `type/date.rb:31-35` has a YYYY-MM-DD regex
  `fast_string_to_date` that skips `Date.parse` for the common case,
  plus `fallback_string_to_date` and `new_date`. Ours doesn't;
  `type/helpers/accepts_multiparameter_time.rb` also provides
  `value_from_multiparameter_assignment` + `microseconds` helpers that
  are private-level gaps.
- Also port `type/helpers/time_value.rb` fast path
  (`fast_string_to_time`, `new_time`). `Time.zone` semantics are
  Rails-specific — document the scope we accept rather than port.

## PR 22d — `ImmutableStringType` / `StringType` bool-literal casting (2 methods)

- Rails `type/immutable_string.rb:19-26`
  (`def cast_value(value); case value when true then "t"; when false
then "f"; else value.to_s; end`). Ours likely does `String(value)`
  which yields `"true"` / `"false"`. Fix the `case`.

## PR 22e — `DecimalType#applyScale` BigDecimal rounding (1 method)

- Rails `type/decimal.rb` uses `BigDecimal#round` (banker's rounding
  configurable). Ours likely uses `Number.toFixed` or float
  arithmetic — ULP divergence near 0.5 boundaries. Port via a decimal
  library (e.g. `decimal.js`) already used elsewhere, or document
  the precision limit.

---

## PR 23 — `SecurePassword` password-reset token (2 methods)

Confirmed by reading `TS secure-password.ts` (178 lines) vs
`Rails secure_password.rb` (231 lines):

- Present and correct: `SecurePassword.minCost`
  (`secure-password.ts:10`), MAX-72-byte length validation
  (`secure-password.ts:141 textEncoder.encode(pwd).length > 72`),
  dynamic per-attribute digest + confirmation + challenge caches
  (`secure-password.ts:41-57`).
- **Missing: reset-token infrastructure**. Rails
  `secure_password.rb:162-178` defaults `reset_token: true`, hooks
  `generates_token_for :"#{attribute}_reset", expires_in: 15.minutes`,
  and generates `find_by_#{attribute}_reset_token` +
  `find_by_#{attribute}_reset_token!` class methods plus
  `#{attribute}_reset_token` instance method. No mention anywhere in
  our file.
- Blocked by absence of `generates_token_for` in our
  `ActiveRecord`/`MessageVerifier` stack — land that first, then wire
  this in. Document as blocked until the prerequisite exists.

Methods touched: `hasSecurePassword` opts (`resetToken: boolean`),
instance `#{attribute}ResetToken`, class
`findBy#{Attribute}ResetToken` + `!` variant.

---

## PR 24 — `Lint` as a MiniTest-style mixin (separate PR, behavioral)

- Rails `lint.rb` exposes `ActiveModel::Lint::Tests` — a module mixed
  into a MiniTest class; its `test_*` methods become runnable tests
  (`assert_*` based contract checks).
- Ours `lint.ts` (97 lines) is a free-function checker. Users can't
  include the module in their own test class and inherit the suite.
- Port by exporting a Vitest-friendly `describeLint(ModelClass)` that
  declares the equivalent `it` blocks.

Methods touched: ~6 `assert_*` equivalents.

---

## PR 25 — `NestedError` `:type` override + options merge (1 method)

- `TS nested-error.ts:19-28` constructor accepts only
  `options?: { attribute?: string }`. Rails
  `nested_error.rb:8-15` also accepts `:type`
  (`@type = override_options.fetch(:type) { inner_error.type }`).
  Ours additionally passes `innerError.rawType ?? innerError.type` into
  super and ignores any caller-supplied type.
- Fix: accept `{ attribute?, type? }` and forward `type` override to
  `super`.

Methods touched: `NestedError#constructor`.

---

## PR 26 — `misc.test.ts` redistribution (test-layout only)

`TS packages/activemodel/src/misc.test.ts` is 3,031 lines in one
`describe("ActiveModel")`. `test:compare` currently still passes (see
headline) because the matcher tolerates it, but layout-matching will
tighten. Moves are deterministic from the top-level inner `describe`
blocks:

| Inner `describe` (line)                                                                              | Target file                               |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Attributes` (8)                                                                                     | `attributes.test.ts`                      |
| `Validations > presence/absence/length/…` (131+)                                                     | `validations/<name>.test.ts`              |
| `Dirty Tracking` (570)                                                                               | `dirty.test.ts`                           |
| `Callbacks` (675) + `Callbacks (extended)` (1127)                                                    | `callbacks.test.ts`                       |
| `Serialization` (779)                                                                                | `serialization.test.ts`                   |
| `Types > Date/DateTime/Decimal/Registry` (855+)                                                      | `type/<name>.test.ts`                     |
| `Validators (extended)` (979)                                                                        | `validations/<name>.test.ts`              |
| `ComparisonValidator` (1233)                                                                         | `validations/comparison.test.ts`          |
| `UuidType` (1389) / `JsonType` (1454)                                                                | `type/uuid.test.ts` / `type/json.test.ts` |
| `afterCommit / afterRollback` (1509)                                                                 | `callbacks.test.ts`                       |
| `attributeBeforeTypeCast` (1535) / `willSaveChangeToAttribute` (1562) / `attributeInDatabase` (1592) | `dirty.test.ts`                           |
| `hasAttribute` (1636)                                                                                | `attribute-methods.test.ts`               |
| `validatesEach` (1652) / `validatesWith` (1700)                                                      | `validations.test.ts`                     |
| `clearChangesInformation` (1781)                                                                     | `dirty.test.ts`                           |

**Do not rename tests** (per CLAUDE.md — names drive `test:compare`).
Split this PR per target file if reviews demand — each column can land
independently.

---

## Triage order (recommended)

Silent correctness first, then public-API shape, then structure:

1. **PR 1** (`toParam`/`paramDelimiter`) — wrong URLs for unpersisted.
2. **PR 3** (`assignAttributes` → user setter) — extension point broken.
3. **PR 4** (`Errors.copy!` replace) — data corruption on non-empty.
4. **PR 7** (`validate`/`invalid?`/`validate!` shapes) — API contract.
5. **PR 9** (`ValidationError` I18n + `freeze`) — user-visible strings.
6. **PR 11** (`ModelName` namespace) — forms, routes, I18n keys.
7. **PR 10** (`_validators` hash shape) — small, perf + parity win.
8. **PR 5 / PR 6** (`Errors` options filtering + Enumerable) —
   ergonomic.
9. **PR 8** (`ValidationContext` array) — needed for AR contexts.
10. **PR 15–16** (Dirty parity) — large; drives AR integration.
11. **PR 18** (generic `setCallback`) — needed for plugins.
12. **PR 22a** (`BooleanType` FALSE_VALUES: remove "no"/"NO") — tiny
    but silent behavioral deviation; one-line fix.
13. **PR 22b** (`IntegerType` error class) — throws wrong `Error`
    subclass; one-line fix.
14. **PR 25** (`NestedError` `:type` override) — tiny, semantic.
15. **PR 12, 13, 14, 2, 17, 19, 20, 21, 22c–e, 23, 24, 26** —
    everything else.

---

## Appendix — files to read when picking a PR

- Rails pins are under
  `scripts/api-compare/.rails-source/activemodel/lib/active_model/`.
- Comparison JSON: `scripts/api-compare/output/api-comparison.json`
  (public) and `api-comparison-privates.json` (privates).
- Regenerate with `pnpm run api:compare --package activemodel` (+
  `--privates`).
