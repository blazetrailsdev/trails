import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { Base, registerModel } from "../index.js";
import { Error as ActiveModelError, I18n } from "@blazetrails/activemodel";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { seedAssociationCache } from "../test-helpers/seed-association-cache.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    topics: TEST_SCHEMA.topics,
  });
});

/** An associated child whose validation always fails — stands in for Rails'
 *  `replied_topic.replies` (a topic carrying one invalid reply). */
class FakeReply {
  isValid(): boolean {
    return false;
  }
}

describe("I18nValidationTest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    I18n.reset();
  });

  // Rails generates one test per COMMON_CASE via string interpolation; the
  // canonical (interpolation-stripped) name is the "given no options" case.
  it("validates_uniqueness_of on generated message ", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    registerModel("I18nUniquenessTopic", Topic);
    await Topic.create({ title: "unique!" });
    const topic = new Topic({ title: "unique!" });

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    await topic.save();
    void topic.errors.messages;
    // Rails' assert_called_with asserts exactly one call with these args.
    expect(spy).toHaveBeenCalledWith("title", "taken", topic, { value: "unique!" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Rails generates one test per COMMON_CASE via string interpolation; the
  // canonical (interpolation-stripped) name is the "given no options" case.
  it("validates_associated on generated message ", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nAssociatedTopic", Topic);
    const replies = [new FakeReply()];
    const topic = new Topic({ title: "topic" });
    seedAssociationCache(topic, "replies", replies);

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    topic.isValid();
    void topic.errors.messages;
    // Rails' assert_called_with asserts exactly one call with these args.
    expect(spy).toHaveBeenCalledWith("replies", "invalid", topic, { value: replies });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("validates associated finds custom model key translation", () => {
    I18n.storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { replies: { invalid: "custom message" } } } } },
      },
    });
    I18n.storeTranslations("en", {
      activerecord: { errors: { messages: { invalid: "global message" } } },
    });

    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nCustomKeyTopic", Topic);
    const topic = new Topic({ title: "topic" });
    seedAssociationCache(topic, "replies", [new FakeReply()]);

    topic.isValid();
    expect([...new Set(topic.errors.get("replies"))]).toEqual(["custom message"]);
  });

  it("validates associated finds global default translation", () => {
    I18n.storeTranslations("en", {
      activerecord: { errors: { messages: { invalid: "global message" } } },
    });

    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nGlobalKeyTopic", Topic);
    const topic = new Topic({ title: "topic" });
    seedAssociationCache(topic, "replies", [new FakeReply()]);

    topic.isValid();
    expect(topic.errors.get("replies")).toEqual(["global message"]);
  });
});
