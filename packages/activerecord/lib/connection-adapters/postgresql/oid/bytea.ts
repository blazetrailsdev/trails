import "../../../constants.postgresql-oid-bytea.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { BinaryType, BinaryData } from "@blazetrails/activemodel";
import { PG } from "@blazetrails/pg";

export class Bytea extends BinaryType {
  override deserialize(value: unknown): unknown {
    if (value == null) return null;
    if (value instanceof BinaryData) return value.toString();
    return PG.Connection.unescapeBytea(super.deserialize(value) as Uint8Array);
  }
}

ConnectionAdapters.PostgreSQL.OID.Bytea = Bytea;
