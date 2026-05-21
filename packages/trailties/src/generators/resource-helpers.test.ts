import { describe, it, expect, beforeEach } from "vitest";
import {
  applyResourceHelpers,
  controllerClassName,
  controllerFilePath,
  controllerI18nScope,
  defaultOrmInstance,
} from "./resource-helpers.js";
import { ModelHelpers } from "./model-helpers.js";

describe("applyResourceHelpers", () => {
  beforeEach(() => {
    ModelHelpers.skipWarn = false;
  });

  it("pluralizes into controller helpers and honors modelName override", () => {
    const i = applyResourceHelpers("admin/post");
    expect([i.controllerName, i.controllerClassPath, i.controllerFileName]).toEqual([
      "admin/posts",
      ["admin"],
      "posts",
    ]);
    expect(controllerFilePath(i)).toBe("admin/posts");
    expect(controllerClassName(i)).toBe("Admin::Posts");
    expect(controllerI18nScope(i)).toBe("admin.posts");

    const j = applyResourceHelpers("posts", { modelName: "Article" });
    expect([j.name, j.controllerName]).toEqual(["Article", "posts"]);

    const k = applyResourceHelpers("admin::post");
    expect(controllerFilePath(k)).toBe("admin/posts");
    expect(defaultOrmInstance("@post").save()).toBe("@post.save");
  });

  it("does not re-run plural warn on modelName override", () => {
    const messages: string[] = [];
    applyResourceHelpers("posts", { modelName: "comments" }, (m) => messages.push(m));
    expect(messages.filter((m) => m.includes("recognized as a plural"))).toHaveLength(1);
  });
});
