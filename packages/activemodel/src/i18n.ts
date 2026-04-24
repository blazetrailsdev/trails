import { deepDup, deepMergeInPlace } from "@blazetrails/activesupport";
import { raiseOnMissingTranslations } from "./translation.js";

type TranslationLambda = (key: string, options: Record<string, unknown>) => TranslationValue;
type TranslationValue =
  | string
  | { one?: string; other?: string }
  | TranslationTree
  | TranslationLambda;
interface TranslationTree {
  [key: string]: TranslationValue;
}
type Translations = Record<string, TranslationTree>;

interface TranslateOptions {
  count?: number;
  defaults?: Array<{ key: string } | { message: string }>;
  defaultValue?: string;
  locale?: string;
  [key: string]: unknown;
}

/**
 * Raised when a `%{key}` appears in a translation string but the caller
 * supplied no matching interpolation option.
 *
 * Mirrors: I18n::MissingInterpolationArgument
 */
export class MissingInterpolationArgument extends globalThis.Error {
  readonly key: string;
  readonly string: string;
  constructor(key: string, string: string) {
    super(`missing interpolation argument :${key} in ${JSON.stringify(string)}`);
    this.name = "MissingInterpolationArgument";
    this.key = key;
    this.string = string;
  }
}

/**
 * Keys the I18n gem reserves (not forwarded as `%{}` interpolations).
 * See i18n/lib/i18n.rb RESERVED_KEYS.
 */
const RESERVED_KEYS = new Set([
  "scope",
  "default",
  "defaults",
  "defaultValue",
  "separator",
  "resolve",
  "object",
  "fallback",
  "format",
  "cascade",
  "throw",
  "raise",
  "deep_interpolation",
  "locale",
]);

function dig(obj: TranslationTree, path: string[]): TranslationValue | undefined {
  let current: TranslationValue = obj;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    if (Array.isArray(current)) return undefined;
    current = (current as TranslationTree)[segment];
  }
  return current;
}

function interpolate(str: string, options: Record<string, unknown>): string {
  return str.replace(/%\{(\w+)\}/g, (_, key) => {
    // Match Rails i18n (i18n/lib/i18n/interpolate/ruby.rb): raise only when
    // the key is absent. `nil` values are allowed and interpolate to "".
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      throw new MissingInterpolationArgument(key, str);
    }
    const value = options[key];
    return value == null ? "" : String(value);
  });
}

class I18nService {
  private _locale: string = "en";
  private _defaultLocale: string = "en";
  private _translations: Translations = {};
  /**
   * Per-locale fallback chain. `fallbacks["en-US"] = ["en-US", "en"]`
   * makes a lookup against "en-US" try "en-US" then "en". The entry
   * should include the locale itself as the first element (Rails
   * I18n::Fallbacks semantics — see i18n/lib/i18n/locale/fallbacks.rb).
   */
  private _fallbacks: Record<string, string[]> = {};
  private _sharedFallbacks: string[] | undefined;

  get locale(): string {
    return this._locale;
  }

  set locale(value: string) {
    this._locale = value;
  }

  get defaultLocale(): string {
    return this._defaultLocale;
  }

  set defaultLocale(value: string) {
    this._defaultLocale = value;
  }

  constructor() {
    this._storeTranslations("en", defaultEnTranslations);
  }

  t(key: string, options?: TranslateOptions): string {
    const locale = options?.locale ?? this._locale;
    const result = this.lookup(key, locale);
    if (result !== undefined) {
      const resolved = this.resolve(result, key, options);
      if (resolved !== undefined) return resolved;
    }

    if (options?.defaults) {
      for (const entry of options.defaults) {
        if ("key" in entry) {
          const val = this.lookup(entry.key, locale);
          if (val !== undefined) {
            const resolved = this.resolve(val, entry.key, options);
            if (resolved !== undefined) return resolved;
          }
        } else if ("message" in entry) {
          return interpolate(entry.message, this._interpolationOptions(options));
        }
      }
    }

    if (options?.defaultValue !== undefined) {
      return interpolate(options.defaultValue, this._interpolationOptions(options));
    }

    if (raiseOnMissingTranslations()) {
      throw new Error(`Translation missing: ${key}`);
    }
    return key;
  }

  storeTranslations(locale: string, data: TranslationTree): void {
    this._storeTranslations(locale, data);
  }

  /**
   * Configure the fallback chain. Pass an object mapping locale → chain,
   * or an array treated as a shared chain for every locale. Each chain
   * should include the originating locale as its first element, matching
   * Rails I18n::Fallbacks (i18n/lib/i18n/locale/fallbacks.rb).
   */
  setFallbacks(config: Record<string, string[]> | string[]): void {
    // Defensive copies: callers can mutate their input arrays without
    // affecting the configured chains.
    if (Array.isArray(config)) {
      this._sharedFallbacks = [...config];
      this._fallbacks = {};
    } else {
      this._sharedFallbacks = undefined;
      this._fallbacks = Object.fromEntries(
        Object.entries(config).map(([locale, chain]) => [locale, [...chain]]),
      );
    }
  }

  private _storeTranslations(locale: string, data: TranslationTree): void {
    if (!this._translations[locale]) {
      this._translations[locale] = {};
    }
    deepMergeInPlace(
      this._translations[locale] as Record<string, unknown>,
      deepDup(data) as Record<string, unknown>,
    );
  }

  reset(): void {
    this._translations = {};
    this._locale = "en";
    this._defaultLocale = "en";
    this._fallbacks = {};
    this._sharedFallbacks = undefined;
    this._storeTranslations("en", defaultEnTranslations);
  }

  private _fallbackChain(locale: string): string[] {
    const explicit = this._fallbacks[locale] ?? this._sharedFallbacks;
    const base = explicit && explicit.length > 0 ? [...explicit] : [];
    if (base[0] !== locale) base.unshift(locale);
    // I18n::Locale::Fallbacks#compute always pushes `defaults` onto every
    // chain (i18n/lib/i18n/locale/fallbacks.rb). Mirror that so a missing
    // key still falls through to `default_locale` even when an explicit
    // chain was configured.
    if (!base.includes(this._defaultLocale)) base.push(this._defaultLocale);
    return base;
  }

  private lookup(key: string, locale: string): TranslationValue | undefined {
    const path = key.split(".");
    for (const candidate of this._fallbackChain(locale)) {
      const localeData = this._translations[candidate];
      if (!localeData) continue;
      const hit = dig(localeData, path);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  private _interpolationOptions(options?: TranslateOptions): Record<string, unknown> {
    if (!options) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options)) {
      if (!RESERVED_KEYS.has(k)) out[k] = v;
    }
    return out;
  }

  private resolve(
    value: TranslationValue,
    key: string,
    options?: TranslateOptions,
  ): string | undefined {
    // Rails allows Procs as translation values; they're invoked with the
    // lookup key + options hash (i18n/lib/i18n/backend/base.rb `resolve`).
    // Inject the effective locale so lambdas can branch on it even when
    // the caller relied on the service-wide `I18n.locale`.
    if (typeof value === "function") {
      const effectiveOptions = {
        ...(options ?? {}),
        locale: options?.locale ?? this._locale,
      };
      return this.resolve(
        (value as TranslationLambda)(key, effectiveOptions as Record<string, unknown>),
        key,
        effectiveOptions,
      );
    }
    const opts = this._interpolationOptions(options);
    if (typeof value === "string") {
      return interpolate(value, opts);
    }
    if (value && typeof value === "object" && options?.count !== undefined) {
      const plural = value as { one?: string; other?: string };
      const form = options.count === 1 ? "one" : "other";
      const str = plural[form] ?? plural["other"];
      if (typeof str === "string") {
        return interpolate(str, opts);
      }
    }
    return undefined;
  }
}

const messages: TranslationTree = {
  invalid: "is invalid",
  blank: "can't be blank",
  present: "must be blank",
  too_short: {
    one: "is too short (minimum is 1 character)",
    other: "is too short (minimum is %{count} characters)",
  },
  too_long: {
    one: "is too long (maximum is 1 character)",
    other: "is too long (maximum is %{count} characters)",
  },
  wrong_length: {
    one: "is the wrong length (should be 1 character)",
    other: "is the wrong length (should be %{count} characters)",
  },
  not_a_number: "is not a number",
  not_an_integer: "must be an integer",
  greater_than: "must be greater than %{count}",
  greater_than_or_equal_to: "must be greater than or equal to %{count}",
  less_than: "must be less than %{count}",
  less_than_or_equal_to: "must be less than or equal to %{count}",
  equal_to: "must be equal to %{count}",
  other_than: "must be other than %{count}",
  odd: "must be odd",
  even: "must be even",
  inclusion: "is not included in the list",
  exclusion: "is reserved",
  taken: "has already been taken",
  confirmation: "doesn't match %{attribute}",
  accepted: "must be accepted",
  empty: "can't be empty",
  not_a_date: "is not a valid date",
  required: "must exist",
  password_too_long: "is too long",
  in: "must be in %{count}",
  model_invalid: "Validation failed: %{errors}",
};

const defaultEnTranslations: TranslationTree = {
  activemodel: {
    errors: {
      format: "%{attribute} %{message}",
      messages: deepDup(messages) as TranslationTree,
    },
  },
  errors: {
    format: "%{attribute} %{message}",
    messages: deepDup(messages) as TranslationTree,
    attributes: {},
  },
};

export const I18n = new I18nService();
