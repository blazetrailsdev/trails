import { include } from "@blazetrails/activesupport";
import { BigDecimal } from "@blazetrails/activesupport";
import { isNan, rbFloatTypeP, toF } from "@blazetrails/ruby-compat";
import { ValueType } from "./value.js";
import { Numeric } from "./helpers/numeric.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Helpers::Numeric`; the class/interface merge is how `include()` surfaces on the type side.
export interface FloatType extends Omit<Numeric, "cast" | "serialize" | "serializeCastValue"> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FloatType extends ValueType<number> {
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

include(FloatType, Numeric);
