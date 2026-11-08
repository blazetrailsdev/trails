import { describe, it, expect, afterEach } from "vitest";
import { Topic } from "../test-helpers/models/topic.js";

describe("exclusion allowNil", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("skips nil by default", async () => {
    Topic.validatesExclusionOf("title", { in: ["admin"] });

    expect(await new Topic({}).isValid()).toBe(true);
  });
});
