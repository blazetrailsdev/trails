import { Temporal } from "@blazetrails/date";
import { DateTimeType } from "@blazetrails/activemodel";
import { pgDatetimeConfig } from "../pg-datetime-config.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinityType,
  type DateNegativeInfinityType,
} from "@blazetrails/activemodel";
import {
  parsePostgresTimestampAsInstant,
  parsePostgresInstant,
} from "../../abstract/temporal-wire.js";

type PgDateTimeResult = Temporal.Instant | DateInfinityType | DateNegativeInfinityType;

export class DateTime extends DateTimeType {
  override readonly name: string = "datetime";

  /** @missingRailsCall format — PERMANENT */
  override castValue(value: unknown): PgDateTimeResult | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        try {
          const hasOffset = /[-+]\d{2}(?::\d{2})?$/.test(value.slice(0, -3).trimEnd());
          return hasOffset ? parsePostgresInstant(value) : parsePostgresTimestampAsInstant(value);
        } catch {
          return null;
        }
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
