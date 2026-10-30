import {
  ArgumentError,
  b,
  byteslice,
  capitalize,
  casecmp,
  ConverterNotFoundError,
  DEFAULT_PARSER,
  encode,
  forceEncoding,
  InvalidByteSequenceError,
  isEmpty,
  rbInspect,
  rbStrByteslice,
  rbStrEnumerateLines,
  UndefinedConversionError,
  warn,
  Encoding,
  isAsciiOnly,
  isValidEncoding,
  pack,
  rbObjEncoding,
  rbObjRespondTo,
  unpack,
} from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import * as Constants from "./constants.js";
import { Encodings } from "./encodings.js";

type RubyString = string | Uint8Array;

export interface CharsetEncoder {
  encode(string: RubyString, charset: string): RubyString;
}

class StrictCharsetEncoder implements CharsetEncoder {
  encode(string: RubyString, charset: string): RubyString {
    if (/utf-?7/i.test(charset)) {
      return Utilities.decodeUtf7(string);
    } else {
      return forceEncoding(b(string), Utilities.pickEncoding(charset));
    }
  }
}

class BestEffortCharsetEncoder implements CharsetEncoder {
  encode(string: RubyString, charset: string): RubyString {
    if (/utf-?7/i.test(charset)) {
      return Utilities.decodeUtf7(string);
    } else {
      return forceEncoding(b(string), this.pickEncoding(charset));
    }
  }

  /** @internal */
  private pickEncoding(charset: string): Encoding {
    let resolved = charset;
    if (/ansi_x3.110-1983/.test(charset)) {
      resolved = "ISO-8859-1";
    } else if (/Windows-?1258/i.test(charset)) {
      resolved = "Windows-1252";
    }
    return Utilities.pickEncoding(resolved);
  }
}

/** @noRailsEquivalent PERMANENT */
function gsubBytes(string: Uint8Array, re: RegExp, replacement: string): Uint8Array {
  const scanned = Array.from(string, (c) => String.fromCharCode(c))
    .join("")
    .replace(re, replacement);
  return Uint8Array.from(scanned, (c) => c.charCodeAt(0));
}

export const Utilities = {
  StrictCharsetEncoder,
  BestEffortCharsetEncoder,

  charsetEncoder: new BestEffortCharsetEncoder() as CharsetEncoder,

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
    const m = /(?:^|(?<=\n))"([^\n]*?)"(?=\n|$)/.exec(str);
    if (m) {
      return Utilities.unescape(m[1]);
    } else {
      return str;
    }
  },

  unescape(str: string): string {
    return str.replace(/\\([^\n])/g, "$1");
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
      return !/[^\t\n\v\f\r ]/.test(value);
    } else if (value instanceof Uint8Array) {
      return value.every((c) => c === 0x20 || (c >= 0x09 && c <= 0x0d));
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

  /** @missingRailsArgs encode — PERMANENT */
  transcodeCharset(
    str: RubyString,
    fromEncoding: string,
    toEncoding: string | Encoding = Encoding.UTF_8,
  ): RubyString {
    toEncoding = Encoding.find(toEncoding)!;
    return encode(Utilities.charsetEncoder.encode(b(str), fromEncoding), toEncoding, {
      undef: ":replace",
      invalid: ":replace",
    });
  },

  /** @missingRailsArgs encode — PERMANENT */
  encodeUtf7(string: string): Uint8Array {
    return b(
      string.replace(/(&)|[^\x20-\x7e]+/g, (m, amp: string | undefined) => {
        if (amp != null) {
          return "&-";
        } else {
          const base64 = pack([encode(m, Encoding.find("UTF-16BE")!)], "m0");
          return "&" + base64.replaceAll("=", "").replaceAll("/", ",") + "-";
        }
      }),
    );
  },

  /** @missingRailsArgs encode — PERMANENT */
  decodeUtf7(utf7: RubyString): RubyString {
    const scanned = Array.from(b(utf7), (c) => String.fromCharCode(c))
      .join("")
      .replace(/&([^-]+)?-/g, (_m, s: string | undefined) => {
        if (s != null) {
          const decoded = forceEncoding(
            unpack(s.replaceAll(",", "/") + "===", "m")[0] as Uint8Array,
            "UTF-16BE",
          );
          return String.fromCharCode(...b(encode(decoded, Encoding.UTF_8)));
        } else {
          return "&";
        }
      });
    return forceEncoding(
      Uint8Array.from(scanned, (c) => c.charCodeAt(0)),
      Encoding.UTF_8,
    );
  },

  bValueEncode(str: RubyString, _encoding: string | null = null): [string, string] {
    const encoding = rbObjEncoding(str).toString();
    return [Utilities.encodeBase64(str), encoding];
  },

  bValueDecode(str: RubyString): RubyString {
    try {
      const match = /=\?(.+)?\?[Bb]\?(.*)\?=/s.exec(str as string);
      if (match) {
        const charset = match[1];
        str = Utilities.decodeBase64(match[2]);
        str = Utilities.charsetEncoder.encode(str, charset);
      }
      return Utilities.transcodeToScrubbedUtf8(str);
    } catch (e) {
      if (
        !(
          e instanceof UndefinedConversionError ||
          e instanceof ArgumentError ||
          e instanceof ConverterNotFoundError ||
          e instanceof InvalidByteSequenceError
        )
      ) {
        throw e;
      }
      warn(`Encoding conversion failed ${e.message}`);
      return forceEncoding(b(str), Encoding.UTF_8);
    }
  },

  qValueEncode(str: RubyString, _encoding: string | null = null): [string, string] {
    const encoding = rbObjEncoding(str).toString();
    return [Encodings.QuotedPrintable!.encode(str), encoding];
  },

  qValueDecode(str: RubyString): RubyString {
    try {
      const match = /=\?(.+)?\?[Qq]\?(.*)\?=/s.exec(str as string);
      if (match) {
        const charset = match[1];
        let string = match[2].replace(/_/g, "=20");
        string = string.replace(/=$/m, "");
        str = Encodings.QuotedPrintable!.decode(string);
        str = Utilities.charsetEncoder.encode(str, charset);
        if (rbObjEncoding(str) === Encoding.ASCII_8BIT) str = forceEncoding(str, Encoding.UTF_8);
      }
      return Utilities.transcodeToScrubbedUtf8(str);
    } catch (e) {
      if (
        !(
          e instanceof UndefinedConversionError ||
          e instanceof ArgumentError ||
          e instanceof ConverterNotFoundError
        )
      ) {
        throw e;
      }
      warn(`Encoding conversion failed ${e.message}`);
      return forceEncoding(b(str), Encoding.UTF_8);
    }
  },

  paramDecode(str: RubyString, encoding: string | null): RubyString {
    try {
      str = Utilities.uriParser().unescape(str as string);
      if (encoding != null) str = Utilities.charsetEncoder.encode(str, encoding);
      return Utilities.transcodeToScrubbedUtf8(str);
    } catch (e) {
      if (
        !(
          e instanceof UndefinedConversionError ||
          e instanceof ArgumentError ||
          e instanceof ConverterNotFoundError
        )
      ) {
        throw e;
      }
      warn(`Encoding conversion failed ${e.message}`);
      return forceEncoding(b(str), Encoding.UTF_8);
    }
  },

  paramEncode(str: string): string {
    const encoding = rbObjEncoding(str).toString().toLowerCase();
    const language = Configuration.instance().paramEncodeLanguage();
    return `${encoding}'${language}'${Utilities.uriParser().escape(str)}`;
  },

  uriParser(): typeof DEFAULT_PARSER {
    return DEFAULT_PARSER;
  },

  pickEncoding(charset: unknown): Encoding {
    charset = String(charset ?? "");
    const down = (charset as string).toLowerCase();
    let encoding: unknown;
    let m: RegExpExecArray | null;

    if ((m = /^iso[-_]?8859-(\d+)(-i)?$/m.exec(down))) {
      encoding = `ISO-8859-${m[1]}`;
    } else if ((m = /^iso[-_]?(\d{4})-?(\w{1,2})$/m.exec(down))) {
      encoding = `ISO-${m[1]}-${m[2]}`;
    } else if ((m = /^iso[-_]?(\d{4})-?(\w{1,2})-?(\w*)$/m.exec(down))) {
      encoding = `ISO-${m[1]}-${m[2]}-${m[3]}`;
    } else if ((m = /^utf[-_]?(\d{1,2})?(\w{1,2})$/m.exec(down))) {
      encoding = `UTF-${m[1] ?? ""}${m[2]}`.replace(/^(UTF-(?:16|32))$/, "$1BE");
    } else if ((m = /^windows-?(.*)$/m.exec(down))) {
      encoding = `Windows-${m[1]}`;
    } else if (down === "8bit") {
      encoding = Encoding.ASCII_8BIT;
    } else if (/^iso[-_]?646(-us)?$/m.test(down) || down === "us=ascii") {
      encoding = Encoding.US_ASCII;
    } else if (down === "macintosh") {
      encoding = Encoding.find("macRoman");
    } else if (down === "ks_c_5601-1987") {
      encoding = Encoding.find("CP949");
    } else if (down === "shift-jis") {
      encoding = Encoding.SHIFT_JIS;
    } else if (down === "gb2312") {
      encoding = Encoding.find("GB18030");
    } else if (down === "cp-850") {
      encoding = Encoding.find("CP850");
    } else if (down === "latin2") {
      encoding = Encoding.find("ISO-8859-2");
    } else {
      encoding = charset;
    }

    return Utilities.convertToEncoding(encoding as string | Encoding);
  },

  stringByteslice(str: RubyString, ...args: unknown[]): RubyString | null {
    return typeof str === "string" ? rbStrByteslice(str, ...args) : byteslice(str, ...args);
  },

  /** @internal */
  convertToEncoding(encoding: string | Encoding): Encoding {
    if (encoding instanceof Encoding) {
      return encoding;
    } else {
      try {
        return Encoding.find(encoding)!;
      } catch (e) {
        if (!(e instanceof ArgumentError)) throw e;
        return Encoding.BINARY;
      }
    }
  },

  /**
   * @internal
   * @missingRailsArgs encode — PERMANENT
   */
  transcodeToScrubbedUtf8(str: RubyString): string {
    const decoded = encode(str, Encoding.UTF_8, {
      undef: ":replace",
      invalid: ":replace",
    }) as string;
    return /\p{Cs}/u.test(decoded) ? decoded.replace(/\p{Cs}/gu, "\ufffd") : decoded;
  },
};
