import { ArgumentError, getCrypto } from "@blazetrails/ruby-compat";

export class SecurityUtils {
  static fixedLengthSecureCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
      throw new ArgumentError("string length mismatch.");
    }

    return getCrypto().timingSafeEqual(aBuf, bBuf);
  }

  static secureCompare(a: string, b: string): boolean {
    return (
      Buffer.byteLength(a) === Buffer.byteLength(b) && SecurityUtils.fixedLengthSecureCompare(a, b)
    );
  }
}
