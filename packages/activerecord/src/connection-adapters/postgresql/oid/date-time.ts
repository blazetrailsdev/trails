import { Time as RubyTime } from "@blazetrails/date";
import { format } from "@blazetrails/ruby-compat";
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
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        const rewritten = value.replace(/^\d+/, (year) => format("%04d", -Number(year) + 1));
        return super.castValue(rewritten.replace(/ BC$/, ""));
      }
    }
    return super.castValue(value);
  }

  override serialize(value: unknown): unknown {
    const cast = this.cast(value);
    if (cast === DateInfinity) return "infinity";
    if (cast === DateNegativeInfinity) return "-infinity";
    return super.serializeCastValue(cast);
  }

  override typeCastForSchema(value: unknown): string {
    if (value === DateInfinity) return "::Float::INFINITY";
    if (value === DateNegativeInfinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }

  protected realTypeUnlessAliased(realType: string): string {
    return pgDatetimeConfig.datetimeType === realType ? "datetime" : realType;
  }
}
