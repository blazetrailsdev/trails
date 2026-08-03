/**
 * Rails test cases isolate translations with `I18n.backend = I18n::Backend::Simple.new`
 * and let `load_path` re-supply each framework's `en.yml` lazily (see
 * `reset_i18n_load_path` in activemodel/test/cases/validations/i18n_validation_test.rb).
 * `load_path` is not read back yet (story `i18n-backend-file-loading-localize`),
 * so re-storing Active Model's `en` here stands in for that re-read.
 */
import { I18n } from "../i18n.js";
import { en } from "../locale/en.js";

/** A fresh backend carrying the framework locales, as Rails' load path supplies them. */
export function resetI18n(): void {
  resetI18nEmpty();
  I18n.backend().storeTranslations("en", en);
}

/** A fresh backend with no framework locales — Rails' `I18n.load_path.clear`. */
export function resetI18nEmpty(): void {
  I18n.setBackend(new I18n.Simple());
}
