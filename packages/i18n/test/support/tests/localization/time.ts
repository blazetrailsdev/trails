import { config } from "../../../../lib/i18n.js";

export function setupTimeTranslations(): void {
  config().backend.storeTranslations("de", {
    time: {
      formats: {
        default: "%a, %d. %b %Y %H:%M:%S %z",
        short: "%d. %b %H:%M",
        long: "%d. %B %Y %H:%M",
      },
      am: "am",
      pm: "pm",
    },
  });
}
