import { Type, ValueType, BinaryData } from "@blazetrails/activemodel";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { IndifferentHashAccessor } from "../store.js";

/**
 * Whether a value is compared against the coder default by structural value
 * rather than identity. Rails' `default_value?` is `value == coder.load(nil)`:
 * built-in collection defaults (`Array`/`Hash`, and our store's
 * `HashWithIndifferentAccess`) have value-based `==`, but an arbitrary coder
 * object (e.g. a custom class coder's `object_class` instance) has no `==` and
 * so falls back to identity. We mirror that — only plain arrays/objects and
 * HWIA are value-compared; everything else uses reference equality.
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
 * Structural JSON key used to compare a value against the coder's default.
 * Unwraps objects that expose `toHash()` (the HashWithIndifferentAccess
 * interface) so their contents — not their Map-backed internal shape — drive
 * the comparison.
 *
 * Object keys are emitted in sorted order so that two content-equal hashes
 * built with keys in a different insertion order canonicalize identically —
 * matching Ruby's order-insensitive `Hash#==` (the semantics `Type::Value#==`
 * relies on for change detection). `JSON.stringify` iterates keys in insertion
 * order, so the normalization has to happen before stringifying rather than in
 * a replacer.
 *
 * @internal
 */
function canonicalKey(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/**
 * Sentinel prefix for values `JSON.stringify` cannot represent and would
 * otherwise collapse to `null` (or drop entirely): `undefined`, `NaN`, and the
 * infinities. Tagging them keeps `canonicalKey` injective across these cases so
 * change detection distinguishes them from an actual `null`, matching Ruby's
 * `Hash#==` (where `nil`, `Float::NAN`, and a missing key are all distinct).
 * This also fixes latent default detection: `{ a: undefined }` used to
 * stringify to `{}` and so falsely matched the empty-hash coder default.
 *
 * The leading NUL keeps the tag from colliding with an ordinary string value —
 * JSON payloads do not carry raw control characters — so a real string can
 * never masquerade as an encoded `undefined`/`NaN`.
 *
 * Note: `canonicalKey` is a _deterministic_ string, so two distinct `NaN`
 * values canonicalize identically. That is fine for default detection (a coder
 * default never contains `NaN`), but change detection needs Ruby's non-reflexive
 * `Float::NAN == Float::NAN == false`; `isChanged` therefore compares Hash
 * values structurally via {@link valuesEqual} rather than by canonical key.
 *
 * @internal
 */
const NONSERIALIZABLE_SENTINEL = "\u0000serialized:";

// Global-registry copy of encryption's ADDITIONAL_VALUE_BRAND
// (encrypted-attribute-type.ts). Resolved via Symbol.for rather than an
// import because encrypted-attribute-type.ts imports this module — the same
// cycle the brand exists to break.
const ADDITIONAL_VALUE_BRAND = Symbol.for("activerecord.encryption.AdditionalValue");

function isAdditionalValue(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ADDITIONAL_VALUE_BRAND] === true
  );
}

/**
 * Recursively unwraps `toHash()`-bearing objects and sorts plain-object keys so
 * the resulting structure has a canonical, insertion-order-independent shape.
 *
 * @internal
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return `${NONSERIALIZABLE_SENTINEL}undefined`;
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `${NONSERIALIZABLE_SENTINEL}${String(value)}`;
  }
  if (value === null || typeof value !== "object") return value;
  if (typeof (value as { toHash?: unknown }).toHash === "function") {
    return normalize((value as { toHash(): unknown }).toHash());
  }
  if (Array.isArray(value)) return value.map(normalize);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = normalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
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
  if (hasEquals(a)) return a.equals(b);
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

export interface Coder {
  dump(value: unknown): string | null;
  load(value: unknown): unknown;
  objectClass?: new (...args: any[]) => any;
  assertValidValue?(value: unknown): void;
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

  private _defaultValue: unknown;
  private _defaultValueJson: string | undefined;

  constructor(subtype: Type, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
    this._defaultValue = coder.load(null);
    if (isValueComparable(this._defaultValue)) {
      try {
        this._defaultValueJson = canonicalKey(this._defaultValue);
      } catch {
        this._defaultValueJson = undefined;
      }
    }
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
    // Encryption AdditionalValues pass through cast unchanged so serialize()
    // can unwrap them — the same contract as EncryptedAttributeType.cast,
    // needed here because a Serialized(Encrypted(...)) attribute's resolved
    // type is this wrapper.
    if (isAdditionalValue(value)) return value;
    // Rails: ActiveModel::Type::Helpers::Mutable#cast is always
    // `deserialize(serialize(value))`. Serializing first means a value the
    // coder can't round-trip (e.g. a non-Hash string like "somedata" through
    // IndifferentCoder) is normalized by `serialize` into a valid payload
    // rather than fed raw into `coder.load`, which would raise on JSON.parse.
    return this.deserialize(this.serialize(value));
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    // Unwrap encryption AdditionalValues to their pre-computed ciphertext
    // instead of feeding the AV object to the coder — mirrors Rails'
    // ExtendedEncryptableType prepend on the bare EncryptedAttributeType. The
    // AV-wrapped current-scheme value is a trails invention (Rails keeps the
    // plaintext raw), so the wrapper type must honor it too.
    if (isAdditionalValue(value)) return (value as { value: unknown }).value;
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
    const rawNewValue = encoded(this, value);
    const oldNil = rawOldValue === null || rawOldValue === undefined;
    const newNil = rawNewValue === null || rawNewValue === undefined;
    return (
      oldNil !== newNil || (this.subtype.isChangedInPlace?.(rawOldValue, rawNewValue) ?? false)
    );
  }

  assertValidValue(value: unknown): void {
    if (this.coder.assertValidValue) {
      this.coder.assertValidValue(value);
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
    if (value === this._defaultValue) return true;
    if (value === null || value === undefined)
      return this._defaultValue === null || this._defaultValue === undefined;
    if (typeof value === "object" && this._defaultValueJson !== undefined) {
      try {
        return canonicalKey(value) === this._defaultValueJson;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Returns the encoded (serialized) representation of a value, or undefined
 * if the value equals the default. Used for changed_in_place? detection.
 *
 * Mirrors: ActiveRecord::Type::Serialized#encoded (private)
 *
 * @internal
 */
export function encoded(serialized: Serialized, value: unknown): unknown {
  // Use the constructor-cached default to avoid calling coder.load(null) again,
  // which would produce a fresh object on every call and break reference equality.
  const s = serialized as any;
  const defaultVal = s._defaultValue;
  if (value === defaultVal) return undefined;
  if (typeof value === "object" && value !== null && s._defaultValueJson !== undefined) {
    try {
      if (canonicalKey(value) === s._defaultValueJson) return undefined;
    } catch {
      // non-serializable; treat as non-default
    }
  }
  const payload = serialized.coder.dump(value);
  // Rails: if payload && subtype.binary? → ActiveModel::Type::Binary::Data.new(payload)
  if (
    payload &&
    ((serialized.subtype as any).binary?.() ?? (serialized.subtype as any).isBinary?.())
  ) {
    return new BinaryData(payload);
  }
  return payload;
}
