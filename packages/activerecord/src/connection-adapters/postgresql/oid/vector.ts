/**
 * PostgreSQL vector type — used for pgvector extension.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Vector
 */

export class Vector {
  readonly delim: string;
  readonly subtype: unknown;

  constructor(delim: string, subtype: unknown) {
    this.delim = delim;
    this.subtype = subtype;
  }

  cast(value: unknown): unknown {
    // Rails currently leaves composite/vector values untouched.
    return value;
  }
}
