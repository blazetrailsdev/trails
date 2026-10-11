import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "@blazetrails/activemodel";
import { RecordInvalid } from "../validations.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Topic } from "../test-helpers/models/topic.js";
import "../i18n.js";

fixtures([]);

describe("I18nGenerateMessageValidationTest", () => {
  let topic: Topic;

  class Backend extends I18n.Fallbacks(I18n.Simple) {}

  function resetI18nLoadPath(fn: () => void): void {
    const oldLoadPath = [...I18n.loadPath()];
    const oldBackend = I18n.backend();
    I18n.loadPath().length = 0;
    I18n.setBackend(new Backend());
    try {
      fn();
    } finally {
      I18n.loadPath().splice(0, I18n.loadPath().length, ...oldLoadPath);
      I18n.setBackend(oldBackend);
    }
  }

  beforeEach(() => {
    Topic.clearValidatorsBang();
    topic = new Topic();
    I18n.setBackend(new Backend());
  });
  it("generate message invalid with default message", () => {
    expect(topic.errors.generateMessage("title", ":invalid", { value: "title" })).toBe(
      "is invalid",
    );
  });

  it("generate message invalid with custom message", () => {
    expect(
      topic.errors.generateMessage("title", ":invalid", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toBe("custom message title");
  });

  it("generate message taken with default message", () => {
    expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
      "has already been taken",
    );
  });

  it("generate message taken with custom message", () => {
    expect(
      topic.errors.generateMessage("title", ":taken", {
        message: "custom message %{value}",
        value: "title",
      }),
    ).toBe("custom message title");
  });

  it("RecordInvalid exception can be localized", () => {
    const topic = new Topic();
    topic.errors.add("title", ":invalid");
    topic.errors.add("title", ":blank");
    expect(new RecordInvalid(topic).message).toBe(
      "Validation failed: Title is invalid, Title can't be blank",
    );
  });

  it("RecordInvalid exception translation falls back to the :errors namespace", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        errors: { messages: { record_invalid: "fallback message" } },
      });
      const topic = new Topic();
      topic.errors.add("title", ":blank");
      expect(new RecordInvalid(topic).message).toBe("fallback message");
    });
  });

  it("translation for 'taken' can be overridden", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        errors: { attributes: { title: { taken: "Custom taken message" } } },
      });
      expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
        "Custom taken message",
      );
    });
  });

  it("translation for 'taken' can be overridden in activerecord scope", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        activerecord: { errors: { messages: { taken: "Custom taken message" } } },
      });
      expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
        "Custom taken message",
      );
    });
  });

  it("translation for 'taken' can be overridden in activerecord model scope", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        activerecord: { errors: { models: { topic: { taken: "Custom taken message" } } } },
      });
      expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
        "Custom taken message",
      );
    });
  });

  it("translation for 'taken' can be overridden in activerecord attributes scope", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        activerecord: {
          errors: {
            models: { topic: { attributes: { title: { taken: "Custom taken message" } } } },
          },
        },
      });
      expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
        "Custom taken message",
      );
    });
  });

  it("activerecord attributes scope falls back to parent locale before it falls back to the :errors namespace", () => {
    resetI18nLoadPath(() => {
      I18n.backend().storeTranslations("en", {
        activerecord: {
          errors: { models: { topic: { attributes: { title: { taken: "custom en message" } } } } },
        },
      });
      I18n.backend().storeTranslations("en-US", {
        errors: { messages: { taken: "generic en-US fallback" } },
      });

      I18n.withLocale("en-US", () => {
        expect(topic.errors.generateMessage("title", ":taken", { value: "title" })).toBe(
          "custom en message",
        );
        expect(topic.errors.generateMessage("heading", ":taken", { value: "heading" })).toBe(
          "generic en-US fallback",
        );
      });
    });
  });
});
