import { ArgumentError, ValueType } from "@blazetrails/activemodel";
import { stringInspect } from "@blazetrails/ruby-compat";

import { StringKeyedHashAccessor } from "../../../store.js";

const ERROR = "Invalid Hstore document: %s";

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

  override deserialize(value: unknown): Record<string, string | null> | null {
    if (typeof value !== "string") return value as Record<string, string | null> | null;

    const string = value;
    let pos = 0;
    const scan = (pattern: RegExp): string | null => {
      pattern.lastIndex = pos;
      const match = pattern.exec(string);
      if (match === null) return null;
      pos = pattern.lastIndex;
      return match[0];
    };
    const hash: Record<string, string | null> = {};

    while (pos < string.length) {
      if (scan(/"/y) === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
      }

      let key = scan(/(\\[\\"]|[^\\"])*?(?=")/y);
      if (key === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
      }

      if (scan(/"=>?/y) === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
      }

      if (scan(/NULL/y) !== null) {
        value = null;
      } else {
        if (scan(/"/y) === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
        }

        value = scan(/(\\[\\"]|[^\\"])*?(?=")/y);
        if (value === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
        }

        if (scan(/"/y) === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
        }
      }

      key = key.replaceAll('\\"', '"').replaceAll("\\\\", "\\");

      if (value !== null) {
        value = (value as string).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
      }

      hash[key] = value as string | null;

      if (scan(/, /y) === null && pos < string.length) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(string)));
      }
    }

    return hash;
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

/** @internal */
function escapeHstore(value: string | null | undefined): string {
  if (value == null) return "NULL";
  if (value === "") return '""';
  return `"${String(value).replace(/(["\\])/g, "\\$1")}"`;
}
