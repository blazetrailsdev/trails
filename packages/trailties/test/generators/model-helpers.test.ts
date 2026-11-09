import { capture } from "@blazetrails/activesupport/testing/stream";
import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers } from "../../lib/generators/model-helpers.js";
import { Error } from "../../lib/generators/base.js";
import {
  ModelGenerator,
  type ModelGeneratorOptions,
} from "../../lib/generators/trails/model/model-generator.js";

const build = (name: string, forcePlural?: boolean) =>
  new ModelGenerator([name], { forcePlural } as ModelGeneratorOptions, {
    destinationRoot: "/nonexistent",
  });

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
    expect(() => build("WIFI")).toThrow(Error);
  });
});
