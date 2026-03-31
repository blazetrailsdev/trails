/**
 * PostgreSQL bytea type — binary data.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bytea
 */

export class Bytea {
  get type(): string {
    return "binary";
  }

  cast(value: unknown): Buffer | null {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") return this.decodeBytea(value);
    return null;
  }

  serialize(value: unknown): Buffer | null {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") return Buffer.from(value, "utf-8");
    return null;
  }

  deserialize(value: unknown): Buffer | null {
    return this.cast(value);
  }

  private decodeBytea(str: string): Buffer {
    if (str.startsWith("\\x")) {
      return Buffer.from(str.slice(2), "hex");
    }
    return Buffer.from(str, "utf-8");
  }
}
