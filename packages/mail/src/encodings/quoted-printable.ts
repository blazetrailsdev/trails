import { b, pack, strCount, unpack } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";
import { Utilities } from "../utilities.js";
import { EightBit } from "./8bit.js";
import { SevenBit } from "./7bit.js";
import type { TransferEncoding } from "./transfer-encoding.js";

export class QuotedPrintable extends SevenBit {
  static override readonly NAME: string = "quoted-printable";

  static override readonly PRIORITY: number = 2;

  static override canEncode(enc: typeof TransferEncoding | null): boolean {
    return EightBit.canEncode(enc);
  }

  static override decode(str: string): Uint8Array {
    return Utilities.toLf(
      unpack(
        Utilities.toCrlf(str).replace(/(?:=0D=0A|=0D|=0A)\r\n/g, "\r\n"),
        "M*",
      )[0] as Uint8Array,
    );
  }

  static override encode(str: string | Uint8Array): string {
    return Utilities.toCrlf(pack([Utilities.toLf(str)], "M"));
  }

  static override cost(str: string): number {
    const c = strCount(str, ["\x09\x0a\x0d\x20-\x3c\x3e-\x7e"]);
    const total = (b(str).length - c) * 3 + c;
    return total / b(str).length;
  }

  static override isCompatibleInput(_str: string): boolean {
    return true;
  }

  static {
    Encodings.register(this.NAME, this);
  }
}
