/**
 * PostgreSQL macaddr type — MAC address.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Macaddr
 */

export class Macaddr {
  get type(): string {
    return "macaddr";
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
