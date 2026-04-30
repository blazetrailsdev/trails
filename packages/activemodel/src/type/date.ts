import { Temporal } from "@blazetrails/activesupport/temporal";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ValueType } from "./value.js";

export { DateInfinity, DateNegativeInfinity };
export type { DateInfinityType, DateNegativeInfinityType };

export type DateCastResult = Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType;

export class DateType extends ValueType<DateCastResult> {
  readonly name: string = "date";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): DateCastResult | null {
    if (value === DateInfinity) return DateInfinity;
    if (value === DateNegativeInfinity) return DateNegativeInfinity;
    if (value instanceof Temporal.PlainDate) return value;
    // Accept PlainDateTime from multiparameter assignment — extract the date part.
    if (value instanceof Temporal.PlainDateTime) return value.toPlainDate();
    // boundary: cast accepts Date input from legacy callers / custom types
    // and bridges into Temporal.PlainDate via the UTC calendar components.
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return Temporal.PlainDate.from({
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      });
    }
    const str = String(value).trim();
    if (str === "") return null;
    try {
      return Temporal.PlainDate.from(str, { overflow: "reject" });
    } catch {
      return null;
    }
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    // Sentinels are Postgres-specific; base type returns null. The Postgres
    // OID::Date subclass overrides serialize() to emit 'infinity'/'-infinity'.
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return null;
    return cast.toString();
  }

  serializeCastValue(value: DateCastResult | null): string | null {
    return this.serialize(value);
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    const cast = this.cast(value);
    if (cast === null || cast === DateInfinity || cast === DateNegativeInfinity) return "null";
    return JSON.stringify(cast.toString());
  }
}
