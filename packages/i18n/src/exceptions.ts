import { EMPTY_HASH, normalizeKeys, toSym } from "./i18n.js";
import type { Locale, TranslationKey } from "./i18n.js";
import {
  ArgumentError as RubyArgumentError,
  NoMethodError,
  rbInspect,
} from "@blazetrails/ruby-compat";

export { NoMethodError };

function deepSymbolizeKeys(object: unknown): unknown {
  if (Array.isArray(object)) return object.map(deepSymbolizeKeys);
  if (typeof object !== "object" || object === null) return object;
  if (Object.getPrototypeOf(object) !== Object.prototype) return object;
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [toSym(key), deepSymbolizeKeys(value)]),
  );
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
    super(
      `${rbInspect(typeof locale === "string" ? toSym(locale) : locale)} is not a valid locale`,
    );
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
      if (typeof v === "function") slice[k] = rbInspect(v);
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
      `translation data ${rbInspect(deepSymbolizeKeys(entry))} can not be used with :count => ${count}. key '${key}' is missing.`,
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
      `missing interpolation argument ${rbInspect(key)} in ${rbInspect(string)} (${rbInspect(deepSymbolizeKeys(values))} given)`,
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
    super(`reserved key ${rbInspect(key)} used in ${rbInspect(string)}`);
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
