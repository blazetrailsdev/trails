import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { I18n } from "@blazetrails/activesupport";

import { toSentence } from "../helpers/output-safety-helper.js";

I18n.setEnforceAvailableLocales(false);

describe("OutputSafetyHelperI18nTest", () => {
  // `store_translations` does not initialize (simple.rb:35-45), so a store that
  // lands before the first lookup is deep-merged *under* `locale/en.yml` when
  // `#lookup` finally runs `init_translations` (simple.rb:81-84, 92). Rails'
  // own connector test reads a default first for the same reason
  // (activesupport/test/i18n_test.rb:91).
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

  // Unlike Array#to_sentence (core_ext/array/conversions.rb:68), the
  // html_safe-aware helper has no `locale: false` guard
  // (output_safety_helper.rb:50), and `I18n.translate` reads `false` as
  // "no locale given" and falls back to `I18n.locale` (i18n.ts:238).
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
