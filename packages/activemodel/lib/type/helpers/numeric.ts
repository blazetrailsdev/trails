import { BigDecimal, presence } from "@blazetrails/activesupport";
import {
  cmp,
  isNan,
  Rational,
  rbCallSuper,
  rbFloatTypeP,
  rbObjAsString as toS,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import type { ValueType } from "../value.js";

const NUMERIC_REGEX = /^\s*[+-]?\d/;

export interface Numeric {
  serialize(value: unknown): unknown;
  serializeCastValue(value: unknown): unknown;
  cast(value: unknown): unknown;
  isChanged(oldValue: unknown, newValue: unknown, newValueBeforeTypeCast?: unknown): boolean;
  /** @internal */
  isEqualNan(oldValue: unknown, newValue: unknown): boolean;
  /** @internal */
  isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean;
  /** @internal */
  isNonNumericString(value: string): boolean;
}

/** @internal */
export const Numeric: Numeric & ThisType<ValueType & Numeric> = {
  serialize(value: unknown): unknown {
    return this.cast(value);
  },

  serializeCastValue(value: unknown): unknown {
    return value;
  },

  cast(value: unknown): unknown {
    value =
      cmp(value, 0) != null ? value : value === true ? 1 : value === false ? 0 : presence(value);

    return rbCallSuper(this, Numeric.cast, value);
  },

  isChanged(oldValue: unknown, _newValue: unknown, newValueBeforeTypeCast?: unknown): boolean {
    return (
      ((rbCallSuper(
        this,
        Numeric.isChanged,
        oldValue,
        _newValue,
        newValueBeforeTypeCast,
      ) as boolean) ||
        this.isNumberToNonNumber(oldValue, newValueBeforeTypeCast)) &&
      !this.isEqualNan(oldValue, newValueBeforeTypeCast)
    );
  },

  /** @internal */
  isEqualNan(oldValue: unknown, newValue: unknown): boolean {
    return (
      (rbFloatTypeP(oldValue) || oldValue instanceof BigDecimal) &&
      isNan(oldValue) &&
      rbObjClass(oldValue) === rbObjClass(newValue) &&
      isNan(newValue)
    );
  },

  /** @internal */
  isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean {
    return (
      oldValue != null &&
      !(
        typeof newValueBeforeTypeCast === "number" ||
        typeof newValueBeforeTypeCast === "bigint" ||
        newValueBeforeTypeCast instanceof Number ||
        newValueBeforeTypeCast instanceof BigDecimal ||
        newValueBeforeTypeCast instanceof Rational
      ) &&
      this.isNonNumericString(toS(newValueBeforeTypeCast))
    );
  },

  /** @internal */
  isNonNumericString(value: string): boolean {
    return !NUMERIC_REGEX.test(value);
  },
};
