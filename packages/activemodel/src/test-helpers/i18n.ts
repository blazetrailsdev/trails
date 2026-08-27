import { I18n } from "../i18n.js";

export function resetI18n(): void {
  I18n.setBackend(new I18n.Simple());
}
