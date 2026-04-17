/**
 * PostgreSQL vector type — used for composite/pgvector columns.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Vector.
 * Rails: `class Vector < Type::Value`. Only implements cast (as identity
 * — the class carries the FIXME that it should split on delim and use
 * subtype.cast, but current Rails behavior is the raw passthrough).
 */

import { Type } from "@blazetrails/activemodel";

export class Vector extends Type<unknown> {
  readonly name: string = "vector";
  readonly delim: string;
  readonly subtype: unknown;

  constructor(delim: string, subtype: unknown) {
    super();
    this.delim = delim;
    this.subtype = subtype;
  }

  // Rails' Vector inherits Type::Value#type which is `def type; end`
  // (returns nil). Don't override — let the base class' type() return
  // this.name ("vector"), matching Rails' effective behavior for
  // callers that coerce nil to a typname string. If Rails-accurate
  // `nil` is ever required, the base's return type needs widening
  // first.

  cast(value: unknown): unknown {
    // Rails: `def cast(value); value; end`. Matches the FIXME'd
    // passthrough exactly.
    return value;
  }
}
