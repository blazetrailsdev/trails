import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override type(): string {
    return "jsonb";
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "Jsonb", Jsonb);
