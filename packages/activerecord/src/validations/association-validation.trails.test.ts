import { afterEach, describe, expect, it } from "vitest";
import "../support/canonical-model-index.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";

describe("AssociationValidationTest", () => {
  fixtures(["topics"]);

  afterEach(() => {
    Topic.clearValidatorsBang();
    Reply.clearValidatorsBang();
  });

  it("an error on a singular association interpolates the loaded record as value", async () => {
    const topic = await Topic.create({ title: "uhohuhoh" });
    const r = await Reply.find(
      (await Reply.create({ title: "A reply", content: "with content!", parent_id: topic.id })).id,
    );
    let value: unknown;
    Reply.validatesAbsenceOf("topic", {
      message: (_object: unknown, data: { value: unknown }) => {
        value = data.value;
        return "is present";
      },
    });

    expect(await r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic")).toEqual(["is present"]);
    expect(value).toBeInstanceOf(Topic);
    expect((value as Topic).id).toBe(topic.id);
  });

  it("an error on a collection association interpolates the association's proxy as value", async () => {
    let value: unknown;
    Topic.validatesAbsenceOf("replies", {
      message: (_object: unknown, data: { value: unknown }) => {
        value = data.value;
        return "is present";
      },
    });
    const t = await Topic.create({ title: "uhohuhoh" });
    await t.replies.push(new Reply({ title: "A reply", content: "with content!" }));
    const reloaded = await Topic.find(t.id);

    expect(await reloaded.isValid()).toBe(false);
    expect(reloaded.errors.messagesFor("replies")).toEqual(["is present"]);
    expect(value).toBe(reloaded.replies);
    expect(reloaded.replies.isLoaded).toBe(true);
  });
});
