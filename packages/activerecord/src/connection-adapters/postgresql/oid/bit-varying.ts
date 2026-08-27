import { Bit } from "./bit.js";

export class BitVarying extends Bit {
  override readonly name = "bit_varying";

  override type(): string {
    return "bit_varying";
  }
}
