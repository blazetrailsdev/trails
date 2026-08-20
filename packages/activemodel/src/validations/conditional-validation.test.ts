import { describe, it, expect, afterEach } from "vitest";
import { assertEmpty, assertPredicate } from "@blazetrails/activesupport";
import { Model } from "../index.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("content", "string");
  }

  conditionIsTrue(): boolean {
    return true;
  }

  conditionIsFalse(): boolean {
    return false;
  }
}

describe("ConditionalValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("if validation using method true", async () => {
    // When the method returns true
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: "conditionIsTrue",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("if validation using array of true methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: ["conditionIsTrue", "conditionIsTrue"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("unless validation using array of false methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: ["conditionIsFalse", "conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("unless validation using method true", async () => {
    // When the method returns true
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: "conditionIsTrue",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("if validation using array of true and false methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: ["conditionIsTrue", "conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("unless validation using array of true and false methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: ["conditionIsTrue", "conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("if validation using method false", async () => {
    // When the method returns false
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: "conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("unless validation using method false", async () => {
    // When the method returns false
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: "conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("if validation using block true", async () => {
    // When the block returns true
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: (r: Topic) => (r.content as string).length > 4,
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("unless validation using block true", async () => {
    // When the block returns true
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: (r: Topic) => (r.content as string).length > 4,
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("if validation using block false", async () => {
    // When the block returns false
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: (r: Topic) => r.title !== "uhohuhoh",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("unless validation using block false", async () => {
    // When the block returns false
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: (r: Topic) => r.title !== "uhohuhoh",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("validation using combining if true and unless true conditions", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: "conditionIsTrue",
      unless: "conditionIsTrue",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("validation using combining if true and unless false conditions", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: "conditionIsTrue",
      unless: "conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });
});
