/**
 * Active Record's arm of the same load-path stand-in Active Model's
 * `test-helpers/i18n.ts` documents: a fresh backend plus the `en.yml` data
 * Rails' `I18n.load_path` would re-read.
 */
import { I18n } from "@blazetrails/activemodel";
import { en as activemodelEn } from "@blazetrails/activemodel/locale/en";
import { en } from "../locale/en.js";

/** A fresh backend carrying the framework locales, as Rails' load path supplies them. */
export function resetI18n(): void {
  resetI18nEmpty();
  I18n.backend().storeTranslations("en", activemodelEn);
  I18n.backend().storeTranslations("en", en);
}

/** A fresh backend with no framework locales — Rails' `I18n.load_path.clear`. */
export function resetI18nEmpty(): void {
  I18n.setBackend(new I18n.Simple());
}
