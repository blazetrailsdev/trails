import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Base } from "../index.js";
import { I18n } from "@blazetrails/activemodel";
import { RecordInvalid } from "../validations.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ topics: { title: "string" } });
});

describe("I18nGenerateMessageValidationTest", () => {
  afterEach(() => {
    I18n.reset();
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
    I18n.resetEmpty();
    I18n.storeTranslations("en", { errors: { messages: { record_invalid: "fallback message" } } });
    const topic = makeTopic();
    topic.errors.add("title", "blank");
    expect(new RecordInvalid(topic).message).toBe("fallback message");
  });

  it("translation for 'taken' can be overridden", () => {
    I18n.resetEmpty();
    I18n.storeTranslations("en", {
      errors: { attributes: { title: { taken: "Custom taken message" } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord scope", () => {
    I18n.resetEmpty();
    I18n.storeTranslations("en", {
      activerecord: { errors: { messages: { taken: "Custom taken message" } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord model scope", () => {
    I18n.resetEmpty();
    I18n.storeTranslations("en", {
      activerecord: { errors: { models: { topic: { taken: "Custom taken message" } } } },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("translation for 'taken' can be overridden in activerecord attributes scope", () => {
    I18n.resetEmpty();
    I18n.storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { title: { taken: "Custom taken message" } } } } },
      },
    });
    const topic = makeTopic();
    expect(topic.errors.generateMessage("title", "taken", { value: "title" })).toBe(
      "Custom taken message",
    );
  });

  it("activerecord attributes scope falls back to parent locale before it falls back to the :errors namespace", () => {
    I18n.resetEmpty();
    I18n.storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { title: { taken: "custom en message" } } } } },
      },
    });
    I18n.storeTranslations("en-US", {
      errors: { messages: { taken: "generic en-US fallback" } },
    });
    I18n.setFallbacks({ "en-US": ["en-US", "en"] });

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
