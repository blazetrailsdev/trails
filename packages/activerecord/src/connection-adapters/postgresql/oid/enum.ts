/**
 * PostgreSQL enum OID type — casts PostgreSQL enum column values.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Enum
 */

export class Enum {
  get type(): string {
    return "enum";
  }

  cast(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value === "" ? null : value;
    return String(value);
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    return String(value);
  }

  deserialize(value: unknown): string | null {
    return this.cast(value);
  }
}
