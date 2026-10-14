import { BigDecimal, presence } from "@blazetrails/activesupport";
import {
  cmp,
  isNan,
  Rational,
  rbFloatTypeP,
  rbObjAsString as toS,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { ValueType } from "../value.js";

const NUMERIC_REGEX = /^\s*[+-]?\d/;

/** @internal */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  return (
    (rbFloatTypeP(oldValue) || oldValue instanceof BigDecimal) &&
    isNan(oldValue) &&
    rbObjClassname(oldValue) === rbObjClassname(newValue) &&
    isNan(newValue)
  );
}

/** @internal */
export function isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean {
  return (
    oldValue != null &&
    !(
      typeof newValueBeforeTypeCast === "number" ||
      typeof newValueBeforeTypeCast === "bigint" ||
      newValueBeforeTypeCast instanceof Number ||
      newValueBeforeTypeCast instanceof BigDecimal ||
      newValueBeforeTypeCast instanceof Rational
    ) &&
    isNonNumericString(toS(newValueBeforeTypeCast))
  );
}

/** @internal */
export function isNonNumericString(value: string): boolean {
  return !NUMERIC_REGEX.test(value);
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
 * @noRailsEquivalent CONVERGEABLE type-helpers-numeric-is-a-class-factory-not-an-included-module
 */
export function applyNumericMixin<TBase extends AbstractValueTypeCtor>(
  Base: TBase,
): TBase & { prototype: NumericMixinMethods } {
  class NumericType extends (Base as AbstractValueTypeCtor) {
    override cast(value: unknown) {
      value =
        cmp(value, 0) != null ? value : value === true ? 1 : value === false ? 0 : presence(value);

      return super.cast(value);
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
        (super.isChanged(oldValue, newValue, newValueBeforeTypeCast) ||
          isNumberToNonNumber(oldValue, newValueBeforeTypeCast)) &&
        !isEqualNan(oldValue, newValueBeforeTypeCast)
      );
    }
  }
  return NumericType as unknown as TBase & { prototype: NumericMixinMethods };
}
