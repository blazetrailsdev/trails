/**
 * PostgreSQL decimal/numeric type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Decimal
 */

export class Decimal {
  get type(): string {
    return "decimal";
  }

  cast(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      if (value === "" || value === "NaN") return null;
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return null;
      return parsed;
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): number | null {
    return this.cast(value);
  }
}
