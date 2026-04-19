import { ValueType } from "./value.js";

export class DateType extends ValueType<Date> {
  readonly name: string = "date";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }

  serialize(value: unknown): Date | null {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    if (value instanceof Date) {
      return `"${value.toISOString().split("T")[0]}"`;
    }
    return JSON.stringify(value) ?? "null";
  }
}
