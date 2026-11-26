import "../../../constants.postgresql-oid-date.generated.js";
import { ConnectionAdapters } from "../../../namespaces.js";
import {
  DateType,
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { format } from "@blazetrails/ruby-compat/kernel-format";
import { rbStrSend } from "@blazetrails/ruby-compat/string/method-table";
import { toI } from "@blazetrails/ruby-compat/numeric";

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
}

ConnectionAdapters.PostgreSQL.OID.Date = Date;
