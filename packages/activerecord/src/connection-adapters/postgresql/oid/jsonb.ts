/**
 * PostgreSQL jsonb type — binary JSON storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb.
 * Rails: `class Jsonb < Type::Json; include Helpers::Mutable`. Overrides
 * `type` to return :jsonb; `name` is also set to "jsonb" (Trails-specific
 * property). `cast` parses JSON strings directly and round-trips non-string
 * values through serialize for reference detachment; `isMutable` and
 * `isChangedInPlace` come from MutableModule.
 */

import { MutableModule } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override readonly name: string = "jsonb";

  override type(): string {
    return "jsonb";
  }

  override cast(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return super.cast(value);
    return super.cast(this.serialize(value));
  }
}

include(Jsonb, MutableModule);
