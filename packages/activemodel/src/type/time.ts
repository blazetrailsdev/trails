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

  serialize(value: unknown): Date | null {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  userInputInTimeZone(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const timeOnly = /^\d{2}:\d{2}(:\d{2})?/.test(value);
      const str = timeOnly ? `2000-01-01 ${value}` : String(value);
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    return this.cast(value);
  }
}
