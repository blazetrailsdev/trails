import { registerConstant } from "@blazetrails/activesupport";
import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override type(): string {
    return "jsonb";
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Jsonb", Jsonb);
