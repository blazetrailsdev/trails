import { ValueType } from "./value.js";

export class ImmutableStringType extends ValueType<string> {
  readonly name: string = "immutable_string";

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
  }

  /**
   * Mirrors: ActiveModel::Type::ImmutableString#cast_value
   * (immutable_string.rb):
   *
   *   case value
   *   when true  then "t"
   *   when false then "f"
   *   else value.to_s
   *   end
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): string | null {
    if (value === true) return Object.freeze("t") as string;
    if (value === false) return Object.freeze("f") as string;
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
