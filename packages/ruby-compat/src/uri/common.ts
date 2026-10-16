import { ArgumentError } from "../argument-error.js";
import { Encoding } from "../encoding.js";
import { rbObjClone } from "../include.js";
import { bytes } from "../string/bytes.js";
import { encode } from "../string/encode.js";
import { forceEncoding, rbObjEncoding } from "../string/force-encoding.js";
import { registerConstant } from "../variable.js";
import { Generic } from "./generic.js";
import { RFC2396Parser } from "./rfc2396-parser.js";
import { RFC3986Parser } from "./rfc3986-parser.js";
import type { SplitComponents } from "./rfc3986-parser.js";

/**
 * `URI::RFC3986_PARSER` (`vendor/ruby/v3.3.11/lib/uri/common.rb:20`), the parser
 * `URI.parse` splits with and the one every parsed URI carries.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC3986_PARSER`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:20`) ships with the interpreter.
 */
export const RFC3986_PARSER = new RFC3986Parser();

/**
 * `URI::RFC2396_PARSER` (`vendor/ruby/v3.3.11/lib/uri/common.rb:22`), which
 * `Rack::Utils::URI_PARSER` (`vendor/rack/v3.1.14/lib/rack/utils.rb:27`) and
 * `RoutesInspector#normalize_filter` (`inspector.rb:104`) escape through.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC2396_PARSER`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:22`) ships with the interpreter.
 */
export const RFC2396_PARSER = new RFC2396Parser();

/**
 * `URI::DEFAULT_PARSER` (`vendor/ruby/v3.3.11/lib/uri/common.rb:26`), `URI::Parser.new`
 * — `Parser` is `RFC2396_Parser` (`common.rb:19`) — and the parser
 * `URI::Generic#initialize` defaults to (`generic.rb:174`). MRI's `const_set`
 * loop copying its tables onto `URI` (`common.rb:27-34`) has no port: nothing
 * here reads `URI::ABS_URI`, and the tables hang off the parser.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::DEFAULT_PARSER`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:26`) ships with the interpreter.
 */
export const DEFAULT_PARSER = new RFC2396Parser();

/**
 * `URI::Error` (`vendor/ruby/v3.3.11/lib/uri/common.rb:140`), the base class of every
 * URI exception. It extends `globalThis.Error` rather than a bare `Error`
 * because the class's own binding shadows the global inside its own heritage
 * clause; `StandardError`, Ruby's superclass here, is the JS `Error`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::Error`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:140`).
 */
export class Error extends globalThis.Error {}

/**
 * `URI::InvalidURIError` (`vendor/ruby/v3.3.11/lib/uri/common.rb:144`) — not a URI.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
 * `URI::InvalidURIError` (`vendor/ruby/v3.3.11/lib/uri/common.rb:144`).
 */
export class InvalidURIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::InvalidURIError";
  }
}

/**
 * `URI::InvalidComponentError` (`vendor/ruby/v3.3.11/lib/uri/common.rb:148`) — not a
 * URI component.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
 * `URI::InvalidComponentError` (`vendor/ruby/v3.3.11/lib/uri/common.rb:148`).
 */
export class InvalidComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::InvalidComponentError";
  }
}

/**
 * `URI::BadURIError` (`vendor/ruby/v3.3.11/lib/uri/common.rb:152`) — the URI is valid,
 * the usage is not.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::BadURIError`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:152`).
 */
export class BadURIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::BadURIError";
  }
}

/** The `URI::Generic` initializer every registered scheme class answers to
 *  (`vendor/ruby/v3.3.11/lib/uri/generic.rb:169`). */
export type GenericClass = new (
  ...args: [...SplitComponents, (RFC2396Parser | RFC3986Parser)?, boolean?]
) => Generic;

/** `URI::Schemes` (`vendor/ruby/v3.3.11/lib/uri/common.rb:69`), the namespace
 *  `register_scheme` sets a constant on. A Map here: a JS module has no
 *  namespace to hang a constant off, and MRI's `const_set` is doing no more
 *  than this. */
const Schemes = new Map<string, GenericClass>();

/**
 * `URI::TBLENCWWWCOMP_` (`vendor/ruby/v3.3.11/lib/uri/common.rb:283-289`), the
 * byte-to-escape table `encode_www_form_component` substitutes through, with
 * `' '` mapped to `'+'`. `TBLENCURICOMP_` (`common.rb:287`) has no call site
 * here and is not ported.
 */
const TBLENCWWWCOMP_: Record<string, string> = {};
for (let i = 0; i < 256; i++) {
  TBLENCWWWCOMP_[String.fromCharCode(i)] = `%${i.toString(16).toUpperCase().padStart(2, "0")}`;
}
TBLENCWWWCOMP_[" "] = "+";

/**
 * `URI::TBLDECWWWCOMP_` (`vendor/ruby/v3.3.11/lib/uri/common.rb:290-299`), the
 * table `decode_www_form` substitutes `+` and each `%XX` through, in all four
 * hex-digit cases.
 */
const TBLDECWWWCOMP_: Record<string, string> = {};
for (let i = 0; i < 256; i++) {
  const [h, l] = [(i >> 4).toString(16), (i & 15).toString(16)];
  for (const hh of [h.toUpperCase(), h]) {
    for (const ll of [l.toUpperCase(), l]) TBLDECWWWCOMP_[`%${hh}${ll}`] = String.fromCharCode(i);
  }
}
TBLDECWWWCOMP_["+"] = " ";

/**
 * `URI::Util` (`vendor/ruby/v3.3.11/lib/uri/common.rb:36-67`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::Util`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:36`) ships with the interpreter.
 */
export const Util = {
  /**
   * `make_components_hash` (`vendor/ruby/v3.3.11/lib/uri/common.rb:38-65`): an
   * Array of every component but the scheme, in `klass.component` order, or a
   * Hash of them, copied into a new Hash with `scheme` set to the class's
   * downcased short name.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI::Util.make_components_hash` (`vendor/ruby/v3.3.11/lib/uri/common.rb:38`).
   */
  makeComponentsHash(
    klass: { name: string; component(): readonly string[] },
    arrayHash: unknown[] | Record<string, unknown>,
  ): Record<string, unknown> {
    const tmp: Record<string, unknown> = {};
    if (Array.isArray(arrayHash) && arrayHash.length === klass.component().length - 1) {
      klass
        .component()
        .slice(1)
        .forEach((c, i) => {
          tmp[c] = rbObjClone(arrayHash[i]);
        });
    } else if (arrayHash != null && typeof arrayHash === "object" && !Array.isArray(arrayHash)) {
      for (const [key, value] of Object.entries(arrayHash)) {
        tmp[key] = rbObjClone(value);
      }
    } else {
      throw new ArgumentError(
        `expected Array of or Hash of components of ${klass.name} (${klass.component().slice(1).join(", ")})`,
      );
    }
    tmp["scheme"] = klass.name.replace(/^.*::/, "").toLowerCase();

    return tmp;
  },
};

/**
 * `URI` (`vendor/ruby/v3.3.11/lib/uri/common.rb:15`), the module `parse` and the
 * scheme registry live on. Only the members trails sends are ported —
 * `scheme_list` (`common.rb:99`), `split` (`common.rb:172`) and `join`
 * (`common.rb:213`) have no call site in this repo and are not.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI`
 * (`vendor/ruby/v3.3.11/lib/uri/common.rb:15`) ships with the interpreter.
 */
export class URI {
  /**
   * `URI.register_scheme` (`vendor/ruby/v3.3.11/lib/uri/common.rb:81`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI.register_scheme` (`vendor/ruby/v3.3.11/lib/uri/common.rb:81`).
   */
  static registerScheme(scheme: string, klass: GenericClass): GenericClass {
    Schemes.set(scheme.toUpperCase(), klass);
    return klass;
  }

  /**
   * `URI.for` (`vendor/ruby/v3.3.11/lib/uri/common.rb:125`). MRI reads the
   * Ractor-shareable `INITIAL_SCHEMES` snapshot before `Schemes` itself and
   * guards the `const_get` with `/\A[A-Z]\w*\z/` (`common.rb:126-131`);
   * there is one Map registry here, so one lookup answers both and a Map key
   * needs no constant-name check. The `default:` kwarg keeps its `Generic`
   * value but not its name — `default` is a reserved word in a JS parameter
   * list — and no caller in the tree passes it.
   */
  static for(scheme: string | null, ...args: unknown[]): Generic {
    const constName = String(scheme).toUpperCase();

    let uriClass = Schemes.get(constName);
    uriClass ??= Generic as unknown as GenericClass;

    return new (uriClass as unknown as new (...a: unknown[]) => Generic)(scheme, ...args);
  }

  /**
   * `URI.encode_www_form_component` (`vendor/ruby/v3.3.11/lib/uri/common.rb:337-339`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI.encode_www_form_component` (`vendor/ruby/v3.3.11/lib/uri/common.rb:337`).
   */
  static encodeWwwFormComponent(
    str: { toString(): string } | null | undefined,
    enc: Encoding | null = null,
  ): string {
    return URI._encodeUriComponent(/[^*\-.0-9A-Z_a-z]/g, TBLENCWWWCOMP_, str, enc);
  }

  /**
   * `URI._encode_uri_component`
   * (`vendor/ruby/v3.3.11/lib/uri/common.rb:385-397`), private in MRI. `str.to_s` is
   * `""` for `nil`. `force_encoding(ASCII_8BIT)` leaves a JS string as it is,
   * so the `gsub!` runs over the String's bytes and the table is indexed by
   * byte exactly as MRI indexes it.
   */
  private static _encodeUriComponent(
    regexp: RegExp,
    table: Record<string, string>,
    str: { toString(): string } | null | undefined,
    enc: Encoding | null,
  ): string {
    let s: string | Uint8Array = str == null ? "" : String(str);
    if (rbObjEncoding(s) !== Encoding.ASCII_8BIT) {
      if (enc != null && enc !== Encoding.ASCII_8BIT) {
        s = encode(s, Encoding.UTF_8, { invalid: ":replace", undef: ":replace" });
        s = encode(s, enc, { fallback: (x) => `&#${x.codePointAt(0)};` });
      }
      s = forceEncoding(s, Encoding.ASCII_8BIT);
    }
    let b = "";
    for (const byte of typeof s === "string" ? bytes(s) : s) {
      b += String.fromCharCode(byte);
    }
    return b.replace(regexp, (c) => table[c]);
  }

  /**
   * `URI.split` (`vendor/ruby/v3.3.11/lib/uri/common.rb:172`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI.split`
   * (`vendor/ruby/v3.3.11/lib/uri/common.rb:172`).
   */
  static split(uri: string): SplitComponents {
    return RFC3986_PARSER.split(uri);
  }

  /**
   * `URI.encode_www_form` (`vendor/ruby/v3.3.11/lib/uri/common.rb:503-521`): each
   * pair as `key=value`, a `nil` value as the bare key and an Array value as
   * one pair per element, joined by `&`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI.encode_www_form`
   * (`vendor/ruby/v3.3.11/lib/uri/common.rb:503`).
   */
  static encodeWwwForm(enum_: Record<string, unknown>, enc: Encoding | null = null): string {
    return Object.entries(enum_)
      .map(([k, v]) => {
        if (v == null) {
          return URI.encodeWwwFormComponent(k, enc);
        } else if (Array.isArray(v)) {
          return v
            .map((w) => {
              let str = URI.encodeWwwFormComponent(k, enc);
              if (w != null) {
                str += "=";
                str += URI.encodeWwwFormComponent(w as string, enc);
              }
              return str;
            })
            .join("&");
        } else {
          let str = URI.encodeWwwFormComponent(k, enc);
          str += "=";
          str += URI.encodeWwwFormComponent(v as string, enc);
          return str;
        }
      })
      .join("&");
  }

  /**
   * `URI.decode_www_form` (`vendor/ruby/v3.3.11/lib/uri/common.rb:556-596`), its
   * default `separator: '&'` arm: the `[key, value]` pairs of an ASCII
   * query string, `+` and each `%XX` decoded and the bytes read as UTF-8 with
   * invalid sequences scrubbed. The `enc`, `use__charset_` and `isindex`
   * arms have no caller and are not ported.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI.decode_www_form`
   * (`vendor/ruby/v3.3.11/lib/uri/common.rb:556`).
   */
  static decodeWwwForm(str: string): [string, string][] {
    // eslint-disable-next-line no-control-regex
    if (!/^[\x00-\x7f]*$/.test(str)) {
      throw new ArgumentError("the input of URI.decode_www_form must be ASCII only string");
    }
    const ary: [string, string][] = [];
    if (str === "") return ary;
    const decoder = new TextDecoder("utf-8");
    const scrub = (s: string): string => decoder.decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    for (const string of str.split(/(?<=&)/)) {
      const field = string.endsWith("&") ? string.slice(0, -1) : string;
      const i = field.indexOf("=");
      const key = i < 0 ? field : field.slice(0, i);
      const val = i < 0 ? "" : field.slice(i + 1);
      ary.push([
        scrub(key.replace(/\+|%[0-9a-fA-F]{2}/g, (c) => TBLDECWWWCOMP_[c])),
        scrub(val.replace(/\+|%[0-9a-fA-F]{2}/g, (c) => TBLDECWWWCOMP_[c])),
      ]);
    }
    return ary;
  }

  /** `URI.parse` (`vendor/ruby/v3.3.11/lib/uri/common.rb:186`). */
  static parse(uri: string | Uint8Array): Generic {
    return RFC3986_PARSER.parse(uri);
  }
}

registerConstant("URI", URI);
registerConstant("URI::InvalidURIError", InvalidURIError);
