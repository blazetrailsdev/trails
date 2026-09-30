import { registerConstant } from "@blazetrails/activesupport";
import { Bit } from "./bit.js";

export class BitVarying extends Bit {
  override type(): string {
    return "bit_varying";
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::BitVarying", BitVarying);
