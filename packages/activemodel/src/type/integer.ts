import { ValueType } from "./value.js";
import { ActiveModelRangeError } from "../errors.js";

/** Mirrors: ActiveModel::Type::Integer::DEFAULT_LIMIT (integer.rb:43). */
const DEFAULT_LIMIT = 4;

export class IntegerType extends ValueType<number> {
  readonly name: string = "integer";

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
  }

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): number | null {
    if (typeof value === "number") {
      if (isNaN(value)) return null;
      return Math.trunc(value);
    }
    if (typeof value === "bigint") return Number(value);
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
  }

  serialize(value: unknown): unknown {
    return this.ensureInRange(this.cast(value));
  }

  type(): string {
    return this.name;
  }

  serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value);
  }

  isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    let num: number;
    if (typeof value === "number") {
      num = value;
    } else {
      // `Number(Symbol())` throws TypeError; catch so callers (e.g.
      // Attribute.isSerializable) get `false` instead of an exception.
      try {
        num = Number(value);
      } catch {
        return false;
      }
    }
    if (isNaN(num)) return false;
    return this.isInRange(num);
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#range (integer.rb:84).
   * Rails: `attr_reader :range` over the half-open `min_value...max_value`.
   * Exposed as a getter so subclasses can override; matches Rails'
   * `private` accessor visibility.
   *
   * @internal Rails-private helper.
   */
  protected get range(): [number, number] {
    return [this.minValue(), this.maxValue() - 1];
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#in_range? (integer.rb:88-90).
   *   def in_range?(value)
   *     !value || range.member?(value)
   *   end
   *
   * @internal Rails-private helper.
   */
  protected isInRange(value: number | null): boolean {
    if (value == null) return true;
    const [min, max] = this.range;
    return value >= min && value <= max;
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#ensure_in_range (integer.rb:96-101).
   *   def ensure_in_range(value)
   *     unless in_range?(value)
   *       raise ActiveModel::RangeError, "#{value} is out of range for #{self.class} with limit #{_limit} bytes"
   *     end
   *     value
   *   end
   *
   * @internal Rails-private helper.
   */
  protected ensureInRange(value: number | null): number | null {
    if (!this.isInRange(value)) {
      const klass = (this.constructor as { name: string }).name;
      throw new ActiveModelRangeError(
        `${value} is out of range for ${klass} with limit ${this._limit()} bytes`,
      );
    }
    return value;
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#max_value (integer.rb:103-105).
   *   def max_value
   *     1 << (_limit * 8 - 1) # 8 bits per byte with one bit for sign
   *   end
   *
   * @internal Rails-private helper.
   */
  protected maxValue(): number {
    return 2 ** (this._limit() * 8 - 1);
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#min_value (integer.rb:107-109).
   *   def min_value
   *     -max_value
   *   end
   *
   * @internal Rails-private helper.
   */
  protected minValue(): number {
    return -this.maxValue();
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#_limit (integer.rb:111-113).
   *   def _limit
   *     limit || DEFAULT_LIMIT
   *   end
   *
   * @internal Rails-private helper.
   */
  protected _limit(): number {
    return this.limit ?? DEFAULT_LIMIT;
  }
}
