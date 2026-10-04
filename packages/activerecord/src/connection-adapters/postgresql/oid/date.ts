import { Temporal } from "@blazetrails/date";
import {
  DateType,
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { format, toI, registerConstant } from "@blazetrails/ruby-compat";

export class Date extends DateType {
  override castValue(
    value: unknown,
  ): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType | null {
    if (value === "infinity") {
      return DateInfinity;
    } else if (value === "-infinity") {
      return DateNegativeInfinity;
    } else if (typeof value === "string" && / BC$/.test(value)) {
      value = value.replace(/^\d+/, (year) => format("%04d", -(toI(year) as number) + 1));
      return super.castValue((value as string).replace(/ BC$/, ""));
    } else {
      return super.castValue(value);
    }
  }

  override typeCastForSchema(value: unknown): unknown {
    if (value === DateInfinity) return "::Float::INFINITY";
    if (value === DateNegativeInfinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Date", Date);
