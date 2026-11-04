import "../../../constants.postgresql-oid-oid.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { UnsignedInteger } from "../../../type/unsigned-integer.js";

export class Oid extends UnsignedInteger {
  override type(): string {
    return "oid";
  }
}

ConnectionAdapters.PostgreSQL.OID.Oid = Oid;
