/**
 * PostgreSQL cidr type — network address (CIDR notation).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Cidr
 */

export class Cidr {
  get type(): string {
    return "cidr";
  }

  cast(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") {
      if (value === "") return null;
      return value;
    }
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
