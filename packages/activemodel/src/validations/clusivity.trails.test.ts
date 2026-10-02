import { describe, it, afterEach, expect } from "vitest";
import { assertNothingRaised, assertRaise } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../attribute-assignment.js";
import { Topic } from "../test-helpers/models/topic.js";
import { ERROR_MESSAGE } from "./clusivity.js";

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
