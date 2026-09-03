import { ArgumentError } from "./argument-error.js";

const ROWS: readonly [name: string, decoderLabel: string | null, aliases: string[]][] = [
  ["ASCII-8BIT", null, ["BINARY"]],
  ["UTF-8", "utf-8", ["CP65001", "locale", "external", "filesystem"]],
  ["US-ASCII", "windows-1252", ["ASCII", "ANSI_X3.4-1968", "646"]],
  ["UTF-16BE", "utf-16be", ["UCS-2BE"]],
  ["UTF-16LE", "utf-16le", []],
  ["EUC-JP", "euc-jp", ["eucJP"]],
  ["Windows-31J", "shift_jis", ["CP932", "csWindows31J", "SJIS", "PCK"]],
  ["Shift_JIS", "shift_jis", []],
  ["ISO-2022-JP", "iso-2022-jp", ["ISO2022-JP"]],
  ["Big5", "big5", []],
  ["EUC-KR", "euc-kr", ["eucKR"]],
  ["CP949", "euc-kr", []],
  ["GB18030", "gb18030", []],
  ["GBK", "gbk", ["CP936"]],
  ["KOI8-R", "koi8-r", ["CP878"]],
  ["KOI8-U", "koi8-u", []],
  ["IBM866", "ibm866", ["CP866"]],
  ["TIS-620", "windows-874", []],
  ["Windows-874", "windows-874", ["CP874"]],
  ["ISO-8859-1", "iso-8859-1", ["ISO8859-1"]],
  ["ISO-8859-2", "iso-8859-2", ["ISO8859-2"]],
  ["ISO-8859-3", "iso-8859-3", ["ISO8859-3"]],
  ["ISO-8859-4", "iso-8859-4", ["ISO8859-4"]],
  ["ISO-8859-5", "iso-8859-5", ["ISO8859-5"]],
  ["ISO-8859-6", "iso-8859-6", ["ISO8859-6"]],
  ["ISO-8859-7", "iso-8859-7", ["ISO8859-7"]],
  ["ISO-8859-8", "iso-8859-8", ["ISO8859-8"]],
  ["ISO-8859-9", "windows-1254", ["ISO8859-9"]],
  ["ISO-8859-10", "iso-8859-10", ["ISO8859-10"]],
  ["ISO-8859-11", "windows-874", ["ISO8859-11"]],
  ["ISO-8859-13", "iso-8859-13", ["ISO8859-13"]],
  ["ISO-8859-14", "iso-8859-14", ["ISO8859-14"]],
  ["ISO-8859-15", "iso-8859-15", ["ISO8859-15"]],
  ["ISO-8859-16", "iso-8859-16", ["ISO8859-16"]],
  ["Windows-1250", "windows-1250", ["CP1250"]],
  ["Windows-1251", "windows-1251", ["CP1251"]],
  ["Windows-1252", "windows-1252", ["CP1252"]],
  ["Windows-1253", "windows-1253", ["CP1253"]],
  ["Windows-1254", "windows-1254", ["CP1254"]],
  ["Windows-1255", "windows-1255", ["CP1255"]],
  ["Windows-1256", "windows-1256", ["CP1256"]],
  ["Windows-1257", "windows-1257", ["CP1257"]],
  ["Windows-1258", "windows-1258", ["CP1258"]],
];

/**
 * Ruby core `Encoding` — the registry `Encoding.find` (`enc_find`,
 * `vendor/ruby/encoding.c:1368`) resolves a name against, which Rails inherits
 * rather than defines.
 *
 * The registry is Ruby's, not WHATWG's, because that is the accept/reject
 * criterion every caller is porting: `Rack::Multipart::Parser#find_encoding`
 * (`vendor/rack/lib/rack/multipart/parser.rb:489-493`) treats an unknown
 * charset as binary, and which charsets are unknown is what the two registries
 * disagree about. `TextDecoder` rejects `ASCII-8BIT`, `BINARY`, `CP932`,
 * `CP949` and `646`, all of which Ruby resolves, and accepts WHATWG-only
 * labels (`unicode-1-1-utf-8`, `x-mac-cyrillic`, `csisolatin1`) that Ruby
 * rejects.
 *
 * The table is scoped to the encodings a Rack charset parameter can carry
 * rather than MRI's full 175 names — a name outside it raises the same
 * `ArgumentError` an unregistered name does, and the table grows with the
 * callers.
 *
 * Each entry names the `TextDecoder` label that implements it, `null` for the
 * two binary names; MRI has no such field because its decoder IS the registry
 * entry (`rb_encoding *`), and JS keeps the two apart.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Encoding` (`vendor/ruby/encoding.c:1368`).
 */
export class Encoding {
  static readonly #registry = new Map<string, Encoding>();

  static {
    for (const [name, decoderLabel, aliases] of ROWS) {
      const encoding = new Encoding(name, decoderLabel);
      for (const key of [name, ...aliases]) Encoding.#registry.set(key.toLowerCase(), encoding);
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding#name`
   * (`vendor/ruby/encoding.c:1112` `enc_name`).
   */
  readonly name: string;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  readonly decoderLabel: string | null;

  private constructor(name: string, decoderLabel: string | null) {
    this.name = name;
    this.decoderLabel = decoderLabel;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding#to_s`
   * (`vendor/ruby/encoding.c:1112` `enc_name`, aliased to `to_s`).
   */
  toString(): string {
    return this.name;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding#inspect`
   * (`vendor/ruby/encoding.c:1094` `enc_inspect`).
   */
  inspect(): string {
    return `#<Encoding:${this.name}>`;
  }

  /**
   * `Encoding.find` (`enc_find`, `vendor/ruby/encoding.c:1368`) — the registry
   * lookup, which `str_to_encindex` (`encoding.c:307-313`) raises
   * `ArgumentError: unknown encoding name - <name>` from when the name is not
   * registered. The lookup is case-insensitive, as `enc_registered`'s
   * case-folding table is.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding.find` (`vendor/ruby/encoding.c:1368`).
   */
  static find(enc: string | Encoding): Encoding {
    if (enc instanceof Encoding) return enc;
    const found = Encoding.#registry.get(String(enc).toLowerCase());
    if (found === undefined) {
      throw new ArgumentError(`unknown encoding name - ${String(enc)}`);
    }
    return found;
  }

  /**
   * `Encoding::ASCII_8BIT` and its `BINARY` alias, `Encoding::UTF_8` and
   * `Encoding::US_ASCII` — the four registry constants trails' callers name
   * (`rb_define_const` per entry, `vendor/ruby/encoding.c:1544`
   * `rb_enc_set_base`/`enc_register`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::ASCII_8BIT`.
   */
  static readonly ASCII_8BIT = Encoding.find("ASCII-8BIT");

  /** @noRailsEquivalent PERMANENT */
  static readonly BINARY = Encoding.ASCII_8BIT;

  /** @noRailsEquivalent PERMANENT */
  static readonly UTF_8 = Encoding.find("UTF-8");

  /** @noRailsEquivalent PERMANENT */
  static readonly US_ASCII = Encoding.find("US-ASCII");
}
