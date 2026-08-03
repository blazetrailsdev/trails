import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { Base } from "../index.js";
import { I18n } from "@blazetrails/activemodel";
import { RecordInvalid } from "../validations.js";
import { fixtures } from "../test-fixtures.js";
import { resetI18n, resetI18nEmpty } from "../test-helpers/i18n.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
fixtures({});

describe("I18nGenerateMessageValidationTest", () => {
  afterEach(() => {
    resetI18n();
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  function makeTopic() {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    return new Topic();
  }

  it("generate message invalid with default message", () => {
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "invalid", { value: "title" })).toBe("is invalid");
  });

  it("generate message invalid with custom message", () => {
    const topic = makeTopic();
    expect(
      topic.errors.generateMessage("title", "invalid", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toBe("custom message title");
  });

  it("generate message taken with default message", () => {
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "has already been taken",
    );
  });

  it("generate message taken with custom message", () => {
    const topic = makeTopic();
    expect(
      topic.errors.generateMessage("title", "taken", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toBe("custom message title");
  });

  it("RecordInvalid exception can be localized", () => {
    const topic = makeTopic();
    topic.errors.add("title", "invalid");
    topic.errors.add("title", "blank");
    expect(new RecordInvalid(topic).message).toBe(
      "Validation failed: Title is invalid, Title can't be blank",
    );
  });

  it("RecordInvalid exception translation falls back to the :errors namespace", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      errors: { messages: { record_invalid: "fallback message" } },
    });
    const topic = makeTopic();
    topic.errors.add("title", "blank");
    expect(new RecordInvalid(topic).message).toBe("fallback message");
  });

  it("translation for 'taken' can be overridden", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      errors: { attributes: { title: { taken: "Custom taken message" } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord scope", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { messages: { taken: "Custom taken message" } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord model scope", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { models: { topic: { taken: "Custom taken message" } } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord attributes scope", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { title: { taken: "Custom taken message" } } } } },
      },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  // Rails' case builds its backend as `class Backend < I18n::Backend::Simple;
  // include I18n::Backend::Fallbacks; end`
  // (activerecord/test/cases/validations/i18n_generate_message_validation_test.rb:7-9).
  // `i18n/backend/fallbacks.rb` has no port yet — story `i18n-backend-fallbacks`
  // — so there is no locale chain for "en-US" to walk up. Unskip with that story;
  // nothing else about this case changes.
  it.skip("activerecord attributes scope falls back to parent locale before it falls back to the :errors namespace", () => {
    resetI18nEmpty();
    I18n.backend().storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { title: { taken: "custom en message" } } } } },
      },
    });
    I18n.backend().storeTranslations("en-US", {
      errors: { messages: { taken: "generic en-US fallback" } },
    });

    const topic = makeTopic();
    I18n.withLocale("en-US", () => {
      expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
        "custom en message",
      );
      expect(topic.errors.generateMessage("heading", "taken", { value: "heading" })).toBe(
        "generic en-US fallback",
      );
    });
  });
});
