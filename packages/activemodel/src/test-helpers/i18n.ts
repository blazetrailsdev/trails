/**
 * Rails test cases isolate translations with `I18n.backend = I18n::Backend::Simple.new`
 * and let `load_path` re-supply each framework's `en.yml` lazily (see
 * `reset_i18n_load_path` in activemodel/test/cases/validations/i18n_validation_test.rb).
 */
import { I18n } from "../i18n.js";

/** A fresh backend; Rails' load path re-supplies the framework locales. */
export function resetI18n(): void {
  I18n.setBackend(new I18n.Simple());
}
