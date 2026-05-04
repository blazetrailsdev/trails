# ActiveModel Type Audit

Date: 2026-05-02 (verified pass)
Scope: type entry + value/string/immutable_string/integer/big_integer/float/decimal/boolean/binary/date/date-time/time/registry + helpers + serialize_cast_value.

Trails source: `packages/activemodel/src/type/`
Rails source: `scripts/api-compare/.rails-source/activemodel/lib/active_model/type/`

All findings re-verified against current source. False positives from the prior pass are listed in **Verification notes** at the bottom.

---

## 1. `type.ts` → `type.rb`

**Notable**

- `register(name, factory)` is single-arg `factory: () => Type` (`type.ts:10`). Rails `type.rb:30` `register(type_name, klass = nil, &block)` accepts a class and threads constructor args at lookup time (variadic via `ruby2_keywords`); `lookup(name, **options)` config-at-lookup is therefore not supported.
- Registry exposed read-only — frozen singleton, no setter (`type.ts:6`). Rails exposes `registry` as mutable `attr_accessor` (`type.rb:26`); used by AR for wholesale registry replacement.
- Trails pre-registers `value` (sane fallback) not in Rails activemodel; `uuid`/`json`/`array` were removed in P25 (now live in AR's PG OID layer).

---

## 2. `type/value.ts` → `type/value.rb`

**Critical**

- **`equals` only compares constructor.** Rails `value.rb:121-126` compares `self.class`, `precision`, `scale`, `limit`. TS `value.ts:192-194` only `this.constructor === other.constructor`. Two types with different `precision`/`scale`/`limit` incorrectly compare equal.

**Notable**

- `serializable?` block-arg form not supported (`value.ts:142`). Rails `value.rb:28` `serializable?(value, &_)` yields the cast value.
- `type` returns `this.name` ("value" for base) (`value.ts:57`). Rails `value.rb:34` returns `nil` for the base; subclasses override with Symbol.
- `map(value)` no callback (`value.ts:170`). Rails `value.rb:117` accepts a block.
- `hash` method absent (cosmetic — JS objects don't use the same hash protocol).

---

## 3. `type/string.ts` → `type/string.rb`

**Critical**

- **`isChangedInPlace` always coerces non-string with `String()`.** Rails `string.rb:16-20` returns `nil` (falsey) when `new_value` is not a `::String`. TS `string.ts:23-27` always coerces — non-string new values can spuriously report a change.

**Notable**

- `castValue` returns string as-is (`string.ts:13`). Rails `string.rb:33-39` returns `::String.new(value)` (fresh mutable copy). No JS impact (immutable strings).
- `toImmutableString` doesn't pass `true:`/`false:` options (`string.ts:30-35`) — see §4.

---

## 4. `type/immutable-string.ts` → `type/immutable_string.rb`

**Critical**

- **`true:`/`false:` keyword args missing.** Rails `immutable_string.rb:38-41` accepts `true:` / `false:` (custom boolean strings). TS `immutable-string.ts:6-8` only `{precision, scale, limit}` — feature absent.
- **`type()` returns `"immutable_string"`.** Rails `immutable_string.rb:44` returns `:string`. Schema-based lookups expecting `:string` break.

**Notable**

- `serialize` calls `cast` (`immutable-string.ts:29-31`). Rails `immutable_string.rb:48-55` switches on `Numeric|Symbol|Duration|true|false`. Practically equivalent under JS coercion.

---

## 5. `type/integer.ts` → `type/integer.rb`

**Notable**

- `serializable?` block-arg form absent (`integer.ts:37-53`). Rails `integer.rb:74-80` yields the out-of-range value; AR uses for richer errors.
- `castValue` uses `parseInt(String(value), 10)` (`integer.ts:21-23`) — `String(Symbol(...))` throws `TypeError`. Rails `integer.rb:89-91` rescues to `nil`.
- `Helpers::Numeric` mixin not consumed; `serialize` implemented directly (see §18).
- Range precomputed per call (`integer.ts:63-65`); Rails caches `@range` in init. Perf only.

---

## 6. `type/big-integer.ts` → `type/big_integer.rb`

**Critical**

- **Different cast path.** Rails `big_integer.rb:25-28` subclasses `Integer` — reuses Integer cast logic (`.to_i`). TS `big-integer.ts:3` extends `Type<bigint>` directly with `BigInt()` constructor — produces JS `bigint`, not Integer-via-Integer.
- **`serializeCastValue` returns string.** Rails `big_integer.rb:26` returns Integer as-is. TS `big-integer.ts:31-33` calls `.toString()`. Different wire format.
- **Plain object cast diverges.** Rails inherits Integer's `.to_i` (handles `{}` → 0). TS `big-integer.ts:6-24` returns null for non-bigint/string/number/boolean.

---

## 7. `type/float.ts` → `type/float.rb`

**Critical**

- **`"NaN"` string returns `null`.** Rails `float.rb:53-60` casts `"NaN"` → `Float::NAN`. TS `float.ts:7-11` uses `parseFloat("NaN")` → NaN → `isNaN` guard → `null`.
- **No `serialize` override.** Rails `float.rb` `include Helpers::Numeric` overrides `serialize` to call `cast`. TS `float.ts` has no override and the `Helpers::Numeric` mixin is never wired (see §18) — `serialize` returns value unchanged, no cast-on-serialize.

---

## 8. `type/decimal.ts` → `type/decimal.rb`

**Notable**

- `BIGDECIMAL_PRECISION = 18` default for non-Float Numerics absent (`decimal.rb:47`). TS lacks; non-Float Numerics get no precision unless configured.
- `convert_float_to_big_decimal` apply_scale order — TS deliberately deviates (inline doc).
- `type_cast_for_schema` uses `JSON.stringify`; Rails `value.to_s.inspect`. Equivalent for normal strings.

---

## 9. `type/boolean.ts` → `type/boolean.rb`

No JS-representable behavioral deviation. Symbol variants in Rails `FALSE_VALUES` not modeled (no JS Symbol literals for "false"/"f"). TS adds `0n` for SQLite bigint compat.

---

## 10. `type/binary.ts` → `type/binary.rb`

**Critical**

- **`cast` returns `Uint8Array`.** Rails `binary.rb:20-27` returns a String. Fundamental type difference (language-driven; downstream code must adapt).
- **`serialize` returns plain `Uint8Array`.** Rails `binary.rb:29-32` wraps in `Data` object. AR adapters depending on the `Data` wrapper would break.
- Rails `Data#==` compares against Strings; TS `Data` class lacks equality semantics.

---

## 11. `type/date.ts` → `type/date.rb`

**Critical**

- **Non-ISO date strings return `null`.** Rails `date.rb:57-63` uses `Date._parse(string, false)` — accepts "July 4, 2020". TS `date.ts:104-110` uses `Temporal.PlainDate.from` (ISO 8601 only).

**Notable**

- Duck-typed `respond_to?(:to_date)` not modeled. TS only handles `PlainDate`/`PlainDateTime`/native `Date`/strings.

---

## 12. `type/date-time.ts` → `type/date_time.rb`

**Notable**

- `applySecondsPrecision` not applied to non-string values on cast (`date-time.ts:19-26`). Rails `date_time.rb:54-58` does.
- TS defaults serialize precision to 6 when none set (`date-time.ts:65-77`); Rails has no such hardcoded default in activemodel.

---

## 13. `type/time.ts` → `type/time.rb`

**Critical**

- **Non-ISO time strings return `null`.** Rails `time.rb:69-83` prepends `"2000-01-01 "` and uses `Date._parse` (accepts "3pm"). TS `time.ts:8-21` uses `Temporal.PlainTime.from` (ISO 8601 only).

**Notable**

- `user_input_in_time_zone` divergence: Rails checks `time_hash[:hour]` presence; if missing, returns nil. TS may return zero-time result.

---

## 14. `type/registry.ts` → `type/registry.rb`

**Notable**

- `lookup(name)` doesn't accept extra args (`registry.ts:61-65`). Rails `registry.rb:23-31` passes them to the registration block (e.g. `lookup(:integer, limit: 8)`).
- No `initialize_copy` (Rails `registry.rb:10-12`). `dup` semantics absent.
- Throws plain `Error` (`registry.ts:63`); Rails raises `ArgumentError`.
- Pre-registers trails-only extensions in constructor.

---

## 15. `type/serialize-cast-value.ts` → `type/serialize_cast_value.rb`

**Notable**

- `serialize_cast_value_compatible?` computed lazily and memoized (`value.ts:114`); Rails computes eagerly at init.
- TS uses duck-typing without identity guard (`serialize-cast-value.ts:53-57`); Rails `serialize_cast_value.rb:25-35` uses `type.equal?` (identity) to defend against `DelegateClass` accidental delegation.

---

## 16. `type/helpers/accepts-multiparameter-time.ts` → `type/helpers/accepts_multiparameter_time.rb`

**Critical**

- **Per-type `defaults:` not supported.** Rails passes per-type defaults at module init (Time: `{1=>2000, 2=>1, 3=>1, 4=>0, 5=>0}`; DateTime: `{4=>0, 5=>0}`). TS `accepts-multiparameter-time.ts:70` hardcodes `[year=0, month=1, day=1, hour=0, minute=0, second=0]`. The `if (year === 0 && month <= 1 && day <= 1) return null` guard at `:71` then drops Time-type assignments without explicit year (Rails would default to 2000).

**Notable**

- Hash-detection stricter in TS (requires all keys be numeric strings); Rails just checks `is_a?(Hash)`.

---

## 17. `type/helpers/mutable.ts` → `type/helpers/mutable.rb`

**Critical**

- **`cast` round-trip missing.** Rails `mutable.rb:7-9` defines `cast(value) = deserialize(serialize(value))`. TS `MutableMixin` does not export a `cast`.
- **`changedInPlace` always returns `true`.** Rails `mutable.rb:14-16` compares `raw_old_value != serialize(new_value)`. TS `mutable.ts:22-24` returns true unconditionally → spurious dirty saves on every save cycle for mutable types.

---

## 18. `type/helpers/numeric.ts` → `type/helpers/numeric.rb`

**Critical**

- **Mixin disconnected.** TS `numeric.ts` exports `NumericMixin` + standalone fns but `IntegerType` / `FloatType` import nothing from this file (verified — no grep hits in either). Rails `numeric.rb:7-29` provides `cast`/`serialize` and `Integer`/`Float` `include Helpers::Numeric`.
- **No numeric-specific `changed?` override.** Rails `numeric.rb:31-34` overrides `changed?` calling `number_to_non_number?` / `equal_nan?`. TS types don't override `isChanged`. Helpers exist but unused.

**Notable**

- `NUMERIC_REGEX` differs in anchor (`^` vs `\A`); equivalent in single-line strings.

---

## 19. `type/helpers/time-value.ts` → `type/helpers/time_value.rb`

**Notable**

- `serializeTimeValue` calls `.toJSON()` directly (`time-value.ts:89-101`); Rails `time_value.rb:5-19` `serialize_cast_value` applies `apply_seconds_precision` first. Precision truncation absent in TS serialize path.
- `type_cast_for_schema` uses `JSON.stringify`; Rails `to_fs(:db).inspect`.
- `userInputInTimeZone` accepts a zone string param not in Rails signature.

---

## 20. `type/helpers/timezone.ts` → `type/helpers/timezone.rb`

**Notable**

- Module-level var with `setDefaultTimezone` (`timezone.ts:16-19`); Rails wires to `Time.zone_default` (full ASupport tz registry). Aliases like `"Eastern Time (US & Canada)"` not supported.
- Returns `"utc"|"local"` strings; Rails returns `:utc`/`:local` Symbols.

---

## Trails-Only Extensions (no Rails activemodel counterpart)

- `type/internal/` (DateInfinity sentinels) — used by `DateType` for PG infinity handling.
- `value` registry key — pre-registered as the sane fallback for unknown types.

---

## Verification notes — adjustments from prior pass

- §1: "Rails registers 11 built-in types at module load on the shared singleton" demoted from Critical — equivalent end state via constructor pre-registration; difference is timing/sharing only.
- §2: `asJson` divergence dropped — TS throws, Rails raises NoMethodError; equivalent intent.
- §3: "Rails uses `@true`/`@false`; TS hardcodes `t`/`f`" rolled into §4 (the keyword-args gap is the underlying cause).
- §5: "Rails `deserialize` short-circuits on blank" dropped — TS reaches null via cast; observable equivalence.
