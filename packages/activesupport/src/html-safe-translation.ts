/** @internal */
import { I18n, MissingTranslationData } from "./i18n.js";
import { SafeBuffer, htmlEscape, isHtmlSafe } from "./core-ext/string/output-safety.js";

const I18N_OPTION_NAMES = new Set(["locale", "default", "raise", "scope", "separator"]);
const HTML_KEY_PATTERN = /(?:_|\b)html$/;

/** @internal */
export const HtmlSafeTranslation = {
  translate(key: string, options: Record<string, unknown> = {}): unknown {
    if (htmlSafeTranslationKey(key)) {
      const htmlSafeOptions = htmlEscapeTranslationOptions({ ...options });

      let exception = false;
      const origRaise = htmlSafeOptions.raise === true;
      delete htmlSafeOptions.raise;

      let translation: unknown;
      try {
        translation = I18n.translate(key, { ...htmlSafeOptions, raise: true } as Parameters<
          typeof I18n.translate
        >[1]);
      } catch (e) {
        if (!(e instanceof MissingTranslationData)) throw e;
        exception = true;
        translation = I18n.translate(key, htmlSafeOptions as Parameters<typeof I18n.translate>[1]);
      }

      if (exception) {
        if (origRaise) {
          I18n.translate(key, { ...options, raise: true } as Parameters<typeof I18n.translate>[1]);
        }
        return translation;
      }
      return htmlSafeTranslationResult(translation);
    }
    return I18n.translate(key, options as Parameters<typeof I18n.translate>[1]);
  },

  htmlSafeTranslationKey: htmlSafeTranslationKey,
};

function htmlSafeTranslationKey(key: string): boolean {
  return HTML_KEY_PATTERN.test(key);
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

function htmlSafeTranslationResult(translation: unknown): unknown {
  if (Array.isArray(translation)) {
    return translation.map((el) => (typeof el === "string" ? new SafeBuffer(el, true) : el));
  }
  if (typeof translation === "string") {
    return new SafeBuffer(translation, true);
  }
  return translation;
}
