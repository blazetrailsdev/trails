import { Type } from "./value.js";

export class DateType extends Type<Date> {
  readonly name = "date";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }
}
