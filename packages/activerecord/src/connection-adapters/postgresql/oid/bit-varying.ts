import "../../../constants.postgresql-oid-bit-varying.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { Bit } from "./bit.js";

export class BitVarying extends Bit {
  override type(): string {
    return "bit_varying";
  }
}

ConnectionAdapters.PostgreSQL.OID.BitVarying = BitVarying;
