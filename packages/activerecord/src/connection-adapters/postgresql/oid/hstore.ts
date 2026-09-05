import { ValueType } from "@blazetrails/activemodel";

import { StringKeyedHashAccessor } from "../../../store.js";

const HSTORE_ERROR = "Invalid Hstore document: %s";

export class Hstore extends ValueType<Record<string, string | null>> {
  override type(): string {
    return "hstore";
  }

  override isMutable(): boolean {
    return true;
  }

  accessor(): typeof StringKeyedHashAccessor {
    return StringKeyedHashAccessor;
  }

  cast(value: unknown): Record<string, string | null> | null {
    if (value == null) return null;
    const serialized = this.serialize(value);
    if (typeof serialized !== "string") return null;
    return this.deserialize(serialized);
  }

  /** @missingRailsCall new — PERMANENT */
  override deserialize(value: unknown): Record<string, string | null> | null {
    if (value == null) return null;
    if (typeof value !== "string") {
      return value as Record<string, string | null>;
    }
    if (value.trim() === "") return {};
    return parseHstoreString(value);
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (isPlainObject(value)) {
      const hash = value as Record<string, unknown>;
      return Object.entries(hash)
        .map(([k, v]) => `${escapeHstore(k)}=>${escapeHstore(v as string | null)}`)
        .join(", ");
    }
    if (typeof value === "string") return value;
    return null;
  }

  override isChanged(oldValue: unknown, newValue: unknown, _rawValue?: unknown): boolean {
    if (oldValue == null && newValue == null) return false;
    if (oldValue == null || newValue == null) return true;
    return !hashesEqual(oldValue as Record<string, unknown>, newValue as Record<string, unknown>);
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldHash = this.deserialize(rawOldValue);
    if (oldHash == null && newValue == null) return false;
    if (oldHash == null || newValue == null) return true;
    return !hashesEqual(oldHash, newValue as Record<string, unknown>);
  }
}

function isPlainObject(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hashesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function parseHstore(input: string): Record<string, string | null> {
  if (!input || input.trim() === "") return {};
  return parseHstoreString(input);
}

export function serializeHstore(obj: Record<string, string | null>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${escapeHstore(k)}=>${escapeHstore(v)}`)
    .join(", ");
}

/** @internal */
function escapeHstore(value: string | null | undefined): string {
  if (value == null) return "NULL";
  if (value === "") return '""';
  return `"${String(value).replace(/(["\\])/g, "\\$1")}"`;
}

function parseHstoreString(value: string): Record<string, string | null> {
  const hash: Record<string, string | null> = {};
  let i = 0;

  while (i < value.length) {
    if (value[i] !== '"') throw hstoreError(value);
    i += 1;

    const keyStart = i;
    while (i < value.length && value[i] !== '"') {
      if (value[i] === "\\" && i + 1 < value.length) i += 2;
      else i += 1;
    }
    if (i >= value.length) throw hstoreError(value);
    const rawKey = value.slice(keyStart, i);
    i += 1;

    if (value[i] !== "=" || value[i + 1] !== ">") throw hstoreError(value);
    i += 2;

    let rawValue: string | null;
    if (value.slice(i, i + 4) === "NULL") {
      rawValue = null;
      i += 4;
    } else {
      if (value[i] !== '"') throw hstoreError(value);
      i += 1;
      const valueStart = i;
      while (i < value.length && value[i] !== '"') {
        if (value[i] === "\\" && i + 1 < value.length) i += 2;
        else i += 1;
      }
      if (i >= value.length) throw hstoreError(value);
      rawValue = unescapeHstore(value.slice(valueStart, i));
      i += 1;
    }

    hash[unescapeHstore(rawKey)] = rawValue;

    if (i < value.length) {
      if (value[i] !== "," || value[i + 1] !== " ") throw hstoreError(value);
      i += 2;
    }
  }

  return hash;
}

function unescapeHstore(raw: string): string {
  return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function hstoreError(input: string): Error {
  return new Error(HSTORE_ERROR.replace("%s", JSON.stringify(input)));
}
