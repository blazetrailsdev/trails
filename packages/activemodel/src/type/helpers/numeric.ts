/**
 * Numeric helper — shared behavior for numeric type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Numeric (numeric.rb:7-34)
 */
import { ValueType } from "../value.js";

/** Mirrors: ActiveModel::Type::Helpers::Numeric::NUMERIC_REGEX */
const NUMERIC_REGEX = /^\s*[+-]?\d/;

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#non_numeric_string?
 *
 * @internal Rails-private helper.
 */
export function isNonNumericString(value: unknown): boolean {
  return !NUMERIC_REGEX.test(String(value));
}

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
 * Mirrors: ActiveModel::Type::Helpers::Numeric#equal_nan?
 *
 * Trails has no BigDecimal class, so the constructor-equality check
 * collapses to "both are JS numbers and both are NaN".
 *
 * @internal Rails-private helper.
 */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  return (
    typeof oldValue === "number" &&
    Number.isNaN(oldValue) &&
    typeof newValue === "number" &&
    Number.isNaN(newValue)
  );
}

// Constructor rest args must be `any[]` — idiomatic in TypeScript mixin
// patterns; no single concrete signature covers all subclass shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbstractValueTypeCtor<T = unknown> = abstract new (...args: any[]) => ValueType<T>;

/** Methods added by `applyNumericMixin`. Exported for type assertions. */
export interface NumericMixinMethods {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
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

    override isChanged(
      oldValue: unknown,
      newValue: unknown,
      newValueBeforeTypeCast?: unknown,
    ): boolean {
      return (
        (super.isChanged(oldValue, newValue, newValueBeforeTypeCast) ||
          isNumberToNonNumber(oldValue, newValueBeforeTypeCast)) &&
        !isEqualNan(oldValue, newValueBeforeTypeCast)
      );
    }
  }
  return NumericType as unknown as TBase & { prototype: NumericMixinMethods };
}
