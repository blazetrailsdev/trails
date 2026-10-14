import { describe, it, expect, afterEach } from "vitest";

import { assertPredicate } from "@blazetrails/activesupport";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";
import { CustomReader } from "../test-helpers/models/custom-reader.js";

describe("PresenceValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
    Person.clearValidatorsBang();
    CustomReader.clearValidatorsBang();
  });

  it("validate presences", async () => {
    Topic.validatesPresenceOf("title", "content");

    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["can't be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["can't be blank"]);

    t.title = "something";
    t.content = "   ";

    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("content")).toEqual(["can't be blank"]);

    t.content = "like stuff";

    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("accepts array arguments", async () => {
    Topic.validatesPresenceOf(["title", "content"]);
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["can't be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["can't be blank"]);
  });

  it("validates acceptance of with custom error using quotes", async () => {
    Person.validatesPresenceOf("karma", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    const p = new Person();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma").at(-1)).toEqual(
      "This string contains 'single' and \"double\" quotes",
    );
  });

  it("validates presence of for ruby class", async () => {
    Person.validatesPresenceOf("karma");

    const p = new Person();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);

    expect(p.errors.messagesFor("karma")).toEqual(["can't be blank"]);

    p.karma = "Cold";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates presence of for ruby class with custom reader", async () => {
    CustomReader.validatesPresenceOf("karma");

    const p = new CustomReader();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);

    expect(p.errors.messagesFor("karma")).toEqual(["can't be blank"]);

    p.data["karma"] = "Cold";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates presence of with allow nil option", async () => {
    Topic.validatesPresenceOf("title", { allowNil: true });

    const t = new Topic({ title: "something" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["can't be blank"]);

    t.title = "  ";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["can't be blank"]);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates presence of with allow blank option", async () => {
    Topic.validatesPresenceOf("title", { allowBlank: true });

    const t = new Topic({ title: "something" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "  ";
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });
});
