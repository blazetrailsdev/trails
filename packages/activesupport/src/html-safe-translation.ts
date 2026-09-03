/** @internal */
import { I18n } from "./i18n.js";
import { SafeBuffer, isHtmlSafe } from "./core-ext/string/output-safety.js";
import { htmlEscape } from "./core-ext/tse/util.js";

const I18N_OPTION_NAMES = new Set(["locale", "default", "raise", "scope", "separator"]);
const HTML_KEY_PATTERN = /(?:_|\b)html$/;

/** @internal */
export const HtmlSafeTranslation = {
  translate(key: string, options: Record<string, unknown> = {}): unknown {
    if (isHtmlSafeTranslationKey(key)) {
      const htmlSafeOptions = htmlEscapeTranslationOptions({ ...options });

      let exception = false;

      const exceptionHandler = (...args: unknown[]): unknown => {
        exception = true;
        const handler = I18n.exceptionHandler();
        return typeof handler === "function"
          ? (handler as (...a: unknown[]) => unknown)(...args)
          : (handler as { call: (...a: unknown[]) => unknown }).call(...args);
      };

      const translation = I18n.translate(key, {
        ...htmlSafeOptions,
        exceptionHandler,
      } as Parameters<typeof I18n.translate>[1]);

      if (exception) {
        return translation;
      } else {
        return htmlSafeTranslation(translation);
      }
    } else {
      return I18n.translate(key, options as Parameters<typeof I18n.translate>[1]);
    }
  },

  isHtmlSafeTranslationKey: isHtmlSafeTranslationKey,
  /** @internal */
  htmlEscapeTranslationOptions: htmlEscapeTranslationOptions,
  /** @internal */
  isI18nOption: isI18nOption,
  /** @internal */
  htmlSafeTranslation,
};

function isHtmlSafeTranslationKey(key: string): boolean {
  return HTML_KEY_PATTERN.test(key);
}

/** @internal */
function isI18nOption(name: string): boolean {
  return I18N_OPTION_NAMES.has(name);
}

/** @internal */
function htmlEscapeTranslationOptions(options: Record<string, unknown>): Record<string, unknown> {
  for (const name of Object.keys(options)) {
    if (I18N_OPTION_NAMES.has(name)) continue;
    if (name === "count" && typeof options[name] === "number") continue;
    const value = options[name];
    if (typeof value === "string") {
      if (isHtmlSafe(value)) continue;
      options[name] = htmlEscape(value).toString();
    } else if (value != null && typeof value === "object" && "toString" in value) {
      if (isHtmlSafe(value)) continue;
      options[name] = htmlEscape(String(value)).toString();
    }
  }
  return options;
}

/** @internal */
function htmlSafeTranslation(translation: unknown): unknown {
  if (Array.isArray(translation)) {
    return translation.map((el) => (typeof el === "string" ? new SafeBuffer(el, true) : el));
  }
  if (typeof translation === "string") {
    return new SafeBuffer(translation, true);
  }
  return translation;
}
