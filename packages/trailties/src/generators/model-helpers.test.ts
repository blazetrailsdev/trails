import { capture } from "@blazetrails/activesupport";
import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers } from "./model-helpers.js";
import { GeneratorError } from "./generated-attribute.js";
import { ModelGenerator, type ModelGeneratorOptions } from "./rails/model/model-generator.js";

const build = (name: string, forcePlural?: boolean) =>
  new ModelGenerator({ cwd: "/nonexistent", name, forcePlural } as ModelGeneratorOptions);

describe("normalizeModelName", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("singularizes plurals and warns once, honors forcePlural, suppresses subsequent warns", async () => {
    const messages = await capture("stdout", () => expect(build("posts").name).toBe("post"));
    expect(messages).toContain("'posts' was recognized as a plural");
    expect(ModelHelpers.skipWarn).toBe(true);

    const more = await capture("stdout", () => expect(build("comments").name).toBe("comment"));
    expect(more).toBe("");

    ModelHelpers.skipWarn = false;
    expect(build("posts", true).name).toBe("posts");
  });

  it("raises GeneratorError on inflection-impossible names", () => {
    expect(() => build("WIFI")).toThrow(GeneratorError);
  });
});
