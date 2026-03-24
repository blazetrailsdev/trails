import { Type } from "./value.js";

export class JsonType extends Type<unknown> {
  readonly name = "json";

  cast(value: unknown): unknown | null {
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

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }
}
