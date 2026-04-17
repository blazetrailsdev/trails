/**
 * PostgreSQL specialized string type — for types like tsvector, ltree,
 * citext, line, lseg, box, path, polygon, circle that are stored as
 * strings but report a specific type symbol.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::SpecializedString.
 * Rails: `class SpecializedString < Type::String; attr_reader :type;
 * def initialize(type, **options); @type = type; super(**options); end`.
 */

import { StringType } from "@blazetrails/activemodel";

export class SpecializedString extends StringType {
  private readonly _type: string;

  constructor(
    type: string = "string",
    options?: { precision?: number; limit?: number; scale?: number },
  ) {
    super(options);
    this._type = type;
  }

  override type(): string {
    return this._type;
  }
}
