import { EMPTY_HASH, normalizeKeys } from "./i18n.js";
import type { Locale, TranslationKey } from "./i18n.js";
import { ArgumentError as RubyArgumentError, NoMethodError } from "@blazetrails/ruby-compat";

export { NoMethodError };

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
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

const NONPRINTABLE = /^[\p{Cc}\p{Cn}\p{Zl}\p{Zp}]$/u;

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

function inspectSymbolOrString(value: string): string {
  return value.startsWith(":") ? value : inspect(value);
}

export class ArgumentError extends RubyArgumentError {
  constructor(message?: string) {
    super(message);
    this.name = "ArgumentError";
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

type BackendKlass = (abstract new (...args: never[]) => unknown) & { name: string };

export class UnsupportedMethod extends ArgumentError {
  readonly method: string;
  readonly backendKlass: BackendKlass;
  readonly msg: string;

  constructor(method: string, backendKlass: BackendKlass, msg: string) {
    super(`${backendKlass.name} does not support the #${method} method. ${msg}`);
    this.name = "UnsupportedMethod";
    this.method = method;
    this.backendKlass = backendKlass;
    this.msg = msg;
  }
}

export class ExceptionHandler {
  call(exception: Error, _locale: Locale, _key: TranslationKey, _options: unknown): string {
    if (exception instanceof MissingTranslation) {
      return exception.message;
    }
    throw exception;
  }
}
