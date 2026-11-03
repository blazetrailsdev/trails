import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { Bit } from "./bit.js";

export class BitVarying extends Bit {
  override type(): string {
    return "bit_varying";
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "BitVarying", BitVarying);
