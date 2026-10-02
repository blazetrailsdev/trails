import { BigDecimal, presence } from "@blazetrails/activesupport";
import {
  cmp,
  isNan,
  Module,
  Rational,
  rbObjClass,
  rbFloatTypeP,
  rbObjAsString as toS,
} from "@blazetrails/ruby-compat";
import type { ValueType } from "../value.js";

const NUMERIC_REGEX = /^\s*[+-]?\d/;

export function serialize(this: ValueType, value: unknown): unknown {
  return this.cast(value);
}

export function serializeCastValue(value: unknown): unknown {
  return value;
}

export function cast(this: ValueType, value: unknown): unknown {
  value =
    cmp(value, 0) != null ? value : value === true ? 1 : value === false ? 0 : presence(value);

  return Numeric.superMethod(this, "cast")!(value);
}

export function isChanged(
  this: ValueType,
  oldValue: unknown,
  _newValue: unknown,
  newValueBeforeTypeCast: unknown,
): boolean {
  return (
    ((Numeric.superMethod(this, "isChanged")!(
      oldValue,
      _newValue,
      newValueBeforeTypeCast,
    ) as boolean) ||
      isNumberToNonNumber(oldValue, newValueBeforeTypeCast)) &&
    !isEqualNan(oldValue, newValueBeforeTypeCast)
  );
}

/** @internal */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  return (
    (rbFloatTypeP(oldValue) || oldValue instanceof BigDecimal) &&
    isNan(oldValue) &&
    rbObjClass(oldValue) === rbObjClass(newValue) &&
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

export const Numeric = new Module((mod) => {
  mod.defineMethod("serialize", serialize);
  mod.defineMethod("serializeCastValue", serializeCastValue);
  mod.defineMethod("cast", cast);
  mod.defineMethod("isChanged", isChanged);
  mod.defineMethod("isEqualNan", isEqualNan);
  mod.defineMethod("isNumberToNonNumber", isNumberToNonNumber);
  mod.defineMethod("isNonNumericString", isNonNumericString);
});
