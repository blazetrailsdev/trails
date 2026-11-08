import { describe, it, expect, afterEach } from "vitest";
import { Topic } from "../models/topic.js";

describe("exclusion allowNil", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("skips nil by default", async () => {
    Topic.validatesExclusionOf("title", { in: ["admin"] });

    expect(await new Topic({}).isValid()).toBe(true);
  });
});
