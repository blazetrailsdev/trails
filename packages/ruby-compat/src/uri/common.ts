import { Generic } from "./generic.js";
import { RFC2396Parser } from "./rfc2396-parser.js";
import { RFC3986Parser } from "./rfc3986-parser.js";
import type { SplitComponents } from "./rfc3986-parser.js";

/**
 * `URI::RFC3986_PARSER` (`vendor/ruby/lib/uri/common.rb:20`), the parser
 * `URI.parse` splits with and the one every parsed URI carries.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC3986_PARSER`
 * (`vendor/ruby/lib/uri/common.rb:20`) ships with the interpreter.
 */
export const RFC3986_PARSER = new RFC3986Parser();

/**
 * `URI::RFC2396_PARSER` (`vendor/ruby/lib/uri/common.rb:22`), which
 * `Rack::Utils::URI_PARSER` (`vendor/rack/lib/rack/utils.rb:27`) and
 * `RoutesInspector#normalize_filter` (`inspector.rb:104`) escape through.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC2396_PARSER`
 * (`vendor/ruby/lib/uri/common.rb:22`) ships with the interpreter.
 */
export const RFC2396_PARSER = new RFC2396Parser();

/**
 * `URI::Error` (`vendor/ruby/lib/uri/common.rb:140`), the base class of every
 * URI exception. It extends `globalThis.Error` rather than a bare `Error`
 * because the class's own binding shadows the global inside its own heritage
 * clause; `StandardError`, Ruby's superclass here, is the JS `Error`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::Error`
 * (`vendor/ruby/lib/uri/common.rb:140`).
 */
export class Error extends globalThis.Error {}

/**
 * `URI::InvalidURIError` (`vendor/ruby/lib/uri/common.rb:144`) — not a URI.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
 * `URI::InvalidURIError` (`vendor/ruby/lib/uri/common.rb:144`).
 */
export class InvalidURIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::InvalidURIError";
  }
}

/**
 * `URI::InvalidComponentError` (`vendor/ruby/lib/uri/common.rb:148`) — not a
 * URI component.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
 * `URI::InvalidComponentError` (`vendor/ruby/lib/uri/common.rb:148`).
 */
export class InvalidComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::InvalidComponentError";
  }
}

/**
 * `URI::BadURIError` (`vendor/ruby/lib/uri/common.rb:152`) — the URI is valid,
 * the usage is not.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::BadURIError`
 * (`vendor/ruby/lib/uri/common.rb:152`).
 */
export class BadURIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "URI::BadURIError";
  }
}

/** The `URI::Generic` initializer every registered scheme class answers to
 *  (`vendor/ruby/lib/uri/generic.rb:169`). */
export type GenericClass = new (...args: [...SplitComponents, RFC3986Parser?]) => Generic;

/** `URI::Schemes` (`vendor/ruby/lib/uri/common.rb:69`), the namespace
 *  `register_scheme` sets a constant on. A Map here: a JS module has no
 *  namespace to hang a constant off, and MRI's `const_set` is doing no more
 *  than this. */
const Schemes = new Map<string, GenericClass>();

/**
 * `URI` (`vendor/ruby/lib/uri/common.rb:15`), the module `parse` and the
 * scheme registry live on. Only the members trails sends are ported —
 * `scheme_list` (`common.rb:99`), `split` (`common.rb:172`) and `join`
 * (`common.rb:213`) have no call site in this repo and are not.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI`
 * (`vendor/ruby/lib/uri/common.rb:15`) ships with the interpreter.
 */
export class URI {
  /**
   * `URI.register_scheme` (`vendor/ruby/lib/uri/common.rb:81`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `URI.register_scheme` (`vendor/ruby/lib/uri/common.rb:81`).
   */
  static registerScheme(scheme: string, klass: GenericClass): GenericClass {
    Schemes.set(scheme.toUpperCase(), klass);
    return klass;
  }

  /**
   * `URI.for` (`vendor/ruby/lib/uri/common.rb:125`). MRI reads the
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

  /** `URI.parse` (`vendor/ruby/lib/uri/common.rb:186`). */
  static parse(uri: string): Generic {
    return RFC3986_PARSER.parse(uri);
  }
}
