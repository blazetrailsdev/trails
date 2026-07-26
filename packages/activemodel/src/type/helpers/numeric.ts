/**
 * Numeric helper — shared behavior for numeric type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Numeric (numeric.rb:7-34)
 */
import { BigDecimal } from "@blazetrails/activesupport";
import { ValueType } from "../value.js";

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#equal_nan?
 *
 *   (old_value.is_a?(::Float) || old_value.is_a?(BigDecimal)) &&
 *     old_value.nan? && old_value.instance_of?(new_value.class) && new_value.nan?
 *
 * Trails passes the CAST new value here rather than Rails'
 * `new_value_before_type_cast` — a pre-existing deviation locked in by
 * `float.test.ts` ("equal_nan? uses cast value"), left alone here.
 *
 * Rails' `instance_of?(new_value.class)` guard means a Float NaN written over
 * a BigDecimal NaN still counts as a change. Trails' `BigDecimal` carries no
 * non-finite state, so `DecimalType#cast` represents a NaN decimal as the
 * sentinel string `"NaN"` — that sentinel IS this port's BigDecimal NaN, and
 * the class guard maps to requiring the same representation on both sides.
 *
 * @internal Rails-private helper.
 */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  if (typeof oldValue === "number") {
    return Number.isNaN(oldValue) && typeof newValue === "number" && Number.isNaN(newValue);
  }
  return oldValue === "NaN" && newValue === "NaN";
}

/** Mirrors: ActiveModel::Type::Helpers::Numeric::NUMERIC_REGEX */
const NUMERIC_REGEX = /^\s*[+-]?\d/;

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#number_to_non_number?
 *
 * @internal Rails-private helper.
 */
export function isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean {
  if (oldValue === null || oldValue === undefined) return false;
  if (typeof newValueBeforeTypeCast === "number" || typeof newValueBeforeTypeCast === "bigint") {
    return false;
  }
  return isNonNumericString(newValueBeforeTypeCast);
}

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#non_numeric_string?
 *
 * @internal Rails-private helper.
 */
export function isNonNumericString(value: unknown): boolean {
  return !NUMERIC_REGEX.test(String(value));
}

/**
 * Cast decimals are {@link BigDecimal} instances; compare them by their fixed
 * ("F") form so JS identity does not stand in for Ruby's value equality.
 */
function normalizeBigDecimal(value: unknown): unknown {
  return value instanceof BigDecimal ? value.toString("F") : value;
}

// Constructor rest args must be `any[]` — idiomatic in TypeScript mixin
// patterns; no single concrete signature covers all subclass shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbstractValueTypeCtor<T = unknown> = abstract new (...args: any[]) => ValueType<T>;

/** Methods added by `applyNumericMixin`. Exported for type assertions. */
export interface NumericMixinMethods {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  serializeCastValue(value: unknown): unknown;
  isChanged(oldValue: unknown, newValue: unknown, newValueBeforeTypeCast?: unknown): boolean;
}

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric (numeric.rb:7-34).
 *
 * Applied to Integer, Float, and Decimal. Adds:
 * - blank-string and boolean normalization in `cast` (numeric.rb:15-29)
 * - `serialize` delegates to `cast` (numeric.rb:7-9)
 * - `isChanged` uses number_to_non_number? / equal_nan? (numeric.rb:31-34)
 *
 * The return type augments `TBase`'s prototype shape rather than
 * intersecting a second constructor signature — that pattern avoids
 * TS2510 ("Base constructors must all have the same return type") while
 * still advertising the added instance methods to callers.
 *
 * @internal Rails-private helper.
 */
export function applyNumericMixin<TBase extends AbstractValueTypeCtor>(
  Base: TBase,
): TBase & { prototype: NumericMixinMethods } {
  class NumericType extends (Base as AbstractValueTypeCtor) {
    override cast(value: unknown) {
      let v: unknown;
      if (typeof value === "number" || typeof value === "bigint") {
        v = value;
      } else if (value === true) {
        v = 1;
      } else if (value === false) {
        v = 0;
      } else if (typeof value === "string" && value.trim() === "") {
        v = null;
      } else {
        v = value;
      }
      return super.cast(v);
    }

    override serialize(value: unknown): unknown {
      return this.cast(value);
    }

    override serializeCastValue(value: unknown): unknown {
      return value;
    }

    override isChanged(
      oldValue: unknown,
      newValue: unknown,
      newValueBeforeTypeCast?: unknown,
    ): boolean {
      // Rails' `super` here is `Value#changed?` (`old_value != new_value`) —
      // Ruby `!=` on BigDecimal is value equality, so a cast decimal reverted
      // to its previous value is unchanged. JS `!==` is object identity, so
      // normalize BigDecimal operands to their fixed form first.
      const old = normalizeBigDecimal(oldValue);
      const fresh = normalizeBigDecimal(newValue);
      return (
        (super.isChanged(old, fresh, newValueBeforeTypeCast) ||
          isNumberToNonNumber(old, newValueBeforeTypeCast)) &&
        !isEqualNan(old, fresh)
      );
    }
  }
  return NumericType as unknown as TBase & { prototype: NumericMixinMethods };
}
