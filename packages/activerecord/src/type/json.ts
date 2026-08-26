/**
 * Mirrors: ActiveRecord::Type::Json
 */
import { ValueType } from "@blazetrails/activemodel";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { StringKeyedHashAccessor } from "../store.js";

/**
 * Ruby `Hash#==` / `Array#==` over decoded JSON, which JS has no operator for:
 * two hashes with the same pairs are equal whatever order the keys were
 * written in. Re-encoding both sides and comparing strings is NOT the same
 * test — it reports a key reordering as a change.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (globalThis.Array.isArray(a) || globalThis.Array.isArray(b)) {
    if (!globalThis.Array.isArray(a) || !globalThis.Array.isArray(b)) return false;
    return a.length === b.length && a.every((el, i) => jsonEqual(el, b[i]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(b, k) &&
        jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

export class Json extends ValueType<unknown> {
  // Widened to string (not literal) so Jsonb can override to "jsonb".
  readonly name: string = "json";

  /**
   * Mirrors: ActiveRecord::Type::Json#type
   */
  override type(): string {
    return "json";
  }

  /**
   * Returns the accessor class used by Store for JSON columns.
   *
   * Mirrors: ActiveRecord::Type::Json#accessor
   */
  accessor(): typeof StringKeyedHashAccessor {
    return StringKeyedHashAccessor;
  }

  cast(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    return this.deserialize(this.serialize(value));
  }

  deserialize(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        return ActiveSupportJSON.decode(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  serialize(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return ActiveSupportJSON.encode(value);
  }

  override isMutable(): boolean {
    return true;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return !jsonEqual(this.deserialize(rawOldValue), newValue);
  }
}
