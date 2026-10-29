import { pack, unpack } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";
import { TransferEncoding } from "./transfer-encoding.js";

export class UnixToUnix extends TransferEncoding {
  static override readonly NAME: string = "x-uuencode";

  static decode(str: string): Uint8Array {
    return unpack(str.replace(/^begin \d+ [^\n]*\n/, ""), "u")[0] as Uint8Array;
  }

  static encode(str: string | Uint8Array): string {
    return pack([str], "u");
  }

  static {
    Encodings.register(this.NAME, this);
    Encodings.register("uuencode", this);
    Encodings.register("x-uue", this);
  }
}
