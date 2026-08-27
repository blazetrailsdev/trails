import { BigDecimal } from "@blazetrails/activesupport";
import { ValueType } from "../value.js";

const NUMERIC_REGEX = /^\s*[+-]?\d/;

/** @internal */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  if (typeof oldValue === "number") {
    return Number.isNaN(oldValue) && typeof newValue === "number" && Number.isNaN(newValue);
  }
  return oldValue === "NaN" && newValue === "NaN";
}

/** @internal */
export function isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean {
  if (oldValue === null || oldValue === undefined) return false;
  if (typeof newValueBeforeTypeCast === "number" || typeof newValueBeforeTypeCast === "bigint") {
    return false;
  }
  return isNonNumericString(newValueBeforeTypeCast);
}

/** @internal */
export function isNonNumericString(value: unknown): boolean {
  return !NUMERIC_REGEX.test(String(value));
}

function normalizeBigDecimal(value: unknown): unknown {
  return value instanceof BigDecimal ? value.toString("F") : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbstractValueTypeCtor<T = unknown> = abstract new (...args: any[]) => ValueType<T>;

export interface NumericMixinMethods {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  serializeCastValue(value: unknown): unknown;
  isChanged(oldValue: unknown, newValue: unknown, newValueBeforeTypeCast?: unknown): boolean;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
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
      return (
        (super.isChanged(
          normalizeBigDecimal(oldValue),
          normalizeBigDecimal(newValue),
          newValueBeforeTypeCast,
        ) ||
          isNumberToNonNumber(oldValue, newValueBeforeTypeCast)) &&
        !isEqualNan(oldValue, newValueBeforeTypeCast)
      );
    }
  }
  return NumericType as unknown as TBase & { prototype: NumericMixinMethods };
}
