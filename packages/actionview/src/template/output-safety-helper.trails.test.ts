import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@blazetrails/activesupport";

import { toSentence } from "../helpers/output-safety-helper.js";

/**
 * `I18n.reload!` would drop the `en` locale Active Support stores at import
 * time (it is not on `I18n.load_path` yet — see activesupport/src/i18n.ts), so
 * these restore `support.array` to its `locale/en.yml` values instead.
 */
const EN_ARRAY_CONNECTORS = {
  words_connector: ", ",
  two_words_connector: " and ",
  last_word_connector: ", and ",
};

I18n.setEnforceAvailableLocales(false);

describe("OutputSafetyHelperI18nTest", () => {
  afterEach(() => {
    I18n.backend().storeTranslations("en", { support: { array: EN_ARRAY_CONNECTORS } });
  });

  it("to_sentence uses the support.array connectors from I18n", () => {
    I18n.backend().storeTranslations("en", {
      support: { array: { words_connector: " o ", last_word_connector: " o al menos " } },
    });

    expect(toSentence(["one", "two", "three"]).toString()).toBe("one o two o al menos three");
  });

  it("to_sentence looks the connectors up under the given locale", () => {
    I18n.backend().storeTranslations("es", {
      support: { array: { two_words_connector: " y " } },
    });

    expect(toSentence(["one", "two"], { locale: "es" }).toString()).toBe("one y two");
  });

  it("to_sentence lets the caller options win over the I18n connectors", () => {
    I18n.backend().storeTranslations("en", {
      support: { array: { two_words_connector: " y " } },
    });

    expect(toSentence(["one", "two"], { twoWordsConnector: " - " }).toString()).toBe("one - two");
  });
});
