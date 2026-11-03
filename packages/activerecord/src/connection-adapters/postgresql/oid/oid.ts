import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { UnsignedInteger } from "../../../type/unsigned-integer.js";

export class Oid extends UnsignedInteger {
  override type(): string {
    return "oid";
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "Oid", Oid);
