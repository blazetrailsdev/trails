/**
 * PostgreSQL hstore type — key/value string hash.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Hstore.
 * Rails: `class Hstore < Type::Value; include Helpers::Mutable`.
 * Deserialize parses the PG text format into a Hash; serialize renders
 * a Hash back to the text format. changed_in_place? compares the
 * deserialized hashes so key-order churn doesn't mark the attribute
 * dirty.
 */

import { Type } from "@blazetrails/activemodel";

import { StringKeyedHashAccessor } from "../../../store.js";

const HSTORE_ERROR = "Invalid Hstore document: %s";

export class Hstore extends Type<Record<string, string | null>> {
  readonly name: string = "hstore";

  override type(): string {
    return "hstore";
  }

  override isMutable(): boolean {
    return true;
  }

  /**
   * Rails: `def accessor; ActiveRecord::Store::StringKeyedHashAccessor; end`.
   * Returns the Store accessor class that Rails' store DSL uses to
   * coerce symbol keys to string keys — matches PG's text-only hstore
   * key model.
   */
  accessor(): typeof StringKeyedHashAccessor {
    return StringKeyedHashAccessor;
  }

  /**
   * Rails' Helpers::Mutable overrides cast as `deserialize(serialize(value))`,
   * producing a fresh hash so in-place mutations on a subsequent value
   * don't leak into the attribute's cached representation.
   */
  cast(value: unknown): Record<string, string | null> | null {
    if (value == null) return null;
    const serialized = this.serialize(value);
    if (typeof serialized !== "string") return null;
    return this.deserialize(serialized);
  }

  override deserialize(value: unknown): Record<string, string | null> | null {
    if (value == null) return null;
    if (typeof value !== "string") {
      // Rails: `return value unless value.is_a?(::String)`.
      return value as Record<string, string | null>;
    }
    if (value.trim() === "") return {};
    return parseHstoreString(value);
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    // Rails: `if value.is_a?(::Hash)` — only treat plain objects as a Hash.
    // Date/Map/class instances are rejected by the else branch below
    // rather than stringified as an empty hstore.
    if (isPlainObject(value)) {
      const hash = value as Record<string, unknown>;
      return Object.entries(hash)
        .map(([k, v]) => `${escapeHstore(k)}=>${escapeHstore(v as string | null)}`)
        .join(", ");
    }
    // Rails' else branch returns value unchanged. Our declared return is
    // string | null, so pass through only when it's already a string;
    // anything else can't honestly satisfy the contract.
    if (typeof value === "string") return value;
    return null;
  }

  /**
   * Rails' Hstore#changed_in_place? compares hashes (not raw strings)
   * so key-order differences don't dirty the attribute.
   */
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

/**
 * Back-compat parser — direct string parse, used by the adapter-level
 * hstore test suite. Prefer `new Hstore().deserialize(value)` in new
 * code.
 */
export function parseHstore(input: string): Record<string, string | null> {
  if (!input || input.trim() === "") return {};
  return parseHstoreString(input);
}

/**
 * Back-compat serializer — direct object → string, used by the
 * adapter-level hstore test suite.
 */
export function serializeHstore(obj: Record<string, string | null>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${escapeHstore(k)}=>${escapeHstore(v)}`)
    .join(", ");
}

/**
 * Mirrors Rails' Hstore#escape_hstore:
 *   nil             → NULL
 *   ""              → "" (empty quoted string)
 *   "foo"           → quoted, with backslashes and double-quotes escaped
 */
function escapeHstore(value: string | null | undefined): string {
  if (value == null) return "NULL";
  if (value === "") return '""';
  return `"${String(value).replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * Token-by-token parser mirroring Rails' StringScanner-based approach
 * in Hstore#deserialize.
 */
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
