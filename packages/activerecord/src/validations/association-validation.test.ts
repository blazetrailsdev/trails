/**
 * Mirrors: activerecord/test/cases/validations/association_validation_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Rails uses `repair_validations(Topic, Reply)` to add validators to the
 * canonical models inside a test body and clear them afterward; we mirror that
 * with `clearValidatorsBang()` in `afterEach` (Topic, Reply, Interest) and
 * `repairValidations(...)` for the block-form cases.
 *
 * trails validations are synchronous, so where Rails appends in-memory
 * associated records (`t.replies << r`) we build them through the real
 * association (no insert on an unsaved/just-built target) or seed the
 * association cache — the behavior under test is the cascading `valid?`, not
 * collection persistence.
 */
import { afterEach, describe, expect, it, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { association } from "../associations.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { repairValidations } from "../test-helpers/repair-validations.js";
import { seedAssociationCache } from "../test-helpers/seed-association-cache.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Human } from "../test-helpers/models/human.js";
import { Interest } from "../test-helpers/models/interest.js";

describe("AssociationValidationTest", () => {
  // Rails `fixtures :topics` — needed by test_validates_associated_missing's
  // `Topic.first`. Loading the set also registers Topic/Reply (STI).
  useHandlerFixtures(["topics"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Reply", Reply);
    registerModel("Human", Human);
    registerModel("Interest", Interest);
  });

  // Rails `repair_validations(Topic, Reply)` — clear validators added to the
  // canonical models so per-test `validates_*` calls do not leak.
  afterEach(() => {
    Topic.clearValidatorsBang();
    Reply.clearValidatorsBang();
    Interest.clearValidatorsBang();
  });

  it("validates associated many", async () => {
    Topic.validatesAssociated("replies");
    Reply.validatesPresenceOf("content");
    const t = await Topic.create({ title: "uhohuhoh", content: "whatever" });
    // Rails `t.replies << [r, r2, r3, r4]`. On a persisted owner `<<` saves the
    // valid replies; the cascading `valid?` is what's under test, so we build
    // them in-memory through the real association instead.
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

    expect(t.isValid()).toBe(false);
    expect(t.errors.messagesFor("replies").length).toBeGreaterThan(0);
    expect(r.errors.count).toBe(1); // make sure all associated objects have been validated
    expect(r2.errors.count).toBe(0);
    expect(r3.errors.count).toBe(1);
    expect(r4.errors.count).toBe(0);
    r.writeAttribute("content", "non-empty");
    r3.writeAttribute("content", "non-empty");
    expect(t.isValid()).toBe(true);
  });

  it("validates associated one", async () => {
    // Rails `Reply.validates :topic, associated: true` — the `associated: true`
    // form registers the same AssociatedValidator as `validates_associated`.
    Reply.validatesAssociated("topic");
    Topic.validatesPresenceOf("content");
    const r = new Reply({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    seedAssociationCache(r, "topic", topic);
    expect(r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic").length).toBeGreaterThan(0);
    topic.writeAttribute("content", "non-empty");
    expect(r.isValid()).toBe(true);
  });

  it("validates associated marked for destruction", () => {
    Topic.validatesAssociated("replies");
    Reply.validatesPresenceOf("content");
    const t = new Topic();
    const reply = association(t, "replies").build() as Reply;
    expect(t.isInvalid()).toBe(true);
    reply.markForDestruction();
    expect(t.isValid()).toBe(true);
  });

  it("validates associated without marked for destruction", () => {
    // Rails defines an anonymous class whose `valid?` is always true and stubs
    // `t.replies` to return `[reply.new]`; we seed the same shape into the cache.
    const reply = { isValid: () => true };
    Topic.validatesAssociated("replies");
    const t = new Topic();
    seedAssociationCache(t, "replies", [reply]);
    expect(t.isValid()).toBe(true);
  });

  it("validates associated with custom message using quotes", async () => {
    Reply.validatesAssociated("topic", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    Topic.validatesPresenceOf("content");
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    seedAssociationCache(r, "topic", topic);
    expect(r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic")).toEqual([
      "This string contains 'single' and \"double\" quotes",
    ]);
  });

  it("validates associated missing", async () => {
    Reply.validatesPresenceOf("topic");
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    expect(r.isValid()).toBe(false);
    expect(r.errors.messagesFor("topic").length).toBeGreaterThan(0);

    seedAssociationCache(r, "topic", await Topic.first());
    expect(r.isValid()).toBe(true);
  });

  it("validates presence of belongs to association  parent is new record", async () => {
    // Note that Interest and Human have the :inverse_of option set
    await repairValidations(Interest, () => {
      Interest.validatesPresenceOf("human");
      const human = new Human({ name: "John" });
      const interest = association(human, "interests").build({ topic: "Airplanes" }) as Interest;
      expect(interest.isValid()).toBe(true);
    });
  });

  it("validates presence of belongs to association  existing parent", async () => {
    await repairValidations(Interest, async () => {
      Interest.validatesPresenceOf("human");
      const human = await Human.createBang({ name: "John" });
      const interest = association(human, "interests").build({ topic: "Airplanes" }) as Interest;
      expect(interest.isValid()).toBe(true);
    });
  });

  it("validates associated with custom context", async () => {
    Reply.validatesAssociated("topic", { on: "custom" });
    Topic.validatesPresenceOf("content", { on: "custom" });
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    const topic = await Topic.create({ title: "uhohuhoh" });
    seedAssociationCache(r, "topic", topic);
    expect(r.isValid()).toBe(true);
    expect(r.isValid("custom")).toBe(false);
    expect(r.errors.messagesFor("topic")).toEqual(["is invalid"]);
  });

  it("validates associated with create context", async () => {
    Reply.validatesAssociated("topic", { on: "create" });
    Topic.validatesPresenceOf("content", { on: "create" });
    const t = await Topic.create({ title: "uhoh", content: "stuff" });
    t.writeAttribute("content", null);
    expect(await t.save()).toBe(true); // update! succeeds: presence is validated on :create only
    const r = await Reply.create({ title: "A reply", content: "with content!" });
    // NOTE: Does not pass along :create context from reply to Topic validation.
    seedAssociationCache(r, "topic", t);

    expect(t.isValid()).toBe(true);
    expect(r.isValid()).toBe(true);
  });
});
