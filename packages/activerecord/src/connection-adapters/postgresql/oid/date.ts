import { Temporal } from "@blazetrails/date";
import { kernelFormat as format } from "@blazetrails/ruby-compat";
import {
  DateType,
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";

export class Date extends DateType {
  override castValue(
    value: unknown,
  ): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType | null {
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
    if (value === DateInfinity) return "infinity";
    if (value === DateNegativeInfinity) return "-infinity";
    return super.serialize(value);
  }

  override typeCastForSchema(value: unknown): string {
    if (value === DateInfinity) return "::Float::INFINITY";
    if (value === DateNegativeInfinity) return "-::Float::INFINITY";
    return super.typeCastForSchema(value);
  }
}
