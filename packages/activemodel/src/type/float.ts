import { BigDecimal } from "@blazetrails/activesupport";
import { isNan, rbFloatTypeP, registerConstant, toF } from "@blazetrails/ruby-compat";
import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<number>);

export class FloatType extends NumericValueType {
  type(): string {
    return "float";
  }

  typeCastForSchema(value: unknown): unknown {
    if ((rbFloatTypeP(value) || value instanceof BigDecimal) && isNan(value)) return "::Float::NAN";
    switch (value) {
      case Infinity:
        return "::Float::INFINITY";
      case -Infinity:
        return "-::Float::INFINITY";
      default:
        return super.typeCastForSchema(value);
    }
  }

  /** @internal */
  protected castValue(value: unknown): number | null {
    if (rbFloatTypeP(value)) return value;
    switch (value) {
      case "Infinity":
        return Number.POSITIVE_INFINITY;
      case "-Infinity":
        return Number.NEGATIVE_INFINITY;
      case "NaN":
        return Number.NaN;
      default:
        return toF(value);
    }
  }
}

registerConstant("ActiveModel::Type::Float", FloatType);
