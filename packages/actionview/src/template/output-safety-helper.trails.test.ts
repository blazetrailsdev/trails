import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { I18n } from "@blazetrails/activesupport";

import { toSentence } from "../helpers/output-safety-helper.js";

I18n.setEnforceAvailableLocales(false);

describe("OutputSafetyHelperI18nTest", () => {
  beforeEach(() => {
    I18n.translate("support.array.words_connector");
  });

  afterEach(() => {
    I18n.reloadBang();
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

  it("to_sentence looks the connectors up under I18n.locale for locale: false", () => {
    I18n.backend().storeTranslations("en", {
      support: { array: { two_words_connector: " y " } },
    });

    expect(toSentence(["one", "two"], { locale: false }).toString()).toBe("one y two");
  });

  it("to_sentence rejects unknown options", () => {
    expect(() => toSentence(["one", "two"], { passing: "invalid option" } as never)).toThrowError(
      "Unknown key: :passing. Valid keys are: :wordsConnector, :twoWordsConnector, :lastWordConnector, :locale",
    );
  });
});
