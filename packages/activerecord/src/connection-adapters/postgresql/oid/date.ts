import { Temporal } from "@blazetrails/date";
import {
  DateType,
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import { parsePostgresDate } from "../../abstract/temporal-wire.js";

export class Date extends DateType {
  /** @missingRailsCall format — PERMANENT */
  override castValue(
    value: unknown,
  ): Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        try {
          return parsePostgresDate(value);
        } catch {
          return null;
        }
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
