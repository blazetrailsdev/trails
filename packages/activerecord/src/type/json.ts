/**
 * Mirrors: ActiveRecord::Type::Json
 */
import { Type } from "@blazetrails/activemodel";

export class Json extends Type<unknown> {
  readonly name = "json";

  cast(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  deserialize(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  serialize(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const json = JSON.stringify(value);
    return json === undefined ? null : json;
  }

  changedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return this.serialize(this.deserialize(rawOldValue)) !== this.serialize(newValue);
  }
}
