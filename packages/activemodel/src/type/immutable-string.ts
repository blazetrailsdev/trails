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
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (value instanceof BigDecimal || value instanceof Duration) return String(value);
    if (value === true) return this.true;
    if (value === false) return this.false;
    return super.serialize(value);
  }

  serializeCastValue(value: string | null): string | null {
    return value;
  }

  /** @internal */
  protected castValue(value: unknown): string | null {
    if (value === true) return Object.freeze(this.true);
    if (value === false) return Object.freeze(this.false);
    const str = String(value);
    return Object.freeze(str);
  }
}
