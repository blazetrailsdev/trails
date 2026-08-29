/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach } from "vitest";
import { assertEmpty, assertPredicate, include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

class Topic extends Model {
  declare content: string | null;
  declare title: string | null;
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
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
interface Topic extends Attributes {}

describe("ConditionalValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("if validation using method true", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: ":conditionIsTrue",
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
      if: [":conditionIsTrue", ":conditionIsTrue"],
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
      unless: [":conditionIsFalse", ":conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("unless validation using method true", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: ":conditionIsTrue",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("if validation using array of true and false methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: [":conditionIsTrue", ":conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("unless validation using array of true and false methods", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: [":conditionIsTrue", ":conditionIsFalse"],
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("if validation using method false", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: ":conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("unless validation using method false", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      unless: ":conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("if validation using block true", async () => {
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
      if: ":conditionIsTrue",
      unless: ":conditionIsTrue",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);
    assertEmpty(t.errors.messagesFor("title"));
  });

  it("validation using combining if true and unless false conditions", async () => {
    Topic.validatesLengthOf("title", {
      maximum: 5,
      tooLong: "hoo %{count}",
      if: ":conditionIsTrue",
      unless: ":conditionIsFalse",
    });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });
});
