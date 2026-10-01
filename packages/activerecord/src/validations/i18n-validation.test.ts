import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Error as ActiveModelError, I18n } from "@blazetrails/activemodel";
import "../support/canonical-model-index.js";
import { fixtures } from "../test-fixtures.js";
import { repairValidations } from "../cases/validations-repair-helper.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";

fixtures([]);

describe("I18nValidationTest", () => {
  let topic: Topic;
  let unique: Topic | undefined;
  let replied: Topic | undefined;
  let oldLoadPath: string[];
  let oldBackend: ReturnType<typeof I18n.backend>;

  beforeEach(async () => {
    await repairValidations([Topic, Reply], () => {});
    Reply.validatesPresenceOf("title");
    topic = new Topic();
    unique = replied = undefined;
    oldLoadPath = [...I18n.loadPath()];
    oldBackend = I18n.backend();
    I18n.loadPath().length = 0;
    I18n.setBackend(new I18n.Simple());
    I18n.backend().storeTranslations("en", { errors: { messages: { custom: null } } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    I18n.loadPath().splice(0, I18n.loadPath().length, ...oldLoadPath);
    I18n.setBackend(oldBackend);
    await repairValidations([Topic, Reply], () => {});
  });

  async function uniqueTopic(): Promise<Topic> {
    return (unique ??= await Topic.create({ title: "unique!" }));
  }

  async function repliedTopic(): Promise<Topic> {
    if (replied === undefined) {
      const topic = await Topic.create({ title: "topic" });
      await topic.replies.push(new Reply());
      replied = topic;
    }
    return replied;
  }

  it("validates_uniqueness_of on generated message ", async () => {
    Topic.validatesUniquenessOf("title", {});
    topic.title = (await uniqueTopic()).title;

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    await topic.isValid();
    void topic.errors.messages;
    expect(spy).toHaveBeenCalledExactlyOnceWith("title", ":taken", topic, { value: "unique!" });
  });

  it("validates_associated on generated message ", async () => {
    Topic.validatesAssociated("replies", {});
    const replies = await (await repliedTopic()).replies;

    const spy = vi.spyOn(ActiveModelError, "generateMessage");
    await (await repliedTopic()).save();
    void (await repliedTopic()).errors.messages;
    expect(spy).toHaveBeenCalledExactlyOnceWith("replies", ":invalid", await repliedTopic(), {
      value: replies,
    });
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

    Topic.validatesAssociated("replies");
    await (await repliedTopic()).isValid();
    expect([...new Set((await repliedTopic()).errors.messagesFor("replies"))]).toEqual([
      "custom message",
    ]);
  });

  it("validates associated finds global default translation", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { messages: { invalid: "global message" } } },
    });

    Topic.validatesAssociated("replies");
    await (await repliedTopic()).isValid();
    expect((await repliedTopic()).errors.messagesFor("replies")).toEqual(["global message"]);
  });
});
