/**
 * PostgreSQL date type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Date
 */

export class Date {
  get type(): string {
    return "date";
  }

  cast(value: unknown): globalThis.Date | null {
    if (value == null) return null;
    if (value instanceof globalThis.Date) return value;
    if (typeof value === "string") {
      if (value === "") return null;
      const parsed = new globalThis.Date(value + "T00:00:00Z");
      if (isNaN(parsed.getTime())) return null;
      return parsed;
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof globalThis.Date) {
      return value.toISOString().split("T")[0];
    }
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): globalThis.Date | null {
    return this.cast(value);
  }
}
