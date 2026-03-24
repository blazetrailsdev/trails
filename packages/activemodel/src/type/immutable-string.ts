import { Type } from "./value.js";

export class ImmutableStringType extends Type<string> {
  readonly name = "immutable_string";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value);
    return Object.freeze(str) as string;
  }
}
