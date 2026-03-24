import { Type } from "./value.js";

export class TimeType extends Type<Date> {
  readonly name = "time";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value === "" || (typeof value === "string" && value.trim() === "")) return null;
    if (value instanceof Date) return value;
    const str = String(value);
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
}
