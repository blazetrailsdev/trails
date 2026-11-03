import { describe, expect, it } from "vitest";
import { GeneratorError } from "../../../../generated-attribute.js";
import { ChangeGenerator } from "./change-generator.js";

describe("ChangeGenerator", () => {
  it("raises GeneratorError for an invalid --to option", () => {
    expect(() => new ChangeGenerator([], { to: "invalid-db" })).toThrow(GeneratorError);
  });
});
