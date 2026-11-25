import { include } from "@blazetrails/activesupport";
import { FLOAT_DIG } from "@blazetrails/ruby-compat/numeric";
import { BigDecimal, toD } from "@blazetrails/activesupport";
import { rbFloatTypeP, round } from "@blazetrails/ruby-compat/numeric";
import {
  rbInspect as inspect,
  rbObjAsString as toS,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat/object";
import { Rational } from "@blazetrails/ruby-compat/rational";
import { ValueType } from "./value.js";
import { Numeric } from "./helpers/numeric.js";

const BIGDECIMAL_PRECISION = 18;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Helpers::Numeric`; the class/interface merge is how `include()` surfaces on the type side.
export interface DecimalType extends Omit<Numeric, "cast" | "serialize" | "serializeCastValue"> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DecimalType extends ValueType<BigDecimal> {
  type(): string {
    return "decimal";
  }

  /** @missingRailsArgs inspect — PERMANENT */
  typeCastForSchema(value: unknown): string {
    return inspect(toS(value));
  }

  /** @internal */
  protected castValue(value: unknown): BigDecimal | null {
    let castedValue: BigDecimal;
    if (rbFloatTypeP(value)) {
      castedValue = this.convertFloatToBigDecimal(value);
    } else if (
      typeof value === "number" ||
      value instanceof BigDecimal ||
      typeof value === "bigint" ||
      value instanceof Rational
    ) {
      castedValue = new BigDecimal(value, this.precision ?? BIGDECIMAL_PRECISION);
    } else if (typeof value === "string") {
      try {
        castedValue = toD(value);
      } catch {
        castedValue = new BigDecimal(0);
      }
    } else {
      if (rbObjRespondTo(value, "toD")) {
        castedValue = (value as { toD(): BigDecimal }).toD();
      } else {
        castedValue = this.castValue(toS(value)) as BigDecimal;
      }
    }

    return this.applyScale(castedValue);
  }

  /** @internal */
  protected convertFloatToBigDecimal(value: number): BigDecimal {
    if (this.precision != null) {
      return new BigDecimal(this.applyScale(value), this.floatPrecision());
    }
    return new BigDecimal(String(value));
  }

  /** @internal */
  protected floatPrecision(): number {
    if (Math.trunc(this.precision ?? 0) > FLOAT_DIG + 1) {
      return FLOAT_DIG + 1;
    } else {
      return Math.trunc(this.precision ?? 0);
    }
  }

  /** @internal */
  protected applyScale(value: number): number;
  protected applyScale(value: BigDecimal): BigDecimal;
  protected applyScale(value: BigDecimal | number): BigDecimal | number {
    if (this.scale != null) {
      return round(value, this.scale);
    } else {
      return value;
    }
  }
}

include(DecimalType, Numeric);
