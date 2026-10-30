import {
  capitalize,
  casecmp,
  DEFAULT_PARSER,
  isEmpty,
  rbInspect,
  rbObjRespondTo,
  rbStrEnumerateLines,
  Encoding,
  isAsciiOnly,
  isValidEncoding,
  pack,
  rbObjEncoding,
  rbObjRespondTo,
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
  isAtomSafe(str: string): boolean {
    return !Constants.ATOM_UNSAFE.test(str);
  },

  quoteAtom(str: string): string {
    return Utilities.isAtomSafe(str) ? str : Utilities.dquote(str);
  },

  quotePhrase(str: string): string {
    return Constants.PHRASE_UNSAFE.test(str) ? Utilities.dquote(str) : str;
  },

  isTokenSafe(str: string): boolean {
    return !Constants.TOKEN_UNSAFE.test(str);
  },

  quoteToken(str: string): string {
    return Utilities.isTokenSafe(str) ? str : Utilities.dquote(str);
  },

  dquote(str: string): string {
    return '"' + Utilities.unquote(str).replace(/[\\"]/g, (s) => "\\" + s) + '"';
  },

  unquote(str: string): string {
    const m = /^"(.*?)"$/m.exec(str);
    if (m) {
      return Utilities.unescape(m[1]);
    } else {
      return str;
    }
  },

  unescape(str: string): string {
    return str.replace(/\\(.)/g, "$1");
  },

  unparen(str: string): string {
    if (str.startsWith("(") && str.endsWith(")")) {
      return str.slice(1, -1);
    } else {
      return str;
    }
  },

  unbracket(str: string): string {
    if (str.startsWith("<") && str.endsWith(">")) {
      return str.slice(1, -1);
    } else {
      return str;
    }
  },

  uriEscape(str: string): string {
    return Utilities.uriParser().escape(str);
  },

  uriUnescape(str: string): string {
    return Utilities.uriParser().unescape(str);
  },

  matchToS(obj1: unknown, obj2: unknown): boolean {
    return casecmp(String(obj1 ?? ""), String(obj2 ?? "")) === 0;
  },

  capitalizeField(str: unknown): string {
    return String(str ?? "")
      .split("-")
      .map((v) => capitalize(v, []))
      .join("-");
  },

  constantize(str: unknown): string {
    return rbInspect(
      String(str ?? "")
        .split(/[-_]/)
        .map((v) => capitalize(v, [])),
    );
  },

  dasherize(str: unknown): string {
    return String(str ?? "").replaceAll(Constants.UNDERSCORE, Constants.HYPHEN);
  },

  underscoreize(str: unknown): string {
    return String(str ?? "")
      .toLowerCase()
      .replaceAll(Constants.HYPHEN, Constants.UNDERSCORE);
  },

  mapLines<T>(str: string, block: (line: string) => T): T[] {
    return rbStrEnumerateLines(str, []).map((line) => block(line));
  },

  mapWithIndex<E, T>(enumerable: E[], block: (item: E, index: number) => T): T[] {
    return enumerable.map((item, index) => block(item, index));
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
    string = (string instanceof Uint8Array ? string : String(string ?? "")) as T;
    if (Utilities.isSafeForLineEndingConversion(string)) {
      return Utilities.binaryUnsafeToLf(string);
    } else {
      return string;
    }
  },

  toCrlf<T extends string | Uint8Array>(string: T): T {
    string = (string instanceof Uint8Array ? string : String(string ?? "")) as T;
    if (Utilities.isSafeForLineEndingConversion(string)) {
      return Utilities.binaryUnsafeToCrlf(string);
    } else {
      return string;
    }
  },

  isBlank(value: unknown): boolean {
    if (value == null) {
      return true;
    } else if (typeof value === "string") {
      return !/\S/.test(value);
    } else {
      return rbObjRespondTo(value, "isEmpty") ? isEmpty(value as object) : value === false;
    }
  },

  escapeParen(str: string): string {
    const re = /(?<!\\)([()])/g;
    return str.replace(re, (s) => "\\" + s);
  },

  paren(str: string): string {
    str = Utilities.unparen(str);
    str = Utilities.escapeParen(str);
    return "(" + str + ")";
  },

  escapeBracket(str: string): string {
    const re = /(?<!\\)([<>])/g;
    return str.replace(re, (s) => "\\" + s);
  },

  bracket(str: string): string {
    str = Utilities.unbracket(str);
    str = Utilities.escapeBracket(str);
    return "<" + str + ">";
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

  uriParser(): typeof DEFAULT_PARSER {
    return DEFAULT_PARSER;
  },
};
