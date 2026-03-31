/**
 * PostgreSQL jsonb type — binary JSON storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb
 */

export class Jsonb {
  get type(): string {
    return "jsonb";
  }

  cast(value: unknown): unknown {
    if (value == null) return null;
    if (typeof value === "string") {
      if (value === "") return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  deserialize(value: unknown): unknown {
    return this.cast(value);
  }
}
