import { Encodings } from "../encodings.js";
import { Utilities } from "../utilities.js";
import { SevenBit } from "./7bit.js";
import type { TransferEncoding } from "./transfer-encoding.js";

export class Base64 extends SevenBit {
  static override readonly NAME: string = "base64";
  static override readonly PRIORITY: number = 3;
  static {
    Encodings.register(this.NAME, this);
  }

  static override canEncode(_enc: typeof TransferEncoding | null): boolean {
    return true;
  }

  static override decode(str: string | Uint8Array): Uint8Array {
    return Utilities.decodeBase64(str as string);
  }

  static override encode(str: string | Uint8Array): string {
    return Utilities.binaryUnsafeToCrlf(Utilities.encodeBase64(str));
  }

  static override cost(_str: string): number {
    return 4.0 / 3;
  }

  static override isCompatibleInput(_str: string): boolean {
    return true;
  }
}
