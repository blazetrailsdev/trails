/**
 * Mirrors: i18n/lib/i18n/exceptions.rb
 *
 * Ruby Symbols have no JS analogue, so every symbol-typed value here (locale,
 * translation key, interpolation key) is a plain string. Messages that embed
 * one through `#inspect` therefore render it the way Ruby renders a Symbol
 * (`:en`) via `inspectSymbol`; everything else goes through `inspect`.
 */

import { normalizeKeys } from "./i18n.js";
import type { Locale, TranslationKey } from "./i18n.js";

function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "#<Proc>";
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${inspect(v)}`,
    );
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

function inspectSymbol(value: unknown): string {
  return typeof value === "string" ? `:${value}` : inspect(value);
}

export class ArgumentError extends Error {
  constructor(message?: string) {
    // Passing `message` straight through (rather than defaulting to "") keeps
    // `Error` from installing an own `message` property when it is undefined —
    // an own property would shadow `MissingTranslation`'s computed getter.
    super(message);
    this.name = "ArgumentError";
  }
}

export class Disabled extends ArgumentError {
  constructor(method: string) {
    super(
      `I18n.${method} is currently disabled, likely because your application is still in its loading phase.\n` +
        `\n` +
        `This method is meant to display text in the user locale, so calling it before the user locale has\n` +
        `been set is likely to display text from the wrong locale to some users.\n` +
        `\n` +
        `If you have a legitimate reason to access i18n data outside of the user flow, you can do so by passing\n` +
        `the desired locale explicitly with the \`locale\` argument, e.g. \`I18n.${method}(..., locale: :en)\`\n`,
    );
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
 * superclass, which puts the same methods on both.
 */
export class Base extends ArgumentError {
  readonly locale: Locale;
  readonly key: TranslationKey;
  readonly options: MissingTranslationOptions;
  private keysCache?: (string | number | boolean)[];

  constructor(locale: Locale, key: TranslationKey, options: MissingTranslationOptions = {}) {
    super();
    this.name = "MissingTranslation";
    this.locale = locale;
    this.key = key;
    this.options = {};
    const slice = this.options as Record<string, unknown>;
    for (const permitted of PERMITTED_KEYS) {
      if (permitted in options) slice[permitted] = options[permitted];
    }
    // Ruby copies Proc-valued entries in verbatim, permitted or not.
    for (const [k, v] of Object.entries(options)) {
      if (typeof v === "function") slice[k] = inspect(v);
    }
  }

  keys(): (string | number | boolean)[] {
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
  constructor(locale: Locale, key: TranslationKey, options: MissingTranslationOptions = {}) {
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
      `missing interpolation argument ${inspectSymbol(key)} in ${inspect(string)} (${inspect(values)} given)`,
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
    super(`reserved key ${inspectSymbol(key)} used in ${inspect(string)}`);
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
