import { b } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";
import { Binary } from "./binary.js";

export class EightBit extends Binary {
  static override readonly NAME: string = "8bit";
  static override readonly PRIORITY: number = 4;
  static {
    Encodings.register(this.NAME, this);
  }

  static override isCompatibleInput(str: string): boolean {
    return !str.split(/(?<=\n)/).find((line) => b(line).length > 998);
  }
}
