import { ArgumentError } from "@blazetrails/ruby-compat";
import { getCrypto } from "./crypto-adapter.js";

export class SecurityUtils {
  static fixedLengthSecureCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
      throw new ArgumentError("string length mismatch.");
    }

    return getCrypto().timingSafeEqual(aBuf, bBuf);
  }

  /**
   * Secure string comparison for strings of variable length.
   *
   * Mirrors: `SecurityUtils#secure_compare` (`security_utils.rb:32-34`) — the
   * length guard short-circuits so the constant-time compare only ever runs on
   * equal-length inputs, which is why it can raise on a mismatch.
   */
  static secureCompare(a: string, b: string): boolean {
    return (
      Buffer.byteLength(a) === Buffer.byteLength(b) && SecurityUtils.fixedLengthSecureCompare(a, b)
    );
  }
}
