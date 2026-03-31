/**
 * PostgreSQL xml type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Xml
 *
 * Also exports Data class for XML value representation.
 */

export class Data {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export class Xml {
  get type(): string {
    return "xml";
  }

  cast(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Data) return value.value;
    if (typeof value === "string") return value === "" ? null : value;
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Data) return value.value;
    return String(value);
  }

  deserialize(value: unknown): string | null {
    return this.cast(value);
  }
}
