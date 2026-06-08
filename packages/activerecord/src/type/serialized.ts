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
 * Structural JSON key used to compare a value against the coder's default.
 * Unwraps objects that expose `toHash()` (the HashWithIndifferentAccess
 * interface) so their contents — not their Map-backed internal shape — drive
 * the comparison.
 *
 * @internal
 */
function canonicalKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && typeof (v as { toHash?: unknown }).toHash === "function"
      ? (v as { toHash(): unknown }).toHash()
      : v,
  );
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
    // Rails: binary subtypes (bytea) return a binary-encoded Ruby String (all
    // 256 byte values preserved). JS returns a Uint8Array. Bridge via latin1
    // (bytes 0x00–0xFF → code points 0x0000–0x00FF, lossless) so coder.load()
    // receives a string matching what coder.dump() originally produced.
    const forCoder =
      this.subtype.isBinary() && deserialized instanceof Uint8Array
        ? Buffer.from(deserialized).toString("latin1")
        : deserialized;
    return this.coder.load(forCoder);
  }

  cast(value: unknown): unknown {
    // A string (or null) is treated as an already-encoded payload and
    // deserialized directly. A structured value (Hash/Array/coder object) is
    // round-tripped through the coder — `deserialize(serialize(value))` — so
    // assigning e.g. a class-coder instance loads back through the coder.
    // Mirrors ActiveModel::Type::Helpers::Mutable#cast for the structured case
    // while still accepting pre-serialized string assignments.
    if (value === null || value === undefined || typeof value === "string") {
      return this.deserialize(value);
    }
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
    // trails accepts pre-serialized string payloads on assignment (see `cast`),
    // so a raw string is not yet the decoded object the coder validates — the
    // coder's `load` re-validates the decoded result on read. Rails only sees
    // already-decoded objects here because its Mutable#cast never accepts a
    // raw payload, so it has no equivalent guard.
    if (typeof value === "string") return;
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
