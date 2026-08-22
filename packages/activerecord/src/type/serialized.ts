import { Type, ValueType, BinaryData } from "@blazetrails/activemodel";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { IndifferentHashAccessor } from "../store.js";

/**
 * Whether a value is a Ruby collection whose `==` compares by structure:
 * `Array`, `Hash`, and our store's `HashWithIndifferentAccess`. An arbitrary
 * object (e.g. a custom class coder's `object_class` instance) has no `==` and
 * falls back to identity, so only plain arrays/objects and HWIA are
 * value-compared here.
 *
 * @internal
 */
function isValueComparable(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value instanceof HashWithIndifferentAccess) return true;
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  return false;
}

/**
 * Whether a non-collection object carries value-based equality, mirroring a
 * Ruby object whose `==` compares by value rather than identity (e.g.
 * `Date`/`Time`). The JS analog is an object whose `valueOf()` returns a
 * primitive other than the object itself: `Date.prototype.valueOf` yields a
 * number, whereas the default `Object.prototype.valueOf` returns `this` (so a
 * plain custom `object_class` instance falls through to reference equality,
 * matching Ruby's default `Object#==`).
 *
 * @internal
 */
/**
 * Whether a value exposes an explicit `equals(other)` method — our convention
 * for a Ruby object that overrides `==`. Used to dispatch change detection to
 * the value's own equality (e.g. ActiveSupport::TimeWithZone, which compares by
 * UTC instant across Date/Time-like operands) rather than a primitive fallback.
 *
 * @internal
 */
function hasEquals(value: unknown): value is { equals(other: unknown): boolean } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { equals?: unknown }).equals === "function"
  );
}

function hasValueEquality(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  // A null-prototype object (which isValueComparable treats as hash-like) does
  // not inherit Object.prototype.valueOf, so guard the lookup rather than
  // throwing when such a value reaches this fallback.
  const valueOf = (value as { valueOf?: unknown }).valueOf;
  if (typeof valueOf !== "function") return false;
  const primitive = valueOf.call(value);
  return primitive !== value && (primitive === null || typeof primitive !== "object");
}

/**
 * Unwraps `toHash()`-bearing objects (HashWithIndifferentAccess) so the wrapped
 * contents — not the Map-backed internal shape — drive comparison.
 *
 * @internal
 */
function unwrapHash(value: unknown): unknown {
  while (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toHash?: unknown }).toHash === "function"
  ) {
    value = (value as { toHash(): unknown }).toHash();
  }
  return value;
}

/**
 * Whether a value is a hash-like plain object — the same `Object.prototype` /
 * null-prototype shape `normalize` treats as an order-insensitive Hash.
 *
 * @internal
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Ruby value equality (`old_value == new_value`) as `Type::Value#changed?`
 * relies on it, dispatched by the operand's kind:
 *
 * - Collections (Array/Hash) compare structurally and order-insensitively via
 *   {@link collectionsEqual}, recursing back through this function so each
 *   element is compared by its own `==` — matching Ruby's `Hash#==`/`Array#==`.
 * - A value that defines an explicit `equals` (our convention for Ruby `==`,
 *   e.g. ActiveSupport::TimeWithZone) dispatches to it.
 * - A value object with a primitive `valueOf` (e.g. Date) compares by that
 *   primitive, but only against its own kind (shared constructor), mirroring a
 *   Ruby value type's `==` that only compares against its own class.
 * - Everything else falls back to `===`, so leaf primitives use identity and a
 *   `NaN` is never equal to itself — matching Ruby's non-reflexive
 *   `Float::NAN == Float::NAN == false` (a deterministic canonical key cannot
 *   express that).
 *
 * @internal
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isValueComparable(a) && isValueComparable(b)) return collectionsEqual(a, b);
  // Rails' `a == b` calls the *left* operand's `==`, so dispatch on `a` only.
  // Ruby's `==` never raises on a mismatched operand — `"x" == nil` is false —
  // so an `equals` that rejects the operand's type (Buffer#equals throws on a
  // non-Buffer) reports inequality rather than propagating.
  if (hasEquals(a)) {
    try {
      return a.equals(b);
    } catch {
      return false;
    }
  }
  if (
    hasValueEquality(a) &&
    hasValueEquality(b) &&
    (a as object).constructor === (b as object).constructor
  ) {
    return Object.is(
      (a as { valueOf(): unknown }).valueOf(),
      (b as { valueOf(): unknown }).valueOf(),
    );
  }
  return false;
}

/**
 * Structural, order-insensitive deep equality for Array/Hash values, unwrapping
 * `toHash()`-bearing objects (HashWithIndifferentAccess) and comparing each
 * element through {@link valuesEqual} so nested value objects get the same
 * equality dispatch as top-level ones.
 *
 * @internal
 */
function collectionsEqual(aRaw: unknown, bRaw: unknown): boolean {
  const a = unwrapHash(aRaw);
  const b = unwrapHash(bRaw);
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
    return a.every((v, i) => valuesEqual(v, b[i]));
  }
  const aObj = isPlainObject(a);
  const bObj = isPlainObject(b);
  if (aObj || bObj) {
    if (!aObj || !bObj) return false;
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => valuesEqual(a[k], b[k]));
  }
  // An HWIA whose toHash() unwrapped to a non-collection: compare as values.
  return valuesEqual(a, b);
}

/**
 * The duck type `Serialized` requires of its coder — Rails' `coder` is any
 * object answering `dump`/`load` (`ActiveRecord::Coders::YAMLColumn`,
 * `Coders::JSON`, or a user object); the `Coders` module names no such shape.
 *
 * @noRailsEquivalent PERMANENT — name collision only. Ruby's `Coder`
 * (`ActiveSupport::Cache::Coder`) serializes cache entries, not column values.
 */
export interface Coder {
  dump(value: unknown): string | null;
  load(value: unknown): unknown;
  objectClass?: new (...args: any[]) => any;
  assertValidValue?(value: unknown, options: { action: string }): void;
}

/**
 * A type that wraps another type with a serialization coder. Values are
 * serialized through the coder before being stored and deserialized when
 * loaded.
 *
 * Mirrors: ActiveRecord::Type::Serialized
 */
export class Serialized extends ValueType {
  readonly name = "serialized";
  readonly subtype: Type;
  readonly coder: Coder;

  constructor(subtype: Type, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
  }

  // Rails: Type::Serialized#accessor returns Store::IndifferentHashAccessor.
  accessor(): unknown {
    return IndifferentHashAccessor;
  }

  deserialize(value: unknown): unknown {
    if (this.isDefaultValue(value)) return value;
    const deserialized = this.subtype.deserialize?.(value) ?? value;
    // Rails: binary subtypes (bytea) return a binary-encoded Ruby String; JS
    // returns a Uint8Array. BinaryType.serialize pipes coder.dump() output
    // through TextEncoder (UTF-8), so the bridge must invert with UTF-8 to
    // recover the string coder.load() expects. Gated on `type()`, not
    // `isBinary()`: an EncryptedAttributeType subtype (encrypts-then-serialize
    // nesting) delegates `type` — but NOT `binary?` — to its binary cast type
    // (encrypted_attribute_type.rb:16, value.rb:77-79), and its deserialize
    // yields the cast type's bytes, which need the same inversion.
    const forCoder =
      this.subtype.type?.() === "binary" && deserialized instanceof Uint8Array
        ? Buffer.from(deserialized).toString("utf8")
        : deserialized;
    return this.coder.load(forCoder);
  }

  cast(value: unknown): unknown {
    // Rails: ActiveModel::Type::Helpers::Mutable#cast is always
    // `deserialize(serialize(value))`. Serializing first means a value the
    // coder can't round-trip (e.g. a non-Hash string like "somedata" through
    // IndifferentCoder) is normalized by `serialize` into a valid payload
    // rather than fed raw into `coder.load`, which would raise on JSON.parse.
    return this.deserialize(this.serialize(value));
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (this.isDefaultValue(value)) return null;
    const dumped = this.coder.dump(value);
    if (this.subtype.serialize) {
      return this.subtype.serialize(dumped);
    }
    return dumped;
  }

  // Rails' Type::Serialized inherits `changed?` from Type::Value, which is
  // `old_value != new_value`. In Ruby that `!=` is value equality, so two
  // structurally-equal deserialized collections (e.g. the `[]` Array default
  // an explicit `nil` assignment casts to vs. the record's original `[]`) are
  // not a change. JS `!==` is reference equality and would flag them as
  // changed, marking `Topic.new(content: nil)` dirty. `valuesEqual` restores
  // Ruby's `old_value == new_value` — order-insensitive `Hash#==`/`Array#==`
  // that recurses into each element's own `==`, explicit `equals` dispatch for
  // value-== objects, primitive `valueOf` comparison for value types like Date,
  // and `===` on leaf primitives so a `NaN` is never equal to itself (Ruby's
  // non-reflexive `Float::NAN == Float::NAN == false`). The try/catch guards
  // against a pathological cyclic value: report changed rather than throw.
  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    try {
      return !valuesEqual(oldValue, newValue);
    } catch {
      return true;
    }
  }

  override isChangedInPlace(rawOldValue: unknown, value: unknown): boolean {
    if (value === null || value === undefined) return false;
    const rawNewValue = this.encoded(value);
    const oldNil = rawOldValue === null || rawOldValue === undefined;
    const newNil = rawNewValue === null || rawNewValue === undefined;
    return (
      oldNil !== newNil || (this.subtype.isChangedInPlace?.(rawOldValue, rawNewValue) ?? false)
    );
  }

  assertValidValue(value: unknown): void {
    if (this.coder.assertValidValue) {
      this.coder.assertValidValue(value, { action: "serialize" });
    }
  }

  override isForceEquality(value: unknown): boolean {
    return this.coder.objectClass !== undefined && value instanceof this.coder.objectClass;
  }

  override isSerialized(): boolean {
    return true;
  }

  // Rails: Type::Serialized includes ActiveModel::Type::Helpers::Mutable.
  override isMutable(): boolean {
    return true;
  }

  // Rails: Serialized uses DelegateClass so binary? delegates to subtype automatically.
  override isBinary(): boolean {
    return this.subtype.isBinary();
  }

  private isDefaultValue(value: unknown): boolean {
    // Ruby has one nil; `undefined` and `null` both stand for it here, and
    // `valuesEqual` (a `===` fallback on leaves) would not equate them.
    const nilNormalized = value === undefined ? null : value;
    const coderDefault = this.coder.load(null);
    return valuesEqual(nilNormalized, coderDefault === undefined ? null : coderDefault);
  }

  /**
   * Mirrors: ActiveRecord::Type::Serialized#encoded (serialized.rb:66-73,
   * private) — the coder-dumped payload of a non-default value, used by
   * `changed_in_place?`.
   */
  private encoded(value: unknown): unknown {
    if (this.isDefaultValue(value)) return undefined;
    const payload = this.coder.dump(value);
    if (payload && this.subtype.isBinary()) {
      return new BinaryData(payload);
    }
    return payload;
  }
}
