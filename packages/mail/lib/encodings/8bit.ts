import { b, binaryString } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";
import { Binary } from "./binary.js";

export class EightBit extends Binary {
  static override readonly NAME: string = "8bit";
  static override readonly PRIORITY: number = 4;
  static {
    Encodings.EightBit = this;
    Encodings.register(this.NAME, this);
  }

  static override isCompatibleInput(str: string | Uint8Array): boolean {
    const binary = str instanceof Uint8Array;
    return !(binary ? binaryString(str) : str)
      .split(/(?<=\n)/)
      .find((line) => (binary ? line.length : b(line).length) > 998);
  }
}
