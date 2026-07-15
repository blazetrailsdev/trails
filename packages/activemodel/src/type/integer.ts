import { isBlank } from "@blazetrails/activesupport";
import { ValueType } from "./value.js";
import { ActiveModelRangeError } from "../errors.js";
import { applyNumericMixin } from "./helpers/numeric.js";

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
   * Trails divergence: Rails calls `value.to_i`, which returns `0` for purely
   * non-numeric strings (`"abc".to_i # => 0`) and parses leading digits
   * (`"12abc".to_i # => 12`). Trails delegates to `castValue`, which uses
   * `parseInt`: leading-digit strings still parse (`"12abc" → 12`), but
   * fully non-numeric strings return `null` rather than `0`. Deserialize
   * inputs come from the database driver — non-numeric junk is not a real
   * input — so the divergence is theoretical, but documented here for fidelity.
   */
  deserialize(value: unknown): number | null {
    if (isBlank(value)) return null;
    return this.castValue(value);
  }

  serialize(value: unknown): unknown {
    return this.ensureInRange(this.cast(value));
  }

  serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value) as number | null;
  }

  isSerializable(value: unknown): boolean {
    // Mirrors integer.rb:74-80 — `cast_value = cast(value)` then
    // `in_range?(cast_value)`. The leading cast is load-bearing and must not be
    // re-derived via `Number(value)`: `cast` routes a BigInt through
    // `narrowBigInt`, keeping arbitrary precision, where `Number()` would
    // collapse `2n**63n` and `2n**63n-1n` onto the same float and let an
    // exactly-2^63 value test in-range on an 8-byte column (see `isInRange`).
    // It also decides ±Infinity and NaN: `cast_value` is `to_i rescue nil`
    // (integer.rb:90), so they cast to nil and `in_range?(nil)` is `!value` =>
    // true. Casting here rather than trusting the caller keeps this predicate
    // correct for a raw value, independent of whether the caller pre-cast.
    let castValue: number | bigint | null;
    try {
      castValue = this.cast(value) as number | bigint | null;
    } catch {
      // The `rescue nil` in cast_value: a value that cannot be cast at all
      // (e.g. a Symbol, whose `String()` throws) is nil in Rails, and
      // `in_range?(nil)` is true.
      return true;
    }
    return this.isInRange(castValue);
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
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
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
