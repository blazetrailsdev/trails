import { ValueType } from "./value.js";

export interface ImmutableStringTypeOptions {
  precision?: number;
  scale?: number;
  limit?: number;
  true?: string;
  false?: string;
}

export class ImmutableStringType extends ValueType<string> {
  readonly name: string = "immutable_string";
  readonly true: string;
  readonly false: string;

  constructor(options?: ImmutableStringTypeOptions) {
    super(options);
    this.true = options?.true ?? "t";
    this.false = options?.false ?? "f";
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
    if (value === true) return Object.freeze(this.true);
    if (value === false) return Object.freeze(this.false);
    const str = String(value);
    return Object.freeze(str);
  }
}
