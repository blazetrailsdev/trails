/**
 * PostgreSQL specialized string type — for types like xml, tsvector, etc.
 * that are stored as strings but have a specific type name.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::SpecializedString
 */

export class SpecializedString {
  readonly typeName: string;

  constructor(typeName: string = "string") {
    this.typeName = typeName;
  }

  get type(): string {
    return this.typeName;
  }

  cast(value: unknown): string | null {
    if (value == null) return null;
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
