/**
 * PostgreSQL timestamp type — timestamp without time zone.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Timestamp
 */

export class Timestamp {
  get type(): string {
    return "datetime";
  }

  cast(value: unknown): globalThis.Date | null {
    if (value == null) return null;
    if (value instanceof globalThis.Date) return value;
    if (typeof value === "string") {
      if (value === "" || value === "infinity" || value === "-infinity") return null;
      const parsed = new globalThis.Date(value);
      if (isNaN(parsed.getTime())) return null;
      return parsed;
    }
    if (typeof value === "number") return new globalThis.Date(value);
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof globalThis.Date) {
      return value.toISOString().replace("T", " ").replace("Z", "");
    }
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): globalThis.Date | null {
    return this.cast(value);
  }
}
