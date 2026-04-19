import { ValueType } from "./value.js";

export class DateTimeType extends ValueType {
  readonly name: string = "datetime";

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
}
