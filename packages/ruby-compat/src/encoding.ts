import { ArgumentError } from "./argument-error.js";

const ROWS: readonly [name: string, decoderLabel: string | null, aliases: string[]][] = [
  ["ASCII-8BIT", null, ["BINARY"]],
  ["UTF-8", "utf-8", ["CP65001", "locale", "external", "filesystem"]],
  ["US-ASCII", "windows-1252", ["ASCII", "ANSI_X3.4-1968", "646"]],
  ["UTF-16BE", "utf-16be", ["UCS-2BE"]],
  ["UTF-16LE", "utf-16le", []],
  ["UTF-32BE", null, ["UCS-4BE"]],
  ["UTF-32LE", null, ["UCS-4LE"]],
  ["UTF-16", null, []],
  ["UTF-32", null, []],
  ["UTF8-MAC", "utf-8", ["UTF-8-MAC", "UTF-8-HFS"]],
  ["EUC-JP", "euc-jp", ["eucJP"]],
  ["Windows-31J", "shift_jis", ["CP932", "csWindows31J", "SJIS", "PCK"]],
  ["Big5", "big5", []],
  ["Big5-HKSCS", "big5", ["Big5-HKSCS:2008"]],
  ["Big5-UAO", null, []],
  ["CESU-8", null, []],
  ["CP949", "euc-kr", []],
  ["Emacs-Mule", null, []],
  ["EUC-KR", "euc-kr", ["eucKR"]],
  ["EUC-TW", null, ["eucTW"]],
  ["GB18030", "gb18030", []],
  ["GBK", "gbk", ["CP936"]],
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
  ["KOI8-R", "koi8-r", ["CP878"]],
  ["KOI8-U", "koi8-u", []],
  ["Shift_JIS", "shift_jis", []],
  ["Windows-1250", "windows-1250", ["CP1250"]],
  ["Windows-1251", "windows-1251", ["CP1251"]],
  ["Windows-1252", "windows-1252", ["CP1252"]],
  ["Windows-1253", "windows-1253", ["CP1253"]],
  ["Windows-1254", "windows-1254", ["CP1254"]],
  ["Windows-1257", "windows-1257", ["CP1257"]],
  ["IBM437", null, ["CP437"]],
  ["IBM720", null, ["CP720"]],
  ["IBM737", null, ["CP737"]],
  ["IBM775", null, ["CP775"]],
  ["CP850", null, ["IBM850"]],
  ["IBM852", null, []],
  ["CP852", null, []],
  ["IBM855", null, []],
  ["CP855", null, []],
  ["IBM857", null, ["CP857"]],
  ["IBM860", null, ["CP860"]],
  ["IBM861", null, ["CP861"]],
  ["IBM862", null, ["CP862"]],
  ["IBM863", null, ["CP863"]],
  ["IBM864", null, ["CP864"]],
  ["IBM865", null, ["CP865"]],
  ["IBM866", "ibm866", ["CP866"]],
  ["IBM869", null, ["CP869"]],
  ["Windows-1258", "windows-1258", ["CP1258"]],
  ["GB1988", null, []],
  ["macCentEuro", null, []],
  ["macCroatian", null, []],
  ["macCyrillic", "x-mac-cyrillic", []],
  ["macGreek", null, []],
  ["macIceland", null, []],
  ["macRoman", "macintosh", []],
  ["macRomania", null, []],
  ["macThai", null, []],
  ["macTurkish", null, []],
  ["macUkraine", null, []],
  ["CP950", "big5", []],
  ["CP951", "big5", []],
  ["IBM037", null, ["ebcdic-cp-us"]],
  ["stateless-ISO-2022-JP", null, []],
  ["eucJP-ms", null, ["euc-jp-ms"]],
  ["CP51932", null, []],
  ["EUC-JIS-2004", null, ["EUC-JISX0213"]],
  ["GB2312", "gbk", ["EUC-CN", "eucCN"]],
  ["GB12345", null, []],
  ["ISO-2022-JP", "iso-2022-jp", ["ISO2022-JP"]],
  ["ISO-2022-JP-2", null, ["ISO2022-JP2"]],
  ["CP50220", null, []],
  ["CP50221", null, []],
  ["Windows-1256", "windows-1256", ["CP1256"]],
  ["Windows-1255", "windows-1255", ["CP1255"]],
  ["TIS-620", "windows-874", []],
  ["Windows-874", "windows-874", ["CP874"]],
  ["MacJapanese", null, ["MacJapan"]],
  ["UTF-7", null, ["CP65000"]],
  ["UTF8-DoCoMo", null, []],
  ["SJIS-DoCoMo", null, []],
  ["UTF8-KDDI", null, []],
  ["SJIS-KDDI", null, []],
  ["ISO-2022-JP-KDDI", null, []],
  ["stateless-ISO-2022-JP-KDDI", null, []],
  ["UTF8-SoftBank", null, []],
  ["SJIS-SoftBank", null, []],
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
 * The table carries every one of MRI's 175 names — the 103 canonical names
 * `Encoding.list` reports plus the 72 aliases in `Encoding.aliases`, read off
 * the pinned ruby 3.3.11 ref — so a name resolves here exactly where it
 * resolves in Ruby and raises `ArgumentError` exactly where Ruby raises.
 *
 * Each entry names the `TextDecoder` label that implements it, `null` where JS
 * has no decoder for it at all (`ASCII-8BIT`, `UTF-7`, `EUC-TW`, the IBM code
 * pages, Emacs-Mule and the vendor Japanese sets). A `null` row still
 * resolves, because the accept/reject criterion is the registry's and not the
 * decoder's — `Rack::Multipart::Parser#find_encoding`
 * (`vendor/rack/lib/rack/multipart/parser.rb:489-493`) asks the registry, and
 * a name Ruby registers must not fall to `BINARY` here. MRI has no such field
 * because its decoder IS the registry entry (`rb_encoding *`), and JS keeps
 * the two apart.
 *
 * The one name in `Encoding.name_list` with no row is `internal`, which
 * `enc_find` resolves through `rb_default_internal_encoding` and which MRI
 * answers `nil` for whenever `Encoding.default_internal` is unset — the state
 * trails is always in, since it has no `default_internal` to set.
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
   * `Encoding::US_ASCII` — the four registry constants trails' callers name.
   * MRI defines one per registered name and alias, from `set_encoding_const`
   * (`rb_define_const`, `vendor/ruby/encoding.c:1753`).
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
