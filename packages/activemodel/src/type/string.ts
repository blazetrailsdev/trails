import { Type } from "./value.js";

export class StringType extends Type<string> {
  readonly name = "string";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
  }
}
