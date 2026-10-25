import { ArgumentError, classModule, getCrypto, type Bytes } from "@blazetrails/ruby-compat";

function fixedLengthSecureCompare(a: string | Bytes, b: string | Bytes): boolean {
  const aBuf = typeof a === "string" ? Buffer.from(a) : a;
  const bBuf = typeof b === "string" ? Buffer.from(b) : b;

  if (aBuf.length !== bBuf.length) {
    throw new ArgumentError("string length mismatch.");
  }

  return getCrypto().timingSafeEqual(aBuf, bBuf);
}

function secureCompare(a: string, b: string): boolean {
  return Buffer.byteLength(a) === Buffer.byteLength(b) && fixedLengthSecureCompare(a, b);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- `module_function` (security_utils.rb:24,35): the instance half
export class SecurityUtils {
  static readonly [classModule] = true;
  static fixedLengthSecureCompare = fixedLengthSecureCompare;
  static secureCompare = secureCompare;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- `module_function` (security_utils.rb:24,35): the instance half
export interface SecurityUtils {
  fixedLengthSecureCompare(a: string | Bytes, b: string | Bytes): boolean;
  secureCompare(a: string, b: string): boolean;
}

Object.defineProperties(SecurityUtils.prototype, {
  fixedLengthSecureCompare: { value: fixedLengthSecureCompare, writable: true, configurable: true },
  secureCompare: { value: secureCompare, writable: true, configurable: true },
});
