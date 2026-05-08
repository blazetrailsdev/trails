/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb
 */

import { MutableModule } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override readonly name: string = "jsonb";

  override type(): string {
    return "jsonb";
  }
}

include(Jsonb, MutableModule);
