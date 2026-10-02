import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";
import { CustomReader } from "../test-helpers/models/custom-reader.js";

describe("AbsenceValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
    Person.clearValidatorsBang();
    CustomReader.clearValidatorsBang();
  });

  it("validates absence of", async () => {
    Topic.validatesAbsenceOf("title", "content");
    const t = new Topic();
    t.title = "foo";
    t.content = "bar";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
    t.title = "";
    t.content = "something";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("title")).toEqual([]);
    t.content = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates absence of with array arguments", async () => {
    Topic.validatesAbsenceOf(["title", "content"]);
    const t = new Topic();
    t.title = "foo";
    t.content = "bar";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
  });

  it("validates absence of with custom error using quotes", async () => {
    Person.validatesAbsenceOf("karma", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma").at(-1)).toEqual(
      "This string contains 'single' and \"double\" quotes",
    );
  });

  it("validates absence of for ruby class", async () => {
    Person.validatesAbsenceOf("karma");
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma")).toEqual(["must be blank"]);
    p.karma = null;
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates absence of for ruby class with custom reader", async () => {
    CustomReader.validatesAbsenceOf("karma");
    const p = new CustomReader();
    p.data["karma"] = "excellent";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma")).toEqual(["must be blank"]);
    p.data["karma"] = "";
    assertPredicate(await p.isValid(), (valid) => valid);
  });
});
