import { isAsciiOnly } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";
import { Utilities } from "../utilities.js";
import { EightBit } from "./8bit.js";

export class SevenBit extends EightBit {
  static override readonly NAME: string = "7bit";
  static override readonly PRIORITY: number = 1;
  static {
    Encodings.register(this.NAME, this);
  }

  static override decode(str: string | Uint8Array): string | Uint8Array {
    return Utilities.binaryUnsafeToLf(str);
  }

  static override encode(str: string | Uint8Array): string | Uint8Array {
    return Utilities.binaryUnsafeToCrlf(str);
  }

  static override isCompatibleInput(str: string): boolean {
    return isAsciiOnly(str) && super.isCompatibleInput(str);
  }
}
