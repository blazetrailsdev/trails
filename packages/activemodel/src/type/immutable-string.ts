import { ValueType } from "./value.js";

export interface ImmutableStringTypeOptions {
  precision?: number;
  scale?: number;
  limit?: number;
  trueString?: string;
  falseString?: string;
}

export class ImmutableStringType extends ValueType<string> {
  readonly name: string = "immutable_string";
  readonly trueString: string;
  readonly falseString: string;

  constructor(options?: ImmutableStringTypeOptions) {
    super(options);
    this.trueString = options?.trueString ?? "t";
    this.falseString = options?.falseString ?? "f";
  }

  type(): string {
    return "string";
  }

  serialize(value: unknown): unknown {
    return this.cast(value);
  }

  serializeCastValue(value: string | null): string | null {
    return value;
  }

  /**
   * Mirrors: ActiveModel::Type::ImmutableString#cast_value
   * (immutable_string.rb):
   *
   *   case value
   *   when true  then @true
   *   when false then @false
   *   else value.to_s.freeze
   *   end
   *
   * @internal Rails-private helper.
   */
  protected castValue(value: unknown): string | null {
    if (value === true) return Object.freeze(this.trueString) as string;
    if (value === false) return Object.freeze(this.falseString) as string;
    const str = String(value);
    return Object.freeze(str) as string;
  }
}
