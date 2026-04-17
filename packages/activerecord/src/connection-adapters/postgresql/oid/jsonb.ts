/**
 * PostgreSQL jsonb type — binary JSON storage.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb.
 * Rails: `class Jsonb < Type::Json`. Only overrides `type` to return :jsonb.
 */

import { JsonType } from "@blazetrails/activemodel";

export class Jsonb extends JsonType {
  override readonly name: string = "jsonb";

  override type(): string {
    return "jsonb";
  }
}
