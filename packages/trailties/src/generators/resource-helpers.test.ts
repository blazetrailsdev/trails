import { describe, it, expect, beforeEach } from "vitest";
import { ModelHelpers } from "./model-helpers.js";
import { ResourceGenerator } from "./rails/resource/resource-generator.js";

const build = (name: string, modelName?: string, output: (m: string) => void = () => {}) =>
  new ResourceGenerator({ cwd: "/nonexistent", output, name, modelName });

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

  it("does not re-run plural warn on modelName override", () => {
    const messages: string[] = [];
    build("posts", "comments", (m) => messages.push(m));
    expect(messages.filter((m) => m.includes("recognized as a plural"))).toHaveLength(1);
  });
});
