import "../../../constants.postgresql-oid-inet.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override type(): string {
    return "inet";
  }
}

ConnectionAdapters.PostgreSQL.OID.Inet = Inet;
