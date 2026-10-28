import { capture } from "@blazetrails/activesupport";
import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers } from "./model-helpers.js";
import { ResourceGenerator } from "./rails/resource/resource-generator.js";
import type { ResourceGeneratorOptions } from "./rails/resource/resource-generator.js";
import { ScaffoldGenerator } from "./test-unit/scaffold/scaffold-generator.js";

const build = (name: string, modelName?: string) =>
  new ResourceGenerator({
    cwd: "/nonexistent",
    name,
    modelName,
  } as ResourceGeneratorOptions);

describe("applyResourceHelpers", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("pluralizes into controller helpers and honors modelName override", () => {
    const i = build("admin/post");
    expect([i.controllerName, i.controllerClassPath(), i.controllerFileName]).toEqual([
      "admin/posts",
      ["admin"],
      "posts",
    ]);
    expect(i.controllerFilePath()).toBe("admin/posts");
    expect(i.controllerClassName()).toBe("Admin::Posts");
    expect(i.controllerI18nScope()).toBe("admin.posts");

    const j = build("posts", "Article");
    expect([j.name, j.controllerName]).toEqual(["Article", "posts"]);

    const k = build("admin::post");
    expect(k.controllerFilePath()).toBe("admin/posts");
  });

  it("does not re-run plural warn on modelName override", async () => {
    const output = await capture("stdout", () => build("posts", "comments"));
    expect(output.match(/recognized as a plural/g)).toHaveLength(1);
  });

  it("ormClass raises without an :orm class option", () => {
    const i = new ScaffoldGenerator({ cwd: "/nonexistent", name: "post" });
    expect(() => i.ormClass()).toThrow(
      "You need to have :orm as class option to invoke orm_class and orm_instance",
    );
  });
});
