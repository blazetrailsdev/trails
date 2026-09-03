import { MissingTranslationData } from "@blazetrails/i18n";
import { I18n, HtmlSafeTranslation, htmlEscape } from "@blazetrails/activesupport";

export interface TranslationHost {
  actionName: string;
  constructor: { controllerPath(): string };
}

export interface TranslateOptions {
  default?: unknown;
  [key: string]: unknown;
}

export function translate(
  this: TranslationHost,
  key: string,
  options: TranslateOptions = {},
): unknown {
  if (key == null) {
    if (options.default !== undefined) return options.default;
    return `Translation missing: ${I18n.locale()}.`;
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

    const passOptions = { ...options } as Record<string, unknown>;
    delete passOptions.default;
    delete passOptions.raise;

    const direct = i18nTranslate(scopedKey, passOptions);
    if (!isMissing(direct)) return direct;

    const fallback = i18nTranslate(fallbackKey, passOptions);
    if (!isMissing(fallback)) return fallback;

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

    if ((options as { raise?: boolean }).raise) {
      const locale = (passOptions as { locale?: string }).locale ?? (I18n.locale() as string);
      throw new MissingTranslationData(locale, scopedKey);
    }
    return direct;
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

export function t(this: TranslationHost, key: string, options: TranslateOptions = {}): unknown {
  return translate.call(this, key, options);
}

export interface LocalizeOptions {
  [key: string]: unknown;
}

export function localize(
  this: TranslationHost,
  object: unknown,
  options: LocalizeOptions = {},
): string {
  return I18n.localize(object, options as Parameters<typeof I18n.localize>[1]) as string;
}

export function l(this: TranslationHost, object: unknown, options: LocalizeOptions = {}): string {
  return I18n.localize(object, options as Parameters<typeof I18n.localize>[1]) as string;
}
