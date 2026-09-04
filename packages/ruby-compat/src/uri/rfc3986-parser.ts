import { ArgumentError } from "../argument-error.js";
import { InvalidURIError, URI } from "./common.js";
import { Generic } from "./generic.js";

/**
 * `URI::RFC3986_Parser`'s component patterns (`vendor/ruby/lib/uri/rfc3986_parser.rb:5-34`),
 * as sources rather than Regexps so the two whole-URI patterns below can
 * interpolate them the way Ruby's `//x` literals do.
 *
 * Ruby's `\g<name>` subroutine calls are expanded here instead: every one of
 * them (`ls32`, `dec-octet`, `seg`, `IPv4address`) is non-recursive, so the
 * expansion is textual, and it has to be textual because JS has no subroutine
 * call. The expanded copies are non-capturing — a JS pattern may not repeat a
 * group NAME — and only the groups `split` reads keep theirs.
 *
 * The possessive quantifiers Ruby writes (`*+`, `++`) are greedy here; JS has
 * no possessive form, so the patterns backtrack where MRI's refuse to.
 */
const DEC_OCTET = "(?:[1-9]\\d|1\\d{2}|2[0-4]\\d|25[0-5]|\\d)";
const IPV4ADDRESS = `(?:${DEC_OCTET}\\.${DEC_OCTET}\\.${DEC_OCTET}\\.${DEC_OCTET})`;
const H16 = "[0-9a-fA-F]{1,4}";
const LS32 = `(?:${H16}:${H16}|${IPV4ADDRESS})`;
const IPV6ADDRESS =
  "(?:" +
  `(?:${H16}:){6}${LS32}` +
  `|::(?:${H16}:){5}${LS32}` +
  `|${H16}?::(?:${H16}:){4}${LS32}` +
  `|(?:(?:${H16}:)?${H16})?::(?:${H16}:){3}${LS32}` +
  `|(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}` +
  `|(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}` +
  `|(?:(?:${H16}:){0,4}${H16})?::${LS32}` +
  `|(?:(?:${H16}:){0,5}${H16})?::${H16}` +
  `|(?:(?:${H16}:){0,6}${H16})?::` +
  ")";
const IPVFUTURE = "v[0-9a-fA-F]+\\.[!$&-.0-9:;=A-Z_a-z~]+";
const IP_LITERAL = `\\[(?:${IPV6ADDRESS}|${IPVFUTURE})\\]`;
const REG_NAME = "(?:%[0-9a-fA-F]{2}|[!$&-.0-9;=A-Z_a-z~])*";
const HOST = `(?:${IP_LITERAL}|${IPV4ADDRESS}|${REG_NAME})`;

const USERINFO = "(?:%[0-9a-fA-F]{2}|[!$&-.0-9:;=A-Z_a-z~])*";
const SCHEME = "[A-Za-z][+\\-.0-9A-Za-z]*";
const SEG = "(?:%[0-9a-fA-F]{2}|[!$&-.0-9:;=@A-Z_a-z~/])";
const SEG_NC = "(?:%[0-9a-fA-F]{2}|[!$&-.0-9;=@A-Z_a-z~])";
const FRAGMENT = "(?:%[0-9a-fA-F]{2}|[!$&-.0-9:;=@A-Z_a-z~/?])*";

/** `RFC3986_URI` (`vendor/ruby/lib/uri/rfc3986_parser.rb:36-52`). */
const RFC3986_URI = new RegExp(
  "^" +
    `(?<scheme>${SCHEME}):` +
    "(?:" +
    `//(?<authority>(?:(?<userinfo>${USERINFO})@)?(?<host>${HOST})(?::(?<port>\\d*))?)` +
    `(?<pathAbempty>(?:/${SEG}*)?)` +
    `|(?<pathAbsolute>/((?!/)${SEG}+)?)` +
    `|(?<pathRootless>(?!/)${SEG}+)` +
    "|(?<pathEmpty>)" +
    ")" +
    "(?:\\?(?<query>[^#]*))?" +
    `(?:#(?<fragment>${FRAGMENT}))?` +
    "$",
);

/** `RFC3986_relative_ref` (`vendor/ruby/lib/uri/rfc3986_parser.rb:54-71`). */
const RFC3986_relative_ref = new RegExp(
  "^" +
    "(?:" +
    `//(?<authority>(?:(?<userinfo>${USERINFO})@)?(?<host>${HOST}(?<!/))?(?::(?<port>\\d*))?)` +
    `(?<pathAbempty>(?:/${SEG}*)?)` +
    `|(?<pathAbsolute>/${SEG}*)` +
    `|(?<pathNoscheme>${SEG_NC}+(?:/${SEG}*)?)` +
    "|(?<pathEmpty>)" +
    ")" +
    "(?:\\?(?<query>[^#]*))?" +
    `(?:#(?<fragment>${FRAGMENT}))?` +
    "$",
);

/**
 * The nine components `URI.split` answers, in order: scheme, userinfo, host,
 * port, registry, path, opaque, query, fragment
 * (`vendor/ruby/lib/uri/rfc3986_parser.rb:87-128`).
 */
export type SplitComponents = [
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

/**
 * `URI::RFC3986_Parser` (`vendor/ruby/lib/uri/rfc3986_parser.rb:3`), the parser
 * `URI.parse` uses and the one every parsed URI carries. Only the members
 * trails sends are ported: `split`, `parse`, `join` and the private
 * `convert_to_uri` `URI::Generic#merge` reaches through.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC3986_Parser`
 * (`vendor/ruby/lib/uri/rfc3986_parser.rb:3`) ships with the interpreter.
 */
export class RFC3986Parser {
  /** `@regexp` (`vendor/ruby/lib/uri/rfc3986_parser.rb:73`), built by
   *  `default_regexp` (`rfc3986_parser.rb:151-164`). */
  readonly regexp: Record<string, RegExp> = {
    SCHEME: new RegExp(`^${SCHEME}$`),
    USERINFO: new RegExp(`^${USERINFO}$`),
    HOST: new RegExp(`^${HOST}$`),
    ABS_PATH: new RegExp(`^/${SEG}*$`),
    REL_PATH: new RegExp(`^(?!/)${SEG}+$`),
    QUERY: new RegExp("^(?:%[0-9a-fA-F]{2}|[!$&-.0-9:;=@A-Z_a-z~/?])*$"),
    FRAGMENT: new RegExp(`^${FRAGMENT}$`),
    OPAQUE: new RegExp("^(?:[^/].*)?$"),
    // eslint-disable-next-line no-control-regex
    PORT: new RegExp("^[\\x09\\x0a\\x0c\\x0d ]*\\d*[\\x09\\x0a\\x0c\\x0d ]*$"),
  };

  /** `split` (`vendor/ruby/lib/uri/rfc3986_parser.rb:77`). */
  split(uri: string): SplitComponents {
    // eslint-disable-next-line no-control-regex
    if (!/^[\x00-\x7f]*$/.test(uri)) {
      throw new InvalidURIError(`URI must be ascii only ${JSON.stringify(uri)}`);
    }
    let m = RFC3986_URI.exec(uri);
    if (m) {
      const g = m.groups!;
      const query = g.query ?? null;
      const scheme = g.scheme ?? null;
      let opaque = g.pathRootless ?? null;
      if (opaque != null) {
        if (query != null) opaque += `?${query}`;
        return [scheme, null, null, null, null, null, opaque, null, g.fragment ?? null];
      }
      return [
        scheme,
        g.userinfo ?? null,
        g.host ?? null,
        g.port ?? null,
        null,
        g.pathAbempty ?? g.pathAbsolute ?? g.pathEmpty ?? null,
        null,
        query,
        g.fragment ?? null,
      ];
    }
    m = RFC3986_relative_ref.exec(uri);
    if (m) {
      const g = m.groups!;
      return [
        null,
        g.userinfo ?? null,
        g.host ?? null,
        g.port ?? null,
        null,
        g.pathAbempty ?? g.pathAbsolute ?? g.pathNoscheme ?? g.pathEmpty ?? null,
        null,
        g.query ?? null,
        g.fragment ?? null,
      ];
    }
    throw new InvalidURIError(`bad URI(is not URI?): ${JSON.stringify(uri)}`);
  }

  /** `parse` (`vendor/ruby/lib/uri/rfc3986_parser.rb:130`). */
  parse(uri: string): Generic {
    return URI.for(...this.split(uri), this);
  }

  /** `join` (`vendor/ruby/lib/uri/rfc3986_parser.rb:135`). */
  join(...uris: (Generic | string)[]): Generic {
    uris[0] = this.convertToUri(uris[0]);
    return uris.reduce((base, oth) => (base as Generic).merge(oth)) as Generic;
  }

  /**
   * `convert_to_uri` (`vendor/ruby/lib/uri/rfc3986_parser.rb:166`), which
   * `URI::Generic#merge` reaches through `__send__` (`generic.rb:1125`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI::RFC3986_Parser#convert_to_uri`
   * (`vendor/ruby/lib/uri/rfc3986_parser.rb:166`).
   */
  convertToUri(uri: Generic | string): Generic {
    if (uri instanceof Generic) {
      return uri;
    } else if (typeof uri === "string") {
      return this.parse(uri);
    } else {
      throw new ArgumentError("bad argument (expected URI object or URI string)");
    }
  }
}
