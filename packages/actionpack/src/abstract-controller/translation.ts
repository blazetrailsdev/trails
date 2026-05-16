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
  if (key && key.startsWith(".")) {
    const path = this.constructor.controllerPath().replace(/\//g, ".");
    const defaults: string[] = [`${path}${key}`];
    if (options.default != null) {
      // Flatten array defaults like Rails does.
      const userDefault = Array.isArray(options.default)
        ? (options.default as unknown[])
        : [options.default];
      defaults.push(...(userDefault as string[]));
    }
    options = { ...options, default: defaults };
    key = `${path}.${this.actionName}${key}`;
  }
  return I18n.translate(key, options as Parameters<typeof I18n.translate>[1]);
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
