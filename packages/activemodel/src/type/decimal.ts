import { BigDecimal, toD } from "@blazetrails/activesupport";
import {
  Rational,
  rbFloatTypeP,
  rbInspect as inspect,
  rbObjAsString as toS,
  rbObjRespondTo,
  registerConstant,
  round,
  toI,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./value.js";
import { applyNumericMixin } from "./helpers/numeric.js";

const NumericValueType = applyNumericMixin(ValueType<BigDecimal>);

const BIGDECIMAL_PRECISION = 18;

const FLOAT_DIG = 15;

export class DecimalType extends NumericValueType {
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
    if (Number(toI(this.precision)) > FLOAT_DIG + 1) {
      return FLOAT_DIG + 1;
    } else {
      return Number(toI(this.precision));
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

registerConstant("ActiveModel::Type::Decimal", DecimalType);
