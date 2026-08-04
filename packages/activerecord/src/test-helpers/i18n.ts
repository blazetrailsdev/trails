/**
 * Active Record's arm of `activemodel/src/test-helpers/i18n.ts`: a fresh
 * backend, with `I18n.load_path` re-supplying the framework locales.
 */
import { I18n } from "@blazetrails/activemodel";
import "../i18n.js";

/** A fresh backend; Rails' load path re-supplies the framework locales. */
export function resetI18n(): void {
  I18n.setBackend(new I18n.Simple());
}
