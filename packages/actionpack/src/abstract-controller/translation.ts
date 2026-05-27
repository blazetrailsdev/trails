import {
  I18n,
  MissingTranslationData,
  HtmlSafeTranslation,
  htmlEscape,
} from "@blazetrails/activesupport";

/**
 * Host shape `translate` / `localize` mix into. Trails' `Metal` provides
 * both via its static `controllerPath()` and instance `actionName` —
 * any class with the same shape can include this module.
 */
export interface TranslationHost {
  actionName: string;
  constructor: { controllerPath(): string };
}

export interface TranslateOptions {
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Delegates to `I18n.translate`.
 *
 * When the given key starts with a period, it is scoped by the current
 * controller and action. So calling `translate(".foo")` from
 * `PeopleController#index` translates `"people.index.foo"`. This makes
 * it less repetitive to translate many keys within the same
 * controller / action and gives a simple framework for scoping them
 * consistently.
 *
 * Mirrors `AbstractController::Translation#translate`.
 */
export function translate(
  this: TranslationHost,
  key: string,
  options: TranslateOptions = {},
): unknown {
  // Rails: `t(nil, default: ...)` returns the default unchanged.
  if (key == null) {
    if (options.default !== undefined) return options.default;
    return `Translation missing: ${I18n.locale}.`;
  }

  const isHtmlKey = HtmlSafeTranslation.isHtmlSafeTranslationKey(key);
  const i18nTranslate = (k: string, opts: Record<string, unknown>) =>
    isHtmlKey
      ? HtmlSafeTranslation.translate(k, opts)
      : I18n.translate(k, opts as Parameters<typeof I18n.translate>[1]);

  if (isHtmlKey && options.default !== undefined) {
    const defs = Array.isArray(options.default) ? options.default : [options.default];
    options = { ...options, default: defs.map((v) => htmlEscapeDefault(v)) };
  }

  if (key.startsWith(".")) {
    const path = this.constructor.controllerPath().replace(/\//g, ".");
    const scopedKey = `${path}.${this.actionName}${key}`;
    const fallbackKey = `${path}${key}`;

    // Forward caller options (interpolation vars, locale, etc.) to
    // every internal lookup, but strip `default` and `raise` — the
    // chain below implements its own default-walking semantics, and
    // `raise: true` must only fire after the *whole* chain (scoped →
    // fallback → user defaults) is exhausted, not at the first miss.
    const passOptions = { ...options } as Record<string, unknown>;
    delete passOptions.default;
    delete passOptions.raise;

    const direct = i18nTranslate(scopedKey, passOptions);
    if (!isMissing(direct)) return direct;

    const fallback = i18nTranslate(fallbackKey, passOptions);
    if (!isMissing(fallback)) return fallback;

    // User-supplied defaults — Rails treats Symbols as keys to try
    // and Strings as literal default values. JS has no Symbol literals
    // in this position; mirror the convention by treating
    // `:`-prefixed strings as key paths to look up.
    if (options.default !== undefined) {
      const defs = Array.isArray(options.default) ? options.default : [options.default];
      for (const d of defs as unknown[]) {
        if (typeof d === "string" && d.startsWith(":")) {
          const r = i18nTranslate(d.slice(1), passOptions);
          if (!isMissing(r)) return r;
        } else {
          return d;
        }
      }
    }

    // Chain exhausted — honor `raise: true`. Throw directly rather
    // than re-entering I18n.translate with the original options:
    // `default` is still in there and I18n returns it before honoring
    // raise, so we'd silently return the already-exhausted defaults
    // array instead of raising.
    if ((options as { raise?: boolean }).raise) {
      const locale =
        (passOptions as { locale?: string }).locale ??
        (I18n as unknown as { locale: string }).locale;
      throw new MissingTranslationData(locale, scopedKey);
    }
    return direct; // "Translation missing: ..." from the scoped lookup
  }
  return i18nTranslate(key, options);
}

function htmlEscapeDefault(value: unknown): unknown {
  if (typeof value === "string") return htmlEscape(value);
  return value;
}

function isMissing(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("Translation missing:");
}

/** Rails alias `:t :translate`. */
export function t(this: TranslationHost, key: string, options: TranslateOptions = {}): unknown {
  return translate.call(this, key, options);
}

export interface LocalizeOptions {
  [key: string]: unknown;
}

/** Delegates to `I18n.localize`. */
export function localize(
  this: TranslationHost,
  object: Date,
  options: LocalizeOptions = {},
): string {
  return I18n.localize(object, options as Parameters<typeof I18n.localize>[1]);
}

/** Rails alias `:l :localize`. */
export function l(this: TranslationHost, object: Date, options: LocalizeOptions = {}): string {
  return I18n.localize(object, options as Parameters<typeof I18n.localize>[1]);
}
