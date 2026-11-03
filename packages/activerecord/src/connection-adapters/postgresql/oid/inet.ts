import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override type(): string {
    return "inet";
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "Inet", Inet);
