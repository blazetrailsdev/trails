import { describe, it, expect, afterEach } from "vitest";
import {
  Duration,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
} from "@blazetrails/activesupport";
import { current as dateTimeCurrent } from "@blazetrails/activesupport/core-ext/date-time/calculations";
import { Date, Time } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../attribute-assignment.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";

describe("InclusionValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("validates inclusion of range", async () => {
    Topic.validatesInclusionOf("title", { in: new Range("aaa", "bbb") });
    assertPredicate(await new Topic({ title: "bbc", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aa", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaab", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", content: "abc" }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "abc", content: "abc" }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "bbb", content: "abc" }).isValid(), (v) => v);
  });

  it("validates inclusion of time range", async () => {
    const rangeBegin = Duration.years(1).ago();
    const rangeEnd = Time.now();
    Topic.validatesInclusionOf("createdAt", { in: new Range(rangeBegin, rangeEnd) });
    const t = (createdAt: unknown) => new Topic({ title: "aaa", createdAt });
    assertPredicate(await t(Duration.years(2).ago()).isInvalid(), (v) => v);
    assertPredicate(await t(Duration.months(3).ago()).isValid(), (v) => v);
    assertPredicate(await t(Duration.weeks(37).fromNow()).isInvalid(), (v) => v);
    assertPredicate(await t(rangeBegin).isValid(), (v) => v);
    assertPredicate(await t(rangeEnd).isValid(), (v) => v);
  });

  it("validates inclusion of date range", async () => {
    const rangeBegin = Duration.years(1).until(Date.today());
    const rangeEnd = Date.today();
    Topic.validatesInclusionOf("createdAt", { in: new Range(rangeBegin, rangeEnd) });
    const t = (createdAt: unknown) => new Topic({ title: "aaa", createdAt });
    assertPredicate(await t(Duration.years(2).until(Date.today())).isInvalid(), (v) => v);
    assertPredicate(await t(Duration.months(3).until(Date.today())).isValid(), (v) => v);
    assertPredicate(await t(Duration.weeks(37).since(Date.today())).isInvalid(), (v) => v);
    assertPredicate(await t(Duration.years(1).until(Date.today())).isValid(), (v) => v);
    assertPredicate(await t(Date.today()).isValid(), (v) => v);
    assertPredicate(await t(rangeBegin).isValid(), (v) => v);
    assertPredicate(await t(rangeEnd).isValid(), (v) => v);
  });

  it("validates inclusion of date time range", async () => {
    const rangeBegin = Duration.years(1).until(dateTimeCurrent() as never);
    const rangeEnd = dateTimeCurrent();
    Topic.validatesInclusionOf("createdAt", { in: new Range<unknown>(rangeBegin, rangeEnd) });
    const t = (createdAt: unknown) => new Topic({ title: "aaa", createdAt });
    assertPredicate(
      await t(Duration.years(2).until(dateTimeCurrent() as never)).isInvalid(),
      (v) => v,
    );
    assertPredicate(
      await t(Duration.months(3).until(dateTimeCurrent() as never)).isValid(),
      (v) => v,
    );
    assertPredicate(
      await t(Duration.weeks(37).since(dateTimeCurrent() as never)).isInvalid(),
      (v) => v,
    );
    assertPredicate(await t(rangeBegin).isValid(), (v) => v);
    assertPredicate(await t(rangeEnd).isValid(), (v) => v);
  });

  it("validates inclusion of beginless numeric range", async () => {
    const rangeEnd = 1000;
    Topic.validatesInclusionOf("rawPrice", { in: new Range(null, rangeEnd) });
    assertPredicate(await new Topic({ title: "aaa", price: -100 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 0 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 100 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 2000 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: rangeEnd }).isValid(), (v) => v);
  });

  it("validates inclusion of endless numeric range", async () => {
    const rangeBegin = 0;
    Topic.validatesInclusionOf("rawPrice", { in: new Range(rangeBegin, null) });
    assertPredicate(await new Topic({ title: "aaa", price: -1 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: -100 }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 100 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: 2000 }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "aaa", price: rangeBegin }).isValid(), (v) => v);
  });

  it("validates inclusion of", async () => {
    Topic.validatesInclusionOf("title", { in: ["a", "b", "c", "d", "e", "f", "g"] });

    assertPredicate(await new Topic({ title: "a!", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "a b", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: null, content: "def" }).isInvalid(), (v) => v);

    const t = new Topic({ title: "a", content: "I know you are but what am I?" });
    assertPredicate(await t.isValid(), (v) => v);
    t.title = "uhoh";
    assertPredicate(await t.isInvalid(), (v) => v);
    assertPredicate(t.errors.get("title"), (e) => e.length > 0);
    expect(t.errors.get("title")).toEqual(["is not included in the list"]);

    await assertRaise([ArgumentError], {}, () => Topic.validatesInclusionOf("title", { in: null }));
    await assertRaise([ArgumentError], {}, () => Topic.validatesInclusionOf("title", { in: 0 }));

    await assertNothingRaised(() => Topic.validatesInclusionOf("title", { in: "hi!" }));
    await assertNothingRaised(() => Topic.validatesInclusionOf("title", { in: new Map() }));
    await assertNothingRaised(() => Topic.validatesInclusionOf("title", { in: [] }));
  });

  it("validates inclusion of with allow nil", async () => {
    Topic.validatesInclusionOf("title", {
      in: ["a", "b", "c", "d", "e", "f", "g"],
      allowNil: true,
    });

    assertPredicate(await new Topic({ title: "a!", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "", content: "abc" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: null, content: "abc" }).isValid(), (v) => v);
  });

  it("validates inclusion of with formatted message", async () => {
    Topic.validatesInclusionOf("title", {
      in: ["a", "b", "c", "d", "e", "f", "g"],
      message: "option %{value} is not in the list",
    });

    assertPredicate(await new Topic({ title: "a", content: "abc" }).isValid(), (v) => v);

    const t = new Topic({ title: "uhoh", content: "abc" });
    assertPredicate(await t.isInvalid(), (v) => v);
    assertPredicate(t.errors.get("title"), (e) => e.length > 0);
    expect(t.errors.get("title")).toEqual(["option uhoh is not in the list"]);
  });

  it("validates inclusion of with within option", async () => {
    Topic.validatesInclusionOf("title", { within: ["a", "b", "c", "d", "e", "f", "g"] });

    assertPredicate(await new Topic({ title: "a", content: "abc" }).isValid(), (v) => v);

    const t = new Topic({ title: "uhoh", content: "abc" });
    assertPredicate(await t.isInvalid(), (v) => v);
    assertPredicate(t.errors.get("title"), (e) => e.length > 0);
  });

  it("validates inclusion of for ruby class", async () => {
    try {
      Person.validatesInclusionOf("karma", { in: ["abe", "monkey"] });

      const p = new Person();
      p.karma = "Lifo";
      assertPredicate(await p.isInvalid(), (v) => v);

      expect(p.errors.get("karma")).toEqual(["is not included in the list"]);

      p.karma = "monkey";
      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("validates inclusion of with lambda", async () => {
    Topic.validatesInclusionOf("title", {
      in: (topic: Topic) =>
        topic.authorName === "sikachu" ? ["monkey", "elephant"] : ["abe", "wasabi"],
    });

    const t = new Topic();
    t.title = "wasabi";
    t.authorName = "sikachu";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "elephant";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates inclusion of with lambda without arguments", async () => {
    Topic.validatesInclusionOf("title", { in: () => ["monkey", "elephant"] });

    const t = new Topic();
    t.title = "wasabi";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "elephant";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates inclusion of with symbol", async () => {
    try {
      Person.validatesInclusionOf("karma", { in: ":availableKarmas" });

      let p = new Person();
      p.karma = "Lifo";

      Object.assign(p, { availableKarmas: () => [] });

      assertPredicate(await p.isInvalid(), (v) => v);
      expect(p.errors.get("karma")).toEqual(["is not included in the list"]);

      p = new Person();
      p.karma = "Lifo";

      Object.assign(p, { availableKarmas: () => ["Lifo"] });

      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("validates inclusion of with array value", async () => {
    try {
      Person.validatesInclusionOf("karma", { in: ["abe", "monkey"] });

      let p = new Person();
      (p as { karma: unknown }).karma = ["Lifo", "monkey"];

      assertPredicate(await p.isInvalid(), (v) => v);
      expect(p.errors.get("karma")).toEqual(["is not included in the list"]);

      p = new Person();
      (p as { karma: unknown }).karma = ["abe", "monkey"];

      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });
});
