import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers } from "./model-helpers.js";
import { GeneratorError } from "./generated-attribute.js";
import { ModelGenerator, type ModelGeneratorOptions } from "./rails/model/model-generator.js";

const build = (name: string, output: (m: string) => void = () => {}, forcePlural?: boolean) =>
  new ModelGenerator({ cwd: "/nonexistent", output, name, forcePlural } as ModelGeneratorOptions);

describe("normalizeModelName", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("singularizes plurals and warns once, honors forcePlural, suppresses subsequent warns", () => {
    const messages: string[] = [];
    expect(build("posts", (m) => messages.push(m)).name).toBe("post");
    expect(messages[0]).toContain("'posts' was recognized as a plural");
    expect(ModelHelpers.skipWarn).toBe(true);

    const more: string[] = [];
    expect(build("comments", (m) => more.push(m)).name).toBe("comment");
    expect(more).toEqual([]);

    ModelHelpers.skipWarn = false;
    expect(build("posts", undefined, true).name).toBe("posts");
  });

  it("raises GeneratorError on inflection-impossible names", () => {
    expect(() => build("WIFI")).toThrow(GeneratorError);
  });
});
