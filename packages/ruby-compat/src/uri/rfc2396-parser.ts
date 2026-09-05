import { ArgumentError } from "../argument-error.js";
import { regexpEscape } from "../regexp.js";
import { b } from "../string/b.js";
import { InvalidURIError, URI } from "./common.js";
import { Generic } from "./generic.js";
import type { SplitComponents } from "./rfc3986-parser.js";

/**
 * `URI::REGEXP::PATTERN` (`vendor/ruby/lib/uri/rfc2396_parser.rb:19-54`), the
 * RFC 2396 character classes `initialize_pattern` reads through
 * `PATTERN::`-qualified names.
 */
const ALPHA = "a-zA-Z";
const ALNUM = `${ALPHA}\\d`;
const HEX = "a-fA-F\\d";
const ESCAPED = `%[${HEX}]{2}`;
const UNRESERVED = `\\-_.!~*'()${ALNUM}`;
const RESERVED = ";/?:@&=+$,\\[\\]";
const DOMLABEL = `(?:[${ALNUM}](?:[-${ALNUM}]*[${ALNUM}])?)`;
const TOPLABEL = `(?:[${ALPHA}](?:[-${ALNUM}]*[${ALNUM}])?)`;

/**
 * Ruby's possessive `\A\s*+` (`vendor/ruby/lib/uri/rfc2396_parser.rb:500-501`)
 * as JS spells an atomic group: a lookahead that captures what it matched
 * followed by an immediate backreference, which matches once and never gives
 * any of it back. Without it the leading run is retried at every offset and a
 * non-matching whitespace-prefixed string costs quadratic time where MRI's is
 * linear. The wrapper is itself a capturing group, so the components `split`
 * reads start at {@link COMPONENT_GROUP_START} rather than 1.
 */
const ATOMIC_LEADING_SPACE = "(?=(\\s*))\\1";

const COMPONENT_GROUP_START = 2;

/** `initialize_pattern`'s `opts` (`vendor/ruby/lib/uri/rfc2396_parser.rb:338-345`). */
export interface RFC2396ParserOptions {
  ESCAPED?: string;
  UNRESERVED?: string;
  RESERVED?: string;
  DOMLABEL?: string;
  TOPLABEL?: string;
  HOSTNAME?: string;
}

/**
 * `URI::RFC2396_Parser` (`vendor/ruby/lib/uri/rfc2396_parser.rb:63`), the
 * parser `URI::RFC2396_PARSER` and `URI::DEFAULT_PARSER` are instances of.
 * `join` / `extract` / `make_regexp` / `to_s` / `inspect`
 * (`rfc2396_parser.rb:220,246,265,325,331`) have no call site here.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC2396_Parser`
 * (`vendor/ruby/lib/uri/rfc2396_parser.rb:63`) ships with the interpreter.
 */
export class RFC2396Parser {
  /** `@pattern` (`vendor/ruby/lib/uri/rfc2396_parser.rb:112`). */
  readonly pattern: Record<string, string>;

  /** `@regexp` (`vendor/ruby/lib/uri/rfc2396_parser.rb:117`). */
  readonly regexp: Record<string, RegExp>;

  /** `initialize` (`vendor/ruby/lib/uri/rfc2396_parser.rb:98`). */
  constructor(opts: RFC2396ParserOptions = {}) {
    this.pattern = this.initializePattern(opts);
    this.regexp = this.initializeRegexp(this.pattern);
  }

  /** `split` (`vendor/ruby/lib/uri/rfc2396_parser.rb:119`). */
  split(uri: string): SplitComponents {
    let scheme: string | null = null;
    let opaque: string | null = null;
    let userinfo: string | null = null;
    let host: string | null = null;
    let port: string | null = null;
    let registry: string | null = null;
    let path: string | null = null;
    let query: string | null = null;
    let fragment: string | null = null;

    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-empty
    if (uri === "") {
    } else if ((m = this.regexp.ABS_URI.exec(uri))) {
      [scheme, opaque, userinfo, host, port, registry, path, query, fragment] = group(m, 9);

      if (scheme == null) {
        throw new InvalidURIError(`bad URI(absolute but no scheme): ${uri}`);
      }
      if (opaque == null && path == null && host == null && registry == null) {
        throw new InvalidURIError(`bad URI(absolute but no path): ${uri}`);
      }
    } else if ((m = this.regexp.REL_URI.exec(uri))) {
      scheme = null;
      opaque = null;

      let relSegment: string | null;
      let absPath: string | null;
      [userinfo, host, port, registry, relSegment, absPath, query, fragment] = group(m, 8);
      if (relSegment != null && absPath != null) {
        path = relSegment + absPath;
      } else if (relSegment != null) {
        path = relSegment;
      } else if (absPath != null) {
        path = absPath;
      }
    } else {
      throw new InvalidURIError(`bad URI(is not URI?): ${uri}`);
    }

    if (path == null && opaque == null) path = "";
    return [scheme, userinfo, host, port, registry, path, opaque, query, fragment];
  }

  /** `parse` (`vendor/ruby/lib/uri/rfc2396_parser.rb:205`). */
  parse(uri: string): Generic {
    return URI.for(...this.split(uri), this);
  }

  /**
   * `escape` (`vendor/ruby/lib/uri/rfc2396_parser.rb:287`).
   *
   * The second `else if` arm is not in the Ruby: `gsub` replaces every match
   * whatever the Regexp is, where a JS `replace` replaces one unless the
   * Regexp carries `g`, so a caller's own unsafe set is re-made global here.
   */
  escape(str: string, unsafe: RegExp | string = this.regexp.UNSAFE): string {
    if (!(unsafe instanceof RegExp)) {
      unsafe = new RegExp(`[${regexpEscape(unsafe)}]`, "g");
    } else if (!unsafe.flags.includes("g")) {
      unsafe = new RegExp(unsafe.source, `${unsafe.flags}g`);
    }
    return str.replace(unsafe, (us) => {
      let tmp = "";
      for (const uc of b(us)) {
        tmp += `%${uc.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
      }
      return tmp;
    });
  }

  /** `initialize_pattern` (`vendor/ruby/lib/uri/rfc2396_parser.rb:338`). */
  private initializePattern(opts: RFC2396ParserOptions = {}): Record<string, string> {
    const ret: Record<string, string> = {};
    const escaped = (ret.ESCAPED = opts.ESCAPED ?? ESCAPED);
    const unreserved = (ret.UNRESERVED = opts.UNRESERVED ?? UNRESERVED);
    const reserved = (ret.RESERVED = opts.RESERVED ?? RESERVED);
    ret.DOMLABEL = opts.DOMLABEL ?? DOMLABEL;
    ret.TOPLABEL = opts.TOPLABEL ?? TOPLABEL;
    let hostname: string | undefined = opts.HOSTNAME;
    ret.HOSTNAME = hostname!;

    const uric = (ret.URIC = `(?:[${unreserved}${reserved}]|${escaped})`);
    const uricNoSlash = (ret.URIC_NO_SLASH = `(?:[${unreserved};?:@&=+$,]|${escaped})`);
    const query = (ret.QUERY = `${uric}*`);
    const fragment = (ret.FRAGMENT = `${uric}*`);

    if (hostname == null) {
      hostname = ret.HOSTNAME = "(?:[a-zA-Z0-9\\-.]|%[0-9a-fA-F][0-9a-fA-F])+";
    }

    const ipv4addr = (ret.IPV4ADDR = "\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}");
    const hex4 = `[${HEX}]{1,4}`;
    const lastpart = `(?:${hex4}|${ipv4addr})`;
    const hexseq1 = `(?:${hex4}:)*${hex4}`;
    const hexseq2 = `(?:${hex4}:)*${lastpart}`;
    const ipv6addr = (ret.IPV6ADDR = `(?:${hexseq2}|(?:${hexseq1})?::(?:${hexseq2})?)`);

    const ipv6ref = (ret.IPV6REF = `\\[${ipv6addr}\\]`);

    const host = (ret.HOST = `(?:${hostname}|${ipv4addr}|${ipv6ref})`);
    const port = (ret.PORT = "\\d*");
    const hostport = (ret.HOSTPORT = `${host}(?::${port})?`);

    const userinfo = (ret.USERINFO = `(?:[${unreserved};:&=+$,]|${escaped})*`);

    const pchar = `(?:[${unreserved}:@&=+$,]|${escaped})`;
    const param = `${pchar}*`;
    const segment = `${pchar}*(?:;${param})*`;
    const pathSegments = (ret.PATH_SEGMENTS = `${segment}(?:/${segment})*`);

    const server = `(?:${userinfo}@)?${hostport}`;
    const regName = (ret.REG_NAME = `(?:[${unreserved}$,;:@&=+]|${escaped})+`);
    const authority = `(?:${server}|${regName})`;

    const relSegment = (ret.REL_SEGMENT = `(?:[${unreserved};@&=+$,]|${escaped})+`);

    const scheme = (ret.SCHEME = `[${ALPHA}][\\-+.${ALPHA}\\d]*`);

    const absPath = (ret.ABS_PATH = `/${pathSegments}`);
    const relPath = (ret.REL_PATH = `${relSegment}(?:${absPath})?`);
    const netPath = (ret.NET_PATH = `//${authority}(?:${absPath})?`);

    const hierPart = (ret.HIER_PART = `(?:${netPath}|${absPath})(?:\\?(?:${query}))?`);
    const opaquePart = (ret.OPAQUE_PART = `${uricNoSlash}${uric}*`);

    const absUri = (ret.ABS_URI = `${scheme}:(?:${hierPart}|${opaquePart})`);
    const relUri = (ret.REL_URI = `(?:${netPath}|${absPath}|${relPath})(?:\\?${query})?`);

    ret.URI_REF = `(?:${absUri}|${relUri})?(?:#${fragment})?`;

    ret.X_ABS_URI =
      `(${scheme}):(?:(${opaquePart})|(?:(?://(?:(?:(?:(${userinfo})@)?` +
      `(?:(${host})(?::(\\d*))?))?|(${regName}))|(?!//))(${absPath})?)` +
      `(?:\\?(${query}))?)(?:#(${fragment}))?`;

    ret.X_REL_URI =
      `(?:(?://(?:(?:(${userinfo})@)?(${host})?(?::(\\d*))?|(${regName})))` +
      `|(${relSegment}))?(${absPath})?(?:\\?(${query}))?(?:#(${fragment}))?`;

    return ret;
  }

  /** `initialize_regexp` (`vendor/ruby/lib/uri/rfc2396_parser.rb:496`). */
  private initializeRegexp(pattern: Record<string, string>): Record<string, RegExp> {
    const ret: Record<string, RegExp> = {};

    ret.ABS_URI = new RegExp(`^${ATOMIC_LEADING_SPACE}${pattern.X_ABS_URI}\\s*$`);
    ret.REL_URI = new RegExp(`^${ATOMIC_LEADING_SPACE}${pattern.X_REL_URI}\\s*$`);

    ret.URI_REF = new RegExp(pattern.URI_REF);
    ret.ABS_URI_REF = new RegExp(pattern.X_ABS_URI);
    ret.REL_URI_REF = new RegExp(pattern.X_REL_URI);

    ret.ESCAPED = new RegExp(pattern.ESCAPED);
    ret.UNSAFE = new RegExp(`[^${pattern.UNRESERVED}${pattern.RESERVED}]`);

    ret.SCHEME = new RegExp(`^${pattern.SCHEME}$`);
    ret.USERINFO = new RegExp(`^${pattern.USERINFO}$`);
    ret.HOST = new RegExp(`^${pattern.HOST}$`);
    ret.PORT = new RegExp(`^${pattern.PORT}$`);
    ret.OPAQUE = new RegExp(`^${pattern.OPAQUE_PART}$`);
    ret.REGISTRY = new RegExp(`^${pattern.REG_NAME}$`);
    ret.ABS_PATH = new RegExp(`^${pattern.ABS_PATH}$`);
    ret.REL_PATH = new RegExp(`^${pattern.REL_PATH}$`);
    ret.QUERY = new RegExp(`^${pattern.QUERY}$`);
    ret.FRAGMENT = new RegExp(`^${pattern.FRAGMENT}$`);

    return ret;
  }

  /**
   * `convert_to_uri` (`vendor/ruby/lib/uri/rfc2396_parser.rb:527`), which
   * `URI::Generic#merge` reaches through `__send__` (`generic.rb:1125`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails.
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

function group(m: RegExpExecArray, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) out.push(m[COMPONENT_GROUP_START + i] ?? null);
  return out;
}
