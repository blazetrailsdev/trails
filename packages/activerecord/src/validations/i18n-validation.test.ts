import { describe, it, expect, afterEach, vi } from "vitest";
import { Base, registerModel } from "../index.js";
import { Error as ActiveModelError, I18n } from "@blazetrails/activemodel";
import { association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { resetI18n } from "../test-helpers/i18n.js";
import { Reply } from "../test-helpers/models/reply.js";

fixtures([]);
// The canonical `topics` table is laid at boot by loadCanonicalSchema.

/** An associated child whose validation always fails — stands in for Rails'
 *  `replied_topic.replies` (a topic carrying one invalid reply). */
class FakeReply extends Reply {
  override isValid(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe("I18nValidationTest", () => {
  registerModel("Reply", Reply);

  afterEach(() => {
    vi.restoreAllMocks();
    resetI18n();
  });

  // Rails generates one test per COMMON_CASE via string interpolation; the
  // canonical (interpolation-stripped) name is the "given no options" case.
  it("validates_uniqueness_of on generated message ", async () => {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.validatesUniquenessOf("title");
      }
    }
    registerModel("I18nUniquenessTopic", Topic);
    await Topic.create({ title: "unique!" });
    const topic = new Topic({ title: "unique!" });

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    await topic.save();
    void topic.errors.messages;
    // Rails' assert_called_with asserts exactly one call with these args — one
    // assertion, so the port folds both halves into the single matcher.
    expect(spy).toHaveBeenCalledExactlyOnceWith("title", ":taken", topic, { value: "unique!" });
  });

  // Rails generates one test per COMMON_CASE via string interpolation; the
  // canonical (interpolation-stripped) name is the "given no options" case.
  it("validates_associated on generated message ", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("replies", { className: "Reply", dependent: "destroy", inverseOf: "topic" });
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nAssociatedTopic", Topic);
    // Rails' `replied_topic`: `topic.replies << Reply.new` (i18n_validation_test.rb:29-35).
    const replies = [new FakeReply()];
    const topic = new Topic({ title: "topic" });
    await association(topic, "replies").concat(...replies);

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    await topic.isValid();
    void topic.errors.messages;
    // Rails' assert_called_with asserts exactly one call with these args — one
    // assertion, so the port folds both halves into the single matcher.
    expect(spy).toHaveBeenCalledExactlyOnceWith("replies", ":invalid", topic, { value: replies });
  });

  it("validates associated finds custom model key translation", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { replies: { invalid: "custom message" } } } } },
      },
    });
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { messages: { invalid: "global message" } } },
    });

    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("replies", { className: "Reply", dependent: "destroy", inverseOf: "topic" });
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nCustomKeyTopic", Topic);
    const topic = new Topic({ title: "topic" });
    await association(topic, "replies").concat(new FakeReply());

    await topic.isValid();
    expect([...new Set(topic.errors.messagesFor("replies"))]).toEqual(["custom message"]);
  });

  it("validates associated finds global default translation", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { messages: { invalid: "global message" } } },
    });

    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("replies", { className: "Reply", dependent: "destroy", inverseOf: "topic" });
        this.validatesAssociated("replies");
      }
    }
    registerModel("I18nGlobalKeyTopic", Topic);
    const topic = new Topic({ title: "topic" });
    await association(topic, "replies").concat(new FakeReply());

    await topic.isValid();
    expect(topic.errors.messagesFor("replies")).toEqual(["global message"]);
  });
});
