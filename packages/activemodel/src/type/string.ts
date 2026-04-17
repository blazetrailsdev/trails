import { Type } from "./value.js";

import { ImmutableStringType } from "./immutable-string.js";

export class StringType extends Type<string> {
  readonly name: string = "string";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
  }

  serialize(value: unknown): unknown {
    return this.cast(value);
  }

  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    if (rawOldValue === null || rawOldValue === undefined)
      return newValue !== null && newValue !== undefined;
    return String(rawOldValue) !== String(newValue);
  }

  toImmutableString(): ImmutableStringType {
    return new ImmutableStringType({
      precision: this.precision,
      scale: this.scale,
      limit: this.limit,
    });
  }
}
