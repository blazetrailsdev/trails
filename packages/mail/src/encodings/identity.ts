import { TransferEncoding } from "./transfer-encoding.js";

export class Identity extends TransferEncoding {
  static decode(str: string | Uint8Array): string | Uint8Array {
    return str;
  }

  static encode(str: string | Uint8Array): string | Uint8Array {
    return str;
  }

  static override cost(_str: string): number {
    return 1.0;
  }
}
