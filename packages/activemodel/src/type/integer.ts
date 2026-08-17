import { isBlank } from "@blazetrails/activesupport";
import { ValueType } from "./value.js";
import { RangeError as ActiveModelRangeError } from "../errors.js";
import { applyNumericMixin, isNonNumericString } from "./helpers/numeric.js";

/** Mirrors: ActiveModel::Type::Integer::DEFAULT_LIMIT (integer.rb:43). */
const DEFAULT_LIMIT = 4;

const NumericValueType = applyNumericMixin(ValueType<number>);

export class IntegerType extends NumericValueType {
  readonly name: string = "integer";

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
  }

  type(): string {
    return this.name;
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#deserialize (integer.rb:60-63).
   *   def deserialize(value)
   *     return if value.blank?
   *     value.to_i
   *   end
   *
   * `castValue` is Rails' `value.to_i rescue nil`, so this is the `to_i` Rails
   * calls here.
   */
  deserialize(value: unknown): number | null {
    if (isBlank(value)) return null;
    return this.castValue(value);
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#serialize (integer.rb:65-68).
   *   def serialize(value)
   *     return if value.is_a?(::String) && non_numeric_string?(value)
   *     ensure_in_range(super)
   *   end
   *
   * The leading guard is why `serialize("wibble")` is nil where
   * `cast("wibble")` is `0` (integer_test.rb:52-58).
   */
  serialize(value: unknown): unknown {
    if (typeof value === "string" && isNonNumericString(value)) return null;
    return this.ensureInRange(this.cast(value));
  }

  serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value) as number | null;
  }

  isSerializable(value: unknown, block?: (castValue: unknown) => void): boolean {
    // Mirrors integer.rb:74-80 — `cast_value = cast(value)` then
    // `in_range?(cast_value)`. The leading cast is load-bearing and must not be
    // re-derived via `Number(value)`: `cast` routes a BigInt through
    // `narrowBigInt`, keeping arbitrary precision, where `Number()` would
    // collapse `2n**63n` and `2n**63n-1n` onto the same float and let an
    // exactly-2^63 value test in-range on an 8-byte column (see `isInRange`).
    // It also decides ±Infinity, NaN and uncastable values: all are nil out of
    // `castValue` (`to_i rescue nil`, integer.rb:90), and `in_range?(nil)` is
    // `!value` => true. Casting here rather than trusting the caller keeps this
    // predicate correct for a raw value, whether or not the caller pre-cast.
    const castValue = this.cast(value) as number | bigint | null;
    if (this.isInRange(castValue)) return true;
    // `in_range?(cast_value) || begin; yield cast_value if block_given?; false; end`
    // — the block receives the CAST value, which is the only place a caller can
    // get it without casting a second time.
    block?.(castValue);
    return false;
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#range (integer.rb:84).
   * Rails: `attr_reader :range` over the half-open `min_value...max_value`
   * (exclusive max). Exposed as a getter so subclasses can override; matches
   * Rails' `private` accessor visibility.
   *
   * @internal Rails-private helper.
   */
  protected get range(): [number, number] {
    return [this.minValue(), this.maxValue()];
  }

  /**
   * Mirrors: ActiveModel::Type::Integer#in_range? (integer.rb:88-90).
   *   def in_range?(value)
   *     !value || range.member?(value)
   *   end
   *
   * Rails' Integer arithmetic is arbitrary-precision, so its half-open
   * `min_value...max_value` check is exact. JS `number` is float64, which
   * cannot distinguish `2**63` from `2**63-1`; comparing there would let an
   * exactly-2^63 value slip past an 8-byte column's exclusive-max bound. We
   * therefore compare in BigInt space. `min`/`max` are exact powers of two
   * (or 0), so they convert losslessly; a `number` value is truncated toward
   * zero first, matching Ruby's `to_i` before `range.member?`. BigInteger's
   * unlimited `±Infinity` bounds are honored without a BigInt conversion.
   *
   * @internal Rails-private helper.
   */
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

  /**
   * @internal Rails-private helper.
   *
   * Rails' `cast_value` is `value.to_i`, which is arbitrary-precision: a
   * bignum like `9223372036854775807` (2^63-1) round-trips exactly. Routing a
   * `bigint` through `Number(value)` would round 2^63-1 up to 2^63 (the two
   * collapse to the same float64), so an in-range 8-byte value would then be
   * wrongly rejected by `ensureInRange`. But `IntegerType` is
   * `ValueType<number>`-backed and downstream code (attribute reads, `===`
   * comparisons, pluck/ids) expects a `number` — a driver-returned `16n` must
   * stay `16`. So we only keep the `bigint` (carried under a `number` cast, the
   * same technique `BigIntegerType#castValue` uses) when it exceeds the
   * float64 safe-integer range; within it, `Number()` is exact and we return a
   * plain `number`.
   */
  protected castValue(value: unknown): number | null {
    if (typeof value === "number") {
      // Mirrors integer.rb:90 — `value.to_i rescue nil`. Both NaN and ±Infinity
      // raise FloatDomainError from Float#to_i, so Rails rescues them to nil;
      // `isFinite` is exactly that domain. BigIntegerType#castValue already
      // draws the same line.
      if (!isFinite(value)) return null;
      return Math.trunc(value);
    }
    if (typeof value === "bigint") {
      return this.narrowBigInt(value);
    }
    if (typeof value === "string") {
      // Ruby String#to_i parses a leading integer and answers 0 when there is
      // none: `"1ignore".to_i == 1`, `"bad1".to_i == 0`, `"bad".to_i == 0`
      // (integer_test.rb:12-15). `parseInt(_, 10)` agrees on the leading-digit
      // and sign-prefixed forms; only the no-digits case needs the 0.
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    // Anything that answers `to_i` converts — a Duration, say
    // (integer_test.rb:47-50).
    const toI = (value as { toI?: unknown } | null)?.toI;
    if (typeof toI === "function") return toI.call(value) as number;
    // Every Ruby `::Numeric` answers `to_i`, and that includes the values a
    // driver hands back for a numeric column or aggregate: MRI sees an Integer
    // or a BigDecimal, both of which convert. Their trails counterparts —
    // `BigDecimal`, node-postgres/mysql2 numeric wrappers — carry the value in
    // their decimal string form instead, so that string IS the conversion here.
    // Restricted to non-Array objects because the `rescue nil` of integer.rb:90
    // is real for the receivers Ruby genuinely has no `to_i` on: `Object.new`,
    // `[1, 2]`, `{ 1 => 2 }`, `(1..2)` (integer_test.rb:24-32). A non-numeric
    // string form therefore answers nil, not `String#to_i`'s 0.
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      let str: string;
      try {
        str = String(value);
      } catch {
        // A null-prototype object has no `toString`; Ruby's counterpart has no
        // `to_i` either, so this is the same nil.
        return null;
      }
      const parsed = parseInt(str, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return null;
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
  protected ensureInRange(value: number | bigint | null): number | bigint | null {
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

  /**
   * Collapse a `bigint` to a JS `number` when it fits float64's safe-integer
   * range; otherwise keep the `bigint` (carried under a `number` cast, the
   * technique the numeric type primitives use to stay `ValueType<number>`-backed
   * while preserving precision for out-of-range bignums). `Number.isSafeInteger`
   * on the converted value is exact at the boundary — `2**53` and any bigint
   * that rounds down onto it both fail the guard, so no precision is lost.
   *
   * @internal Rails-private helper.
   */
  protected narrowBigInt(value: bigint): number {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : (value as unknown as number);
  }
}
