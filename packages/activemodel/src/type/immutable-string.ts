import { BigDecimal, Duration } from "@blazetrails/activesupport";
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

  /**
   * Mirrors: ActiveModel::Type::ImmutableString#serialize
   * (immutable_string.rb:52-58):
   *
   *   case value
   *   when ::Numeric, ::Symbol, ActiveSupport::Duration then value.to_s
   *   when true then @true
   *   when false then @false
   *   else super
   *   end
   *
   * `super` is Value#serialize — identity — so an Object, an Array or a Hash
   * comes straight back out (string_test.rb:17-23 pins that). A Ruby Symbol is
   * a `":name"` string in trails, and the leading colon is the discriminator
   * the `when ::Symbol` arm gets from the type: `:bob.to_s` is `"bob"`, so the
   * Symbol arm is `.slice(1)` while a String falls through to `super`
   * unchanged.
   */
  serialize(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (value instanceof BigDecimal || value instanceof Duration) return String(value);
    if (typeof value === "string" && value.startsWith(":")) return value.slice(1);
    if (value === true) return this.true;
    if (value === false) return this.false;
    return super.serialize(value);
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
