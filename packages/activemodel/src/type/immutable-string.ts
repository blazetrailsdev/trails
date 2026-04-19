import { ValueType } from "./value.js";

export class ImmutableStringType extends ValueType<string> {
  readonly name: string = "immutable_string";

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
  }

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value);
    return Object.freeze(str) as string;
  }

  serialize(value: unknown): unknown {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  serializeCastValue(value: string | null): string | null {
    return value;
  }
}
