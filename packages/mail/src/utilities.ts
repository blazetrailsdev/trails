import {
  Encoding,
  isAsciiOnly,
  isValidEncoding,
  pack,
  rbObjEncoding,
  unpack,
} from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";

/** @noRailsEquivalent PERMANENT */
function gsubBytes(string: Uint8Array, re: RegExp, replacement: string): Uint8Array {
  const scanned = Array.from(string, (c) => String.fromCharCode(c))
    .join("")
    .replace(re, replacement);
  return Uint8Array.from(scanned, (c) => c.charCodeAt(0));
}

export const Utilities = {
  underscoreize(str: unknown): string {
    return String(str).toLowerCase().replaceAll(Constants.HYPHEN, Constants.UNDERSCORE);
  },

  binaryUnsafeToLf<T extends string | Uint8Array>(string: T): T {
    if (typeof string === "string") return string.replace(/\r\n|\r/g, Constants.LF) as T;
    return gsubBytes(string, /\r\n|\r/g, Constants.LF) as T;
  },

  TO_CRLF_REGEX: /(?<!\r)\n|\r(?!\n)/g,

  binaryUnsafeToCrlf<T extends string | Uint8Array>(string: T): T {
    if (typeof string === "string") {
      return string.replace(Utilities.TO_CRLF_REGEX, Constants.CRLF) as T;
    }
    return gsubBytes(string, Utilities.TO_CRLF_REGEX, Constants.CRLF) as T;
  },

  isSafeForLineEndingConversion(string: string | Uint8Array): boolean {
    if (rbObjEncoding(string) === Encoding.BINARY) {
      return isAsciiOnly(string);
    } else if (typeof string === "string") {
      return !/\p{Cs}/u.test(string);
    } else {
      return isValidEncoding(String.fromCharCode(...string), rbObjEncoding(string));
    }
  },

  toLf<T extends string | Uint8Array>(string: T): T {
    string = (string instanceof Uint8Array ? string : String(string)) as T;
    if (Utilities.isSafeForLineEndingConversion(string)) {
      return Utilities.binaryUnsafeToLf(string);
    } else {
      return string;
    }
  },

  toCrlf<T extends string | Uint8Array>(string: T): T {
    string = (string instanceof Uint8Array ? string : String(string)) as T;
    if (Utilities.isSafeForLineEndingConversion(string)) {
      return Utilities.binaryUnsafeToCrlf(string);
    } else {
      return string;
    }
  },

  decodeBase64(str: string): Uint8Array {
    if (!str.endsWith("=") && str.length % 4 !== 0) {
      str = str.padEnd((str.length + 3) & ~3, "=");
    }
    return unpack(str, "m")[0] as Uint8Array;
  },

  encodeBase64(str: string | Uint8Array): string {
    return pack([str], "m");
  },
};
