import { describe, it, afterEach, expect } from "vitest";
import { assertNothingRaised, assertRaise } from "@blazetrails/activesupport";
import { BigDecimal, Range, Rational } from "@blazetrails/ruby-compat";
import { Date as RubyDate, DateTime as RubyDateTime, Time as RubyTime } from "@blazetrails/date";
import { ArgumentError } from "../attribute-assignment.js";
import { Topic } from "../test-helpers/models/topic.js";
import { ERROR_MESSAGE, inclusionMethod } from "./clusivity.js";

describe("Clusivity#check_validity!", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("accepts a delimiter answering include?, call or to_sym", async () => {
    for (const delimiter of [
      new Range(1, 3),
      new Set(["a"]),
      new Map([["a", 1]]),
      () => ["a"],
      ":titles",
    ]) {
      await assertNothingRaised(() => Topic.validatesInclusionOf("title", { in: delimiter }));
    }
  });

  it("raises ArgumentError for a delimiter answering none of them", async () => {
    for (const delimiter of [undefined, 1, true]) {
      await assertRaise([ArgumentError], { match: ERROR_MESSAGE }, () =>
        Topic.validatesInclusionOf("title", { in: delimiter }),
      );
    }
  });
});

describe("Clusivity#include?", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("public_sends include? to a delimiter that only defines it", async () => {
    const asked: unknown[] = [];
    const delimiter = {
      isInclude(value: unknown): boolean {
        asked.push(value);
        return value === "ruby";
      },
    };
    Topic.validatesInclusionOf("title", { in: delimiter });

    expect(await new Topic({ title: "ruby" }).isValid()).toBe(true);
    expect(await new Topic({ title: "java" }).isValid()).toBe(false);
    expect(asked).toEqual(["ruby", "java"]);
  });

  it("raises NoMethodError when the delimiter resolves to nil", async () => {
    Topic.validatesInclusionOf("title", { in: () => null });

    await expect(new Topic({ title: "ruby" }).isValid()).rejects.toThrow(
      "undefined method 'include?' for nil",
    );
  });

  it("asks a core String, Array, Set and Hash delimiter", async () => {
    for (const delimiter of ["rubyist", ["ruby"], new Set(["ruby"]), new Map([["ruby", 1]])]) {
      Topic.clearValidatorsBang();
      Topic.validatesInclusionOf("title", { in: delimiter });

      expect(await new Topic({ title: "ruby" }).isValid()).toBe(true);
      expect(await new Topic({ title: "java" }).isValid()).toBe(false);
    }
  });
});

describe("Clusivity#inclusion_method", () => {
  it("selects cover? for a Range of Numeric, Time, DateTime or Date endpoints", () => {
    for (const [first, last] of [
      [1, 3],
      [1.5, 3.5],
      [1n, 3n],
      [new Rational(1, 2), new Rational(3, 2)],
      [new BigDecimal("1.1"), new BigDecimal("3.3")],
      [RubyTime.utc(2024, 1, 1), RubyTime.utc(2024, 1, 3)],
      [RubyDateTime.parse("2024-01-01T00:00:00"), RubyDateTime.parse("2024-01-03T00:00:00")],
      [RubyDate.parse("2024-01-01"), RubyDate.parse("2024-01-03")],
    ] as Array<[unknown, unknown]>) {
      expect(inclusionMethod(new Range<unknown>(first, last))).toBe("cover");
    }
  });

  it("reads the end of a beginless Range", () => {
    expect(inclusionMethod(new Range<unknown>(null, 3))).toBe("cover");
    expect(inclusionMethod(new Range<unknown>(null, "c"))).toBe("isInclude");
  });

  it("still covers a JS Date Range, which Range#include? answers by cover?", async () => {
    const delimiter = new Range(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2024, 11, 31)));
    expect(inclusionMethod(delimiter)).toBe("isInclude");
    Topic.validatesInclusionOf("title", { in: delimiter });

    expect(await new Topic({ title: new Date(Date.UTC(2024, 5, 1)) }).isValid()).toBe(true);
    expect(await new Topic({ title: new Date(Date.UTC(2025, 5, 1)) }).isValid()).toBe(false);
    Topic.clearValidatorsBang();
  });

  it("selects include? for a String Range and for a non-Range", () => {
    expect(inclusionMethod(new Range("a", "c"))).toBe("isInclude");
    expect(inclusionMethod([1, 2, 3])).toBe("isInclude");
  });
});
