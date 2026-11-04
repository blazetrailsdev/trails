import "../../../constants.postgresql-oid-jsonb.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override type(): string {
    return "jsonb";
  }
}

ConnectionAdapters.PostgreSQL.OID.Jsonb = Jsonb;
