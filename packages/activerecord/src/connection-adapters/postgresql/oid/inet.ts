/**
 * PostgreSQL inet type — IP address with optional subnet mask.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Inet
 */

export class Inet {
  get type(): string {
    return "inet";
  }

  cast(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value === "" ? null : value;
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    return String(value);
  }

  deserialize(value: unknown): string | null {
    return this.cast(value);
  }
}
