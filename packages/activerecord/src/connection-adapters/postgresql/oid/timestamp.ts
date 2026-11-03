import "../../../constants.postgresql-oid-timestamp.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}

ConnectionAdapters.PostgreSQL.OID.Timestamp = Timestamp;
