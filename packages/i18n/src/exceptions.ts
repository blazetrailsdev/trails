/**
 * Mirrors: i18n/lib/i18n/exceptions.rb
 *
 * Ruby Symbols have no JS analogue, so every symbol-typed value here (locale,
 * translation key, interpolation key) is a plain string. A Symbol whose
 * message renders it through `#inspect` alongside a String keeps the leading
 * colon in that string (`":bar"`), so `inspectSymbolOrString` can tell the two
 * apart the way Ruby's types do; `inspect` itself stays Ruby's `Object#inspect`
 * and quotes every String. Where the Symbol spelling is not carried,
 * `inspectSymbol` puts the colon back.
 */

import { EMPTY_HASH, normalizeKeys } from "./i18n.js";
import type { Locale, TranslationKey } from "./i18n.js";

/** @internal Ruby `Object#inspect`, as far as the values reaching this file go. */
export function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return inspectString(value);
  if (typeof value === "function") return "#<Proc>";
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${inspectSymbol(k)}=>${inspect(v)}`,
    );
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

const RUBY_ESCAPES: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\f": "\\f",
  "\v": "\\v",
  "\b": "\\b",
  "\x07": "\\a",
  "\x1b": "\\e",
};

/**
 * MRI escapes every code point `rb_enc_isprint` rejects, which is wider than
 * the C0/DEL/C1 controls: unassigned code points (`"͸".inspect` =>
 * `"\\u0378"`), noncharacters (`"￾"`) and the line and paragraph
 * separators all render escaped. `\p{Cf}` does not — soft hyphen, ZWSP and
 * U+1D173 all print literally — and neither does private use (`\p{Co}`) or
 * `\p{Zs}`. Surrogates are `\p{Cs}` but take the invalid-byte arm below.
 */
const NONPRINTABLE = /^[\p{Cc}\p{Cn}\p{Zl}\p{Zp}]$/u;

/**
 * Ruby `String#inspect` (MRI `string.c`, `rb_str_inspect`). `JSON.stringify`
 * is not a stand-in: Ruby renders ESC as `\e`, escapes `#` before `{`, `$` and
 * `@` so the result re-parses as the same string, prints printable non-ASCII
 * literally, and renders bytes that are not valid UTF-8 — here, a lone
 * surrogate — as the `\xNN` bytes of their encoding.
 */
function inspectString(value: string): string {
  const chars = Array.from(value);
  let result = '"';
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const code = char.codePointAt(0)!;
    if (char === '"' || char === "\\") {
      result += `\\${char}`;
    } else if (char === "#" && ["{", "$", "@"].includes(chars[i + 1] ?? "")) {
      result += "\\#";
    } else if (char in RUBY_ESCAPES) {
      result += RUBY_ESCAPES[char];
    } else if (NONPRINTABLE.test(char)) {
      result +=
        code <= 0xffff
          ? `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`
          : `\\u{${code.toString(16).toUpperCase()}}`;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      for (const byte of [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)]) {
        result += `\\x${byte.toString(16).toUpperCase()}`;
      }
    } else {
      result += char;
    }
  }
  return `${result}"`;
}

function inspectSymbol(value: unknown): string {
  return typeof value === "string" ? `:${value}` : inspect(value);
}

/**
 * `#inspect` for a value Rails types as `Symbol | String`, where the two
 * render differently (`:bar` against `"key"`). The Symbol arm is the string
 * carrying the Symbol's leading colon, which is what Ruby gets from the type.
 */
function inspectSymbolOrString(value: string): string {
  return value.startsWith(":") ? value : inspect(value);
}

/**
 * Mirrors: I18n::ArgumentError, the root of every error in this file.
 *
 * `message` is passed straight through rather than defaulting to `""`, so
 * `Error` installs no own `message` property when it is undefined — an own
 * property would shadow `MissingTranslation`'s computed getter.
 */
export class ArgumentError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * Mirror of Ruby's `NoMethodError`, raised where the gem sends a method to a
 * receiver that does not respond to it — `locale.to_sym` in `Config#locale=`
 * and `Config#default_locale=` (i18n/lib/i18n/config.rb:17, :37), which is
 * what makes junk assignment fail rather than be ignored.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core class the gem raises but does not
 * define; JS has no `NoMethodError`, so the port has to carry one.
 */
export class NoMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export class Disabled extends ArgumentError {
  constructor(method: string) {
    super(`I18n.${method} is currently disabled, likely because your application is still in its loading phase.

This method is meant to display text in the user locale, so calling it before the user locale has
been set is likely to display text from the wrong locale to some users.

If you have a legitimate reason to access i18n data outside of the user flow, you can do so by passing
the desired locale explicitly with the \`locale\` argument, e.g. \`I18n.${method}(..., locale: :en)\`
`);
    this.name = "Disabled";
  }
}

export class InvalidLocale extends ArgumentError {
  readonly locale: unknown;

  constructor(locale: unknown) {
    super(`${inspectSymbol(locale)} is not a valid locale`);
    this.name = "InvalidLocale";
    this.locale = locale;
  }
}

export class InvalidLocaleData extends ArgumentError {
  readonly filename: string;

  constructor(filename: string, exceptionMessage: string) {
    super(`can not load translations from ${filename}: ${exceptionMessage}`);
    this.name = "InvalidLocaleData";
    this.filename = filename;
  }
}

export interface MissingTranslationOptions {
  scope?: TranslationKey | TranslationKey[];
  default?: unknown;
  [key: string]: unknown;
}

const PERMITTED_KEYS = ["scope", "default"] as const;

/**
 * Mirrors: I18n::MissingTranslation::Base. Ruby mixes this module into both
 * `MissingTranslation` and `MissingTranslationData`; here it is their shared
 * superclass, which puts the same methods on both. The constructor keeps only
 * the permitted options, plus every Proc-valued entry (permitted or not) in
 * its inspected form, as Ruby does.
 */
export class Base extends ArgumentError {
  readonly locale: Locale;
  readonly key: TranslationKey;
  readonly options: MissingTranslationOptions;
  private keysCache?: TranslationKey[];

  constructor(
    locale: Locale,
    key: TranslationKey,
    options: MissingTranslationOptions = EMPTY_HASH,
  ) {
    super();
    this.name = "MissingTranslation";
    this.locale = locale;
    this.key = key;
    this.options = {};
    const slice = this.options as Record<string, unknown>;
    for (const permitted of PERMITTED_KEYS) {
      if (permitted in options) slice[permitted] = options[permitted];
    }
    for (const [k, v] of Object.entries(options)) {
      if (typeof v === "function") slice[k] = inspect(v);
    }
  }

  keys(): TranslationKey[] {
    if (!this.keysCache) {
      const keys = normalizeKeys(this.locale, this.key, this.options.scope);
      if (keys.length < 2) keys.push("no key");
      this.keysCache = keys;
    }
    return this.keysCache;
  }

  override get message(): string {
    const fallbacks = this.options.default;
    if (Array.isArray(fallbacks) && fallbacks.length > 0) {
      const otherOptions = [this.key, ...fallbacks]
        .map((k) => `- ${this.normalizedOption(k as TranslationKey)}`)
        .join("\n");
      return `Translation missing. Options considered were:\n${otherOptions}`;
    }
    return `Translation missing: ${this.keys().join(".")}`;
  }

  normalizedOption(key: TranslationKey): string {
    return normalizeKeys(this.locale, key, this.options.scope).join(".");
  }

  override toString(): string {
    return this.message;
  }

  toException(): MissingTranslationData {
    return new MissingTranslationData(this.locale, this.key, this.options);
  }
}

export class MissingTranslation extends Base {
  static readonly Base = Base;
}

export class MissingTranslationData extends Base {
  constructor(
    locale: Locale,
    key: TranslationKey,
    options: MissingTranslationOptions = EMPTY_HASH,
  ) {
    super(locale, key, options);
    this.name = "MissingTranslationData";
  }
}

export class InvalidPluralizationData extends ArgumentError {
  readonly entry: unknown;
  readonly count: unknown;
  readonly key: TranslationKey;

  constructor(entry: unknown, count: unknown, key: TranslationKey) {
    super(
      `translation data ${inspect(entry)} can not be used with :count => ${count}. key '${key}' is missing.`,
    );
    this.name = "InvalidPluralizationData";
    this.entry = entry;
    this.count = count;
    this.key = key;
  }
}

export class MissingInterpolationArgument extends ArgumentError {
  readonly key: string;
  readonly values: Record<string, unknown>;
  readonly string: string;

  constructor(key: string, values: Record<string, unknown>, string: string) {
    super(
      `missing interpolation argument ${inspectSymbolOrString(key)} in ${inspect(string)} (${inspect(values)} given)`,
    );
    this.name = "MissingInterpolationArgument";
    this.key = key;
    this.values = values;
    this.string = string;
  }
}

export class ReservedInterpolationKey extends ArgumentError {
  readonly key: string;
  readonly string: string;

  constructor(key: string, string: string) {
    super(`reserved key ${inspectSymbolOrString(key)} used in ${inspect(string)}`);
    this.name = "ReservedInterpolationKey";
    this.key = key;
    this.string = string;
  }
}

export class UnknownFileType extends ArgumentError {
  readonly type: string;
  readonly filename: string;

  constructor(type: string, filename: string) {
    super(`can not load translations from ${filename}, the file type ${type} is not known`);
    this.name = "UnknownFileType";
    this.type = type;
    this.filename = filename;
  }
}

/**
 * Mirrors: I18n::ExceptionHandler. Returns the message for a missing
 * translation and re-raises anything else.
 */
export class ExceptionHandler {
  call(exception: Error, _locale: Locale, _key: TranslationKey, _options: unknown): string {
    if (exception instanceof MissingTranslation) {
      return exception.message;
    }
    throw exception;
  }
}
