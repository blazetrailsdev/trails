import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { DateTime as ArDateTime } from "../../../type/date-time.js";
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

type PgDateTimeResult = RubyTime | DateInfinityType | DateNegativeInfinityType;

export class DateTime extends ArDateTime {
  /** @missingRailsCall format — PERMANENT */
  override castValue(value: unknown): PgDateTimeResult | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      if (value === "infinity") return DateInfinity;
      if (value === "-infinity") return DateNegativeInfinity;
      if (/ BC$/.test(value)) {
        try {
          const hasOffset = /[-+]\d{2}(?::\d{2})?$/.test(value.slice(0, -3).trimEnd());
          const instant = hasOffset
            ? parsePostgresInstant(value)
            : parsePostgresTimestampAsInstant(value);
          if (!(instant instanceof Temporal.Instant)) return instant;
          const time = RubyTime.at(new Rational(instant.epochNanoseconds, 1_000_000_000n));
          return this.isUtc ? time.getutc() : time.getlocal();
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
