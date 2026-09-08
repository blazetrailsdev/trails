import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { I18n } from "@blazetrails/activesupport";

import { raw, toSentence } from "../helpers/output-safety-helper.js";
import { SafeBuffer } from "@blazetrails/activesupport";
import { OutputBuffer } from "../buffers.js";

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

describe("OutputSafetyHelperTest", () => {
  it("raw returns SafeBuffer from OutputBuffer without String() coercion", () => {
    const buf = new OutputBuffer();
    buf.safeAppend("<b>hi</b>");
    const result = raw(buf);
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("<b>hi</b>");
  });

  it("raw always returns an html-safe result even from an unsafe SafeBuffer", () => {
    const unsafe = new SafeBuffer("<b>ok</b>");
    const result = raw(unsafe);
    expect(result.htmlSafe).toBe(true);
    expect(result.toString()).toBe("<b>ok</b>");
  });
});
