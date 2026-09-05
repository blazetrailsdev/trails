import { MutableModule, ValueType, type Mutable } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { StringKeyedHashAccessor } from "../store.js";

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (activerecord/lib/active_record/type/json.rb:6); the class/interface merge is how `include()` surfaces on the type side.
export class Json extends ValueType<unknown> {
  override type(): string {
    return "json";
  }

  accessor(): typeof StringKeyedHashAccessor {
    return StringKeyedHashAccessor;
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

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return !jsonEqual(this.deserialize(rawOldValue), newValue);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge carries `include ActiveModel::Type::Helpers::Mutable`'s members onto the class; it declares none of its own.
export interface Json extends Mutable {}

include(Json, MutableModule);
