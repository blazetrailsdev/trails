/**
 * PostgreSQL OID type — object identifier.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Oid
 */

export class Oid {
  get type(): string {
    return "integer";
  }

  cast(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") return Math.trunc(value);
    if (typeof value === "string") {
      if (value === "") return null;
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) return null;
      return parsed;
    }
    return null;
  }

  serialize(value: unknown): number | null {
    return this.cast(value);
  }

  deserialize(value: unknown): number | null {
    return this.cast(value);
  }
}
