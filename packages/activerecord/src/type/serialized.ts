import { Type, ValueType, BinaryData } from "@blazetrails/activemodel";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { IndifferentHashAccessor } from "../store.js";

/** @internal */
function isValueComparable(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value instanceof HashWithIndifferentAccess) return true;
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  return false;
}

/** @internal */
/** @internal */
function hasEquals(value: unknown): value is { equals(other: unknown): boolean } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { equals?: unknown }).equals === "function"
  );
}

function hasValueEquality(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const valueOf = (value as { valueOf?: unknown }).valueOf;
  if (typeof valueOf !== "function") return false;
  const primitive = valueOf.call(value);
  return primitive !== value && (primitive === null || typeof primitive !== "object");
}

/** @internal */
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

/** @internal */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @internal */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isValueComparable(a) && isValueComparable(b)) return collectionsEqual(a, b);
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

/** @internal */
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
  return valuesEqual(a, b);
}

/** @noRailsEquivalent PERMANENT */
export interface Coder {
  dump(value: unknown): string | null;
  load(value: unknown): unknown;
  objectClass?: new (...args: any[]) => any;
  assertValidValue?(value: unknown, options: { action: string }): void;
}

export class Serialized extends ValueType {
  readonly name = "serialized";
  readonly subtype: Type;
  readonly coder: Coder;

  constructor(subtype: Type, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
  }

  accessor(): unknown {
    return IndifferentHashAccessor;
  }

  deserialize(value: unknown): unknown {
    if (this.isDefaultValue(value)) return value;
    const deserialized = this.subtype.deserialize?.(value) ?? value;
    const forCoder =
      this.subtype.type?.() === "binary" && deserialized instanceof Uint8Array
        ? Buffer.from(deserialized).toString("utf8")
        : deserialized;
    return this.coder.load(forCoder);
  }

  cast(value: unknown): unknown {
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

  override isMutable(): boolean {
    return true;
  }

  override isBinary(): boolean {
    return this.subtype.isBinary();
  }

  private isDefaultValue(value: unknown): boolean {
    return valuesEqual(value ?? null, this.coder.load(null) ?? null);
  }

  private encoded(value: unknown): unknown {
    if (this.isDefaultValue(value)) return undefined;
    const payload = this.coder.dump(value);
    if (payload && this.subtype.isBinary()) {
      return new BinaryData(payload);
    }
    return payload;
  }
}
