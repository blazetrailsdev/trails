/**
 * PostgreSQL jsonb type — binary JSON storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb.
 * Rails: `class Jsonb < Type::Json`. Overrides `type` to return :jsonb; `name`
 * is also set to "jsonb" (Trails-specific property) so call sites that read
 * `type.name` for schema reflection see "jsonb" rather than the inherited "json".
 */

import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override readonly name: string = "jsonb";

  override type(): string {
    return "jsonb";
  }
}
