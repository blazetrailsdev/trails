import { isBlank } from "@blazetrails/activesupport";
import {
  include,
  Range,
  rbDeclareIvar,
  rbModToS,
  toI,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./value.js";
import { RangeError } from "../errors.js";
import { Numeric, isNonNumericString } from "./helpers/numeric.js";

const DEFAULT_LIMIT = 4;

export class IntegerType extends ValueType<number | bigint> {
  protected _range: Range<number | bigint>;

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
    this._range = new Range(this.minValue(), this.maxValue(), true);
  }

  type(): string {
    return "integer";
  }

  deserialize(value: unknown): number | bigint | null {
    if (isBlank(value)) return null;
    return this.castValue(value);
  }

  serialize(value: unknown): unknown {
    if (typeof value === "string" && isNonNumericString(value)) return null;
    return this.ensureInRange(this.cast(value));
  }

  serializeCastValue(value: number | bigint | null): number | bigint | null {
    return this.ensureInRange(value);
  }

  isSerializable(value: unknown, block?: (castValue: unknown) => void): boolean {
    const castValue = this.cast(value);
    if (this.isInRange(castValue)) return true;
    block?.(castValue);
    return false;
  }

  /** @internal */
  protected get range(): Range<number | bigint> {
    return this._range;
  }

  /** @internal */
  protected isInRange(value: number | bigint | null): boolean {
    return value == null || this.range.isInclude(value);
  }

  /** @internal */
  protected castValue(value: unknown): number | bigint | null {
    try {
      return this.narrowBigInt(toI(value));
    } catch {
      return null;
    }
  }

  /** @internal */
  protected ensureInRange(value: number | bigint | null): number | bigint | null {
    if (!this.isInRange(value)) {
      throw new RangeError(
        `${value} is out of range for ${rbModToS(this.constructor as typeof IntegerType)} with limit ${this._limit()} bytes`,
      );
    }
    return value;
  }

  /** @internal */
  protected maxValue(): number | bigint {
    return this.narrowBigInt(1n << BigInt(this._limit() * 8 - 1));
  }

  /** @internal */
  protected minValue(): number | bigint {
    return -this.maxValue();
  }

  /** @internal */
  protected _limit(): number {
    return this.limit ?? DEFAULT_LIMIT;
  }

  /** @internal */
  protected narrowBigInt(value: number | bigint): number | bigint {
    if (typeof value === "number") return value;
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}

rbDeclareIvar(IntegerType, "@range", "_range");

include(IntegerType, Numeric);

registerConstant("ActiveModel::Type::Integer", IntegerType);
