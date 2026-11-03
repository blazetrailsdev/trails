import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "Timestamp", Timestamp);
