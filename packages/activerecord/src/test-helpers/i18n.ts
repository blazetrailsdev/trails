/**
 * Active Record's arm of the same load-path stand-in Active Model's
 * `test-helpers/i18n.ts` documents: a fresh backend plus the `en.yml` data
 * Rails' `I18n.load_path` would re-read.
 */
import { I18n } from "@blazetrails/activemodel";
import { en as activemodelEn } from "@blazetrails/activemodel/locale/en";
import { en } from "../locale/en.js";

/**
 * A fresh backend carrying the framework locales, as Rails' load path supplies
 * them. `backend` is the `I18n.backend = ...` half of the stand-in: Rails test
 * cases that need a mixin over `Simple` declare their own backend class and
 * assign an instance of it (activerecord/test/cases/validations/
 * i18n_generate_message_validation_test.rb:14).
 */
export function resetI18n(backend: I18n.Base = new I18n.Simple()): void {
  resetI18nEmpty(backend);
  I18n.backend().storeTranslations("en", activemodelEn);
  I18n.backend().storeTranslations("en", en);
}

/** A fresh backend with no framework locales — Rails' `I18n.load_path.clear`. */
export function resetI18nEmpty(backend: I18n.Base = new I18n.Simple()): void {
  I18n.setBackend(backend);
}
