/**
 * PostgreSQL bit varying type — variable-length bit string.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::BitVarying
 */

import { Bit } from "./bit.js";

export class BitVarying extends Bit {
  override get type(): string {
    return "bit_varying";
  }
}
