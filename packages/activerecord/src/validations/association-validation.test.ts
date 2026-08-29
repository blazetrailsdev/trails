import { afterEach, describe, expect, it } from "vitest";
import { association } from "../associations.js";
import "../support/canonical-model-index.js";
import { fixtures } from "../test-fixtures.js";
import { repairValidations } from "../cases/validations-repair-helper.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Human } from "../test-helpers/models/human.js";
import { Interest } from "../test-helpers/models/interest.js";

describe("AssociationValidationTest", () => {
  fixtures(["topics"]);

  afterEach(() => {
    Topic.clearValidatorsBang();
    Reply.clearValidatorsBang();
    Interest.clearValidatorsBang();
  });

  it("validates associated many", async () => {
    Topic.validatesAssociated("replies");
    Reply.validatesPresenceOf("content");
    const t = await Topic.create({ title: "uhohuhoh", content: "whatever" });
    const r = association(t, "replies").build({ title: "A reply" }) as Reply;
    const r2 = association(t, "replies").build({
      title: "Another reply",
      content: "non-empty",
    }) as Reply;
    const r3 = association(t, "replies").build({ title: "Yet another reply" }) as Reply;
    const r4 = association(t, "replies").build({
      title: "The last reply",
      content: "non-empty",
    }) as Reply;

    expect(await t.isValid()).toBe(false);
    expect(t.errors.messagesFor("replies").length).toBeGreaterThan(0);
    expect(r.errors.count).toBe(1);
    expect(r2.errors.count).toBe(0);
    expect(r3.errors.count).toBe(1);
    expect(r4.errors.count).toBe(0);
    r.writeAttribute("content", "non-empty");
    r3.writeAttribute("content", "non-empty");
    expect(await t.isValid()).toBe(true);
  });

  it("validates associated one", async () => {
    Reply.validatesAssociated("topic");
    Topic.validatesPresenceOf("content");
    const r = new Reply({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    r.topic = topic;
    expect(await r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic").length).toBeGreaterThan(0);
    topic.writeAttribute("content", "non-empty");
    expect(await r.isValid()).toBe(true);
  });

  it("validates associated with multiple attributes and array forms", async () => {
    Topic.validatesAssociated(["replies"], "openReplies");
    Reply.validatesPresenceOf("content");
    const t = new Topic();
    association(t, "replies").build({ title: "A reply" });
    association(t, "openReplies").build({ title: "A reply" });
    expect(await t.isValid()).toBe(false);
    expect(t.errors.messagesFor("replies").length).toBeGreaterThan(0);
    expect(t.errors.messagesFor("openReplies").length).toBeGreaterThan(0);
  });

  it("validates associated marked for destruction", async () => {
    Topic.validatesAssociated("replies");
    Reply.validatesPresenceOf("content");
    const t = new Topic();
    const reply = association(t, "replies").build() as Reply;
    expect(await t.isInvalid()).toBe(true);
    reply.markForDestruction();
    expect(await t.isValid()).toBe(true);
  });

  it("validates associated without marked for destruction", async () => {
    Topic.validatesAssociated("replies");
    const t = new Topic();
    association(t, "replies").build({ title: "A reply" });
    expect(await t.isValid()).toBe(true);
  });

  it("validates associated with custom message using quotes", async () => {
    Reply.validatesAssociated("topic", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    Topic.validatesPresenceOf("content");
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    r.topic = topic;
    expect(await r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic")).toEqual([
      "This string contains 'single' and \"double\" quotes",
    ]);
  });

  it("validates associated missing", async () => {
    Reply.validatesPresenceOf("topic");
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    expect(await r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic").length).toBeGreaterThan(0);

    r.topic = (await Topic.first()) as Topic;
    expect(await r.isValid()).toBe(true);
  });

  it("validates presence of belongs to association  parent is new record", async () => {
    await repairValidations(Interest, async () => {
      Interest.validatesPresenceOf("human");
      const human = new Human({ name: "John" });
      const interest = association(human, "interests").build({ topic: "Airplanes" }) as Interest;
      expect(await interest.isValid()).toBe(true);
    });
  });

  it("validates presence of belongs to association  existing parent", async () => {
    await repairValidations(Interest, async () => {
      Interest.validatesPresenceOf("human");
      const human = await Human.createBang({ name: "John" });
      const interest = association(human, "interests").build({ topic: "Airplanes" }) as Interest;
      expect(await interest.isValid()).toBe(true);
    });
  });

  it("validates associated with custom context", async () => {
    Reply.validatesAssociated("topic", { on: "custom" });
    Topic.validatesPresenceOf("content", { on: "custom" });
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    r.topic = topic;
    expect(await r.isValid()).toBe(true);
    expect(await r.isValid("custom")).toBe(false);
    expect(r.errors.messagesFor("topic")).toEqual(["is invalid"]);
  });

  it("validates associated with create context", async () => {
    Reply.validatesAssociated("topic", { on: "create" });
    Topic.validatesPresenceOf("content", { on: "create" });
    const t = await Topic.create({ title: "uhoh", content: "stuff" });
    t.writeAttribute("content", null);
    expect(await t.save()).toBe(true);
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    r.topic = t;

    expect(await t.isValid()).toBe(true);
    expect(await r.isValid()).toBe(true);
  });
});
