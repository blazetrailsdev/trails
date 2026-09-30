import { describe, it, afterEach } from "vitest";
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
