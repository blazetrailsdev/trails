import { Time as RubyTime } from "@blazetrails/date";
import { format, toI, registerConstant } from "@blazetrails/ruby-compat";
import { DateTime as ArDateTime } from "../../../type/date-time.js";
import { pgDatetimeConfig } from "../pg-datetime-config.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";

type PgDateTimeResult = RubyTime | DateInfinityType | DateNegativeInfinityType;

export class DateTime extends ArDateTime {
  override castValue(value: unknown): PgDateTimeResult | null {
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

  protected realTypeUnlessAliased(realType: string): string {
    return pgDatetimeConfig.datetimeType === realType ? "datetime" : realType;
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::DateTime", DateTime);
