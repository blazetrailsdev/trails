import { I18n } from "@blazetrails/activesupport";

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
  if (key.startsWith(".")) {
    const path = this.constructor.controllerPath().replace(/\//g, ".");
    const scopedKey = `${path}.${this.actionName}${key}`;
    const fallbackKey = `${path}${key}`;

    // Forward caller options (interpolation vars, locale, etc.) to
    // every internal lookup, but strip `default` — the chain below
    // implements its own default-walking semantics.
    const passOptions = { ...options };
    delete passOptions.default;

    const direct = I18n.translate(scopedKey, passOptions as Parameters<typeof I18n.translate>[1]);
    if (!isMissing(direct)) return direct;

    const fallback = I18n.translate(
      fallbackKey,
      passOptions as Parameters<typeof I18n.translate>[1],
    );
    if (!isMissing(fallback)) return fallback;

    // User-supplied defaults — Rails treats Symbols as keys to try
    // and Strings as literal default values. JS has no Symbol literals
    // in this position; mirror the convention by treating
    // `:`-prefixed strings as key paths to look up.
    if (options.default !== undefined) {
      const defs = Array.isArray(options.default) ? options.default : [options.default];
      for (const d of defs as unknown[]) {
        if (typeof d === "string" && d.startsWith(":")) {
          const r = I18n.translate(d.slice(1), passOptions as Parameters<typeof I18n.translate>[1]);
          if (!isMissing(r)) return r;
        } else {
          return d;
        }
      }
    }

    return direct; // "Translation missing: ..." from the scoped lookup
  }
  return I18n.translate(key, options as Parameters<typeof I18n.translate>[1]);
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
