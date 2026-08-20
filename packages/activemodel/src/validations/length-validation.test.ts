import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate, assertNothingRaised, Range } from "@blazetrails/activesupport";
import { ArgumentError } from "../attribute-assignment.js";
import { Model } from "../index.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("authorName", "string");
    this.attribute("content", "string");
    this.attribute("approved", "integer");
  }

  private five(): number {
    return 5;
  }
}

// Mirrors: activemodel/test/models/person.rb — the subset this file exercises.
class Person extends Model {
  static {
    this.attribute("karma", "string");
  }
}

describe("LengthValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("validates length of with allow nil", async () => {
    Topic.validatesLengthOf("title", { is: 5, allowNil: true });

    assertPredicate(await new Topic({ title: "ab" }).isInvalid(), (invalid) => invalid);
    assertPredicate(await new Topic({ title: "" }).isInvalid(), (invalid) => invalid);
    assertPredicate(await new Topic({ title: null }).isValid(), (valid) => valid);
    assertPredicate(await new Topic({ title: "abcde" }).isValid(), (valid) => valid);
  });

  it("validates length of with allow blank", async () => {
    Topic.validatesLengthOf("title", { is: 5, allowBlank: true });

    assertPredicate(await new Topic({ title: "ab" }).isInvalid(), (invalid) => invalid);
    assertPredicate(await new Topic({ title: "" }).isValid(), (valid) => valid);
    assertPredicate(await new Topic({ title: null }).isValid(), (valid) => valid);
    assertPredicate(await new Topic({ title: "abcde" }).isValid(), (valid) => valid);
  });

  it("validates length of using minimum", async () => {
    Topic.validatesLengthOf("title", { minimum: 5 });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "not";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 5 characters)"]);

    t.title = null;
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 5 characters)"]);
  });

  it("validates length of using maximum should allow nil", async () => {
    Topic.validatesLengthOf("title", { maximum: 10 });
    const t = new Topic();
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("optionally validates length of using minimum", async () => {
    Topic.validatesLengthOf("title", { minimum: 5, allowNil: true });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using maximum", async () => {
    Topic.validatesLengthOf("title", { maximum: 5 });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("optionally validates length of using maximum", async () => {
    Topic.validatesLengthOf("title", { maximum: 5, allowNil: true });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using within", async () => {
    Topic.validatesLengthOf("title", "content", { within: new Range(3, 5) });

    const t = new Topic({ title: "a!", content: "I'm ooooooooh so very long" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 3 characters)"]);
    expect(t.errors.messagesFor("content")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = null;
    t.content = null;
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 3 characters)"]);
    expect(t.errors.messagesFor("content")).toEqual(["is too short (minimum is 3 characters)"]);

    t.title = "abe";
    t.content = "mad";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using within with exclusive range", async () => {
    Topic.validatesLengthOf("title", { within: new Range(4, 10, true) });

    const t = new Topic({ title: "9 chars!!" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "Now I'm 10";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 9 characters)"]);

    t.title = "Four";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using within with infinite ranges", async () => {
    const cases: Array<[Range<number>, number | null]> = [
      [new Range(-Infinity, 10), 11],
      [new Range(-Infinity, 11, true), 11],
      [new Range(-Infinity, null), null],
      [new Range(10, Infinity), 9],
      [new Range(10, Infinity, true), 9],
      [new Range(10, null), 9],
      [new Range(null, 10), 11],
      [new Range(null, 11, true), 11],
      [new Range(-Infinity, Infinity), null],
    ];
    for (const [range, invalidLength] of cases) {
      Topic.clearValidatorsBang();
      Topic.validatesLengthOf("title", { within: range });

      const t = new Topic({ title: "a".repeat(10) });
      assertPredicate(await t.isValid(), (valid) => valid);

      if (invalidLength != null) {
        t.title = "a".repeat(invalidLength);
        assertPredicate(await t.isInvalid(), (invalid) => invalid);
      }
    }
  });

  it("optionally validates length of using within", async () => {
    Topic.validatesLengthOf("title", "content", {
      within: new Range(3, 5),
      allowNil: true,
    });

    const t = new Topic({ title: "abc", content: "abcd" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using is", async () => {
    Topic.validatesLengthOf("title", { is: 5 });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is the wrong length (should be 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.title = null;
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("optionally validates length of using is", async () => {
    Topic.validatesLengthOf("title", { is: 5, allowNil: true });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using bignum", async () => {
    const bigmin = 2 ** 30;
    const bigmax = 2 ** 32;
    const bigrange = new Range(bigmin, bigmax, true);
    await assertNothingRaised(() => {
      Topic.validatesLengthOf("title", { is: bigmin + 5 });
      Topic.validatesLengthOf("title", { within: bigrange });
      Topic.validatesLengthOf("title", { in: bigrange });
      Topic.validatesLengthOf("title", { minimum: bigmin });
      Topic.validatesLengthOf("title", { maximum: bigmax });
    });
  });

  it("validates length of nasty params", () => {
    expect(() => Topic.validatesLengthOf("title", { is: -6 })).toThrow(ArgumentError);
    expect(() => Topic.validatesLengthOf("title", { within: 6 })).toThrow(ArgumentError);
    expect(() => Topic.validatesLengthOf("title", { minimum: "a" })).toThrow(ArgumentError);
    expect(() => Topic.validatesLengthOf("title", { maximum: "a" })).toThrow(ArgumentError);
    expect(() => Topic.validatesLengthOf("title", { within: "a" })).toThrow(ArgumentError);
    expect(() => Topic.validatesLengthOf("title", { is: "a" })).toThrow(ArgumentError);
  });

  it("validates length of custom errors for minimum with message", async () => {
    Topic.validatesLengthOf("title", { minimum: 5, message: "boo %{count}" });
    const t = new Topic({ title: "uhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["boo 5"]);
  });

  it("validates length of custom errors for minimum with too short", async () => {
    Topic.validatesLengthOf("title", { minimum: 5, tooShort: "hoo %{count}" });
    const t = new Topic({ title: "uhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("validates length of custom errors for maximum with message", async () => {
    Topic.validatesLengthOf("title", { maximum: 5, message: "boo %{count}" });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["boo 5"]);
  });

  it("validates length of custom errors for in", async () => {
    Topic.validatesLengthOf("title", { in: new Range(10, 20), message: "hoo %{count}" });
    let t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 10"]);

    t = new Topic({ title: "uhohuhohuhohuhohuhohuhohuhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 20"]);
  });

  it("validates length of custom errors for maximum with too long", async () => {
    Topic.validatesLengthOf("title", { maximum: 5, tooLong: "hoo %{count}" });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("validates length of custom errors for both too short and too long", async () => {
    Topic.validatesLengthOf("title", {
      minimum: 3,
      maximum: 5,
      tooShort: "too short",
      tooLong: "too long",
    });

    let t = new Topic({ title: "a" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["too short"]);

    t = new Topic({ title: "aaaaaa" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["too long"]);
  });

  it("validates length of custom errors for is with message", async () => {
    Topic.validatesLengthOf("title", { is: 5, message: "boo %{count}" });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["boo 5"]);
  });

  it("validates length of custom errors for is with wrong length", async () => {
    Topic.validatesLengthOf("title", { is: 5, wrongLength: "hoo %{count}" });
    const t = new Topic({ title: "uhohuhoh", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["hoo 5"]);
  });

  it("validates length of using minimum utf8", async () => {
    Topic.validatesLengthOf("title", { minimum: 5 });

    const t = new Topic({ title: "一二三四五", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "一二三四";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 5 characters)"]);
  });

  it("validates length of using maximum utf8", async () => {
    Topic.validatesLengthOf("title", { maximum: 5 });

    const t = new Topic({ title: "一二三四五", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "一二34五六";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);
  });

  it("validates length of using within utf8", async () => {
    Topic.validatesLengthOf("title", "content", { within: new Range(3, 5) });

    const t = new Topic({ title: "一二", content: "12三四五六七" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["is too short (minimum is 3 characters)"]);
    expect(t.errors.messagesFor("content")).toEqual(["is too long (maximum is 5 characters)"]);
    t.title = "一二三";
    t.content = "12三";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("optionally validates length of using within utf8", async () => {
    Topic.validatesLengthOf("title", { within: new Range(3, 5), allowNil: true });

    let t = new Topic({ title: "一二三四五" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t = new Topic({ title: "一二三" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using is utf8", async () => {
    Topic.validatesLengthOf("title", { is: 5 });

    const t = new Topic({ title: "一二345", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "一二345六";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is the wrong length (should be 5 characters)"]);
  });

  it("validates length of for integer", async () => {
    Topic.validatesLengthOf("approved", { is: 4 });

    let t = new Topic({ title: "uhohuhoh", content: "whatever", approved: 1 });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("approved"), (errors) => errors.length > 0);

    t = new Topic({ title: "uhohuhoh", content: "whatever", approved: 1234 });
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of for ruby class", async () => {
    try {
      Person.validatesLengthOf("karma", { minimum: 5 });

      const p = new Person();
      p.karma = "Pix";
      assertPredicate(await p.isInvalid(), (invalid) => invalid);

      expect(p.errors.messagesFor("karma")).toEqual(["is too short (minimum is 5 characters)"]);

      p.karma = "The Smiths";
      assertPredicate(await p.isValid(), (valid) => valid);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("validates length of for infinite maxima", async () => {
    Topic.validatesLengthOf("title", { within: new Range(5, Infinity) });

    const t = new Topic({ title: "1234" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);

    t.title = "12345";
    assertPredicate(await t.isValid(), (valid) => valid);

    Topic.validatesLengthOf("authorName", { maximum: Infinity });

    assertPredicate(await t.isValid(), (valid) => valid);

    t.authorName = "A very long author name that should still be valid.".repeat(100);
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using maximum should not allow nil when nil not allowed", async () => {
    Topic.validatesLengthOf("title", { maximum: 10, allowNil: false });
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("validates length of using maximum should not allow nil and empty string when blank not allowed", async () => {
    Topic.validatesLengthOf("title", { maximum: 10, allowBlank: false });
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.title = "";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("validates length of using both minimum and maximum should not allow nil", async () => {
    Topic.validatesLengthOf("title", { minimum: 5, maximum: 10 });
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("validates length of using minimum 0 should not allow nil", async () => {
    Topic.validatesLengthOf("title", { minimum: 0 });
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using is 0 should not allow nil", async () => {
    Topic.validatesLengthOf("title", { is: 0 });
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates with diff in option", async () => {
    Topic.validatesLengthOf("title", { is: 5 });
    Topic.validatesLengthOf("title", { is: 5, if: () => false });

    assertPredicate(await new Topic({ title: "david" }).isValid(), (valid) => valid);
    assertPredicate(await new Topic({ title: "david2" }).isInvalid(), (invalid) => invalid);
  });

  it("validates length of using symbol as maximum", async () => {
    Topic.validatesLengthOf("title", { maximum: ":five" });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using proc as maximum", async () => {
    Topic.validatesLengthOf("title", { maximum: (_model: Topic) => 5 });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using proc as maximum with model method", async () => {
    // Rails writes `Topic.define_method(:max_title_length) { 5 }`; JS has no
    // define_method, so the method goes onto the prototype directly.
    (Topic.prototype as unknown as Record<string, unknown>)["maxTitleLength"] = () => 5;
    Topic.validatesLengthOf("title", {
      maximum: (model: Topic) =>
        (model as unknown as { maxTitleLength(): number }).maxTitleLength(),
    });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates length of using lambda as maximum", async () => {
    Topic.validatesLengthOf("title", { maximum: () => 5 });

    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "notvalid";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (errors) => errors.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["is too long (maximum is 5 characters)"]);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });
});
