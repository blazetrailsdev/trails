import { describe, it, expect, afterEach } from "vitest";
import { assert, assertPredicate, Duration } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";

describe("ExclusionValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("validates exclusion of", async () => {
    Topic.validatesExclusionOf("title", { in: ["abe", "monkey"] });

    assertPredicate(await new Topic({ title: "something", content: "abc" }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "monkey", content: "abc" }).isInvalid(), (v) => v);
  });

  it("validates exclusion of with formatted message", async () => {
    Topic.validatesExclusionOf("title", {
      in: ["abe", "monkey"],
      message: "option %{value} is restricted",
    });

    assert(new Topic({ title: "something", content: "abc" }));

    const t = new Topic({ title: "monkey" });
    assertPredicate(await t.isInvalid(), (v) => v);
    assertPredicate(t.errors.get("title"), (e) => e.length > 0);
    expect(t.errors.get("title")).toEqual(["option monkey is restricted"]);
  });

  it("validates exclusion of with within option", async () => {
    Topic.validatesExclusionOf("title", { within: ["abe", "monkey"] });

    assert(new Topic({ title: "something", content: "abc" }));

    const t = new Topic({ title: "monkey" });
    assertPredicate(await t.isInvalid(), (v) => v);
    assertPredicate(t.errors.get("title"), (e) => e.length > 0);
  });

  it("validates exclusion of for ruby class", async () => {
    try {
      Person.validatesExclusionOf("karma", { in: ["abe", "monkey"] });

      const p = new Person();
      p.karma = "abe";
      assertPredicate(await p.isInvalid(), (v) => v);

      expect(p.errors.get("karma")).toEqual(["is reserved"]);

      p.karma = "Lifo";
      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("validates exclusion of with lambda", async () => {
    Topic.validatesExclusionOf("title", {
      in: (topic: Topic) =>
        topic.authorName === "sikachu" ? ["monkey", "elephant"] : ["abe", "wasabi"],
    });

    const t = new Topic();
    t.title = "elephant";
    t.authorName = "sikachu";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "wasabi";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates exclusion of with lambda without arguments", async () => {
    Topic.validatesExclusionOf("title", { in: () => ["monkey", "elephant"] });

    const t = new Topic();
    t.title = "monkey";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "wasabi";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates exclusion of with range", async () => {
    Topic.validatesExclusionOf("content", { in: new Range("a", "g") });

    assertPredicate(await new Topic({ content: "g" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ content: "h" }).isValid(), (v) => v);
  });

  it("validates exclusion of beginless numeric range", async () => {
    const rangeEnd = 1000;
    Topic.validatesExclusionOf("rawPrice", { in: new Range(null, rangeEnd) });
    assertPredicate(await new Topic({ title: "aaa", price: -100 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 0 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 100 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 2000 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: rangeEnd }).isInvalid(), (v) => v);
  });

  it("validates exclusion of endless numeric range", async () => {
    const rangeBegin = 0;
    Topic.validatesExclusionOf("rawPrice", { in: new Range(rangeBegin, null) });
    assertPredicate(await new Topic({ title: "aaa", price: -1 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: -100 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 100 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 2000 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: rangeBegin }).isInvalid(), (v) => v);
  });

  it("validates exclusion of with time range", async () => {
    Topic.validatesExclusionOf("createdAt", {
      in: new Range(Duration.days(6).ago(), Duration.days(2).ago()),
    });

    assertPredicate(await new Topic({ createdAt: Duration.days(5).ago() }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ createdAt: Duration.days(3).ago() }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ createdAt: Duration.days(7).ago() }).isValid(), (v) => v);
    assertPredicate(await new Topic({ createdAt: Duration.days(1).ago() }).isValid(), (v) => v);
  });

  it("validates inclusion of with symbol", async () => {
    try {
      Person.validatesExclusionOf("karma", { in: ":reservedKarmas" });

      let p = new Person();
      p.karma = "abe";

      Object.assign(p, { reservedKarmas: () => ["abe"] });

      assertPredicate(await p.isInvalid(), (v) => v);
      expect(p.errors.get("karma")).toEqual(["is reserved"]);

      p = new Person();
      p.karma = "abe";

      Object.assign(p, { reservedKarmas: () => [] });

      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });
});
