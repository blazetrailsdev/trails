import { isBlank } from "@blazetrails/activesupport";
import { ValueType } from "./value.js";
import { RangeError } from "../errors.js";
import { applyNumericMixin, isNonNumericString } from "./helpers/numeric.js";

const DEFAULT_LIMIT = 4;

const NumericValueType = applyNumericMixin(ValueType<number | bigint>);

export class IntegerType extends NumericValueType {
  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
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
  protected get range(): [number, number] {
    return [this.minValue(), this.maxValue()];
  }

  /** @internal */
  protected isInRange(value: number | bigint | null): boolean {
    if (value == null) return true;
    const [min, max] = this.range;
    let big: bigint;
    if (typeof value === "bigint") {
      big = value;
    } else {
      if (!isFinite(value)) return false;
      big = BigInt(Math.trunc(value));
    }
    const lowerOk = min === Number.NEGATIVE_INFINITY || big >= BigInt(min);
    const upperOk = max === Number.POSITIVE_INFINITY || big < BigInt(max);
    return lowerOk && upperOk;
  }

  /** @internal */
  protected castValue(value: unknown): number | bigint | null {
    if (typeof value === "number") {
      if (!isFinite(value)) return null;
      return Math.trunc(value);
    }
    if (typeof value === "bigint") {
      return this.narrowBigInt(value);
    }
    if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    try {
      return (value as { toI(): number | bigint }).toI();
    } catch {
      return null;
    }
  }

  /** @internal */
  protected ensureInRange(value: number | bigint | null): number | bigint | null {
    if (!this.isInRange(value)) {
      const klass = (this.constructor as { name: string }).name;
      throw new RangeError(
        `${value} is out of range for ${klass} with limit ${this._limit()} bytes`,
      );
    }
    return value;
  }

  /** @internal */
  protected maxValue(): number {
    return 2 ** (this._limit() * 8 - 1);
  }

  /** @internal */
  protected minValue(): number {
    return -this.maxValue();
  }

  /** @internal */
  protected _limit(): number {
    return this.limit ?? DEFAULT_LIMIT;
  }

  /** @internal */
  protected narrowBigInt(value: bigint): number | bigint {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value;
  }
}
