import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { classModule } from "@blazetrails/ruby-compat/class-module";
import { getCrypto } from "@blazetrails/ruby-compat/crypto-adapter";
import type { Bytes } from "@blazetrails/ruby-compat/fs-adapter";

export class SecurityUtils {
  static readonly [classModule] = true;

  fixedLengthSecureCompare(a: string | Bytes, b: string | Bytes): boolean {
    const aBuf = typeof a === "string" ? Buffer.from(a) : a;
    const bBuf = typeof b === "string" ? Buffer.from(b) : b;

    if (aBuf.length !== bBuf.length) {
      throw new ArgumentError("string length mismatch.");
    }

    return getCrypto().timingSafeEqual(aBuf, bBuf);
  }

  secureCompare(a: string, b: string): boolean {
    return Buffer.byteLength(a) === Buffer.byteLength(b) && this.fixedLengthSecureCompare(a, b);
  }

  static fixedLengthSecureCompare = SecurityUtils.prototype.fixedLengthSecureCompare;
  static secureCompare = SecurityUtils.prototype.secureCompare;
}
