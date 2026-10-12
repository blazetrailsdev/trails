import { Time as RubyTime } from "@blazetrails/date";
import { format, rbStrSend, toI, registerConstant } from "@blazetrails/ruby-compat";
import * as Type from "../../../type.js";
import { ConnectionAdapters } from "../../../namespaces.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";

type PgDateTimeResult = RubyTime | DateInfinityType | DateNegativeInfinityType;

export class DateTime extends Type.DateTime {
  override castValue(value: unknown): PgDateTimeResult | null {
    if (value === "infinity") {
      return DateInfinity;
    } else if (value === "-infinity") {
      return DateNegativeInfinity;
    } else if (typeof value === "string" && / BC$/.test(value)) {
      value = value.replace(/^\d+/, (year) => format("%04d", -(toI(year) as number) + 1));
      return super.castValue(rbStrSend(value as string, "deleteSuffixBang", " BC")[0]);
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
    return ConnectionAdapters.PostgreSQLAdapter.datetimeType === realType ? "datetime" : realType;
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::DateTime", DateTime);
