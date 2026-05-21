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

  it("pluralizes into controller helpers, supports modelName override, exposes default ORM", () => {
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
    expect(j.name).toBe("Article");
    expect(j.controllerName).toBe("posts");
    expect(defaultOrmInstance("@post").save()).toBe("@post.save");
  });
});
