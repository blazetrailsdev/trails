import { describe, it, expect } from "vitest";
import { NamedBase } from "./named-base.js";

function build(name: string, attributes: string[] = []): NamedBase {
  return new NamedBase({ cwd: "/", output: () => {}, name, attributes });
}

describe("NamedBase", () => {
  it("test_named_generator_with_underscore", () => {
    const g = build("admin_user");
    expect(g.fileName).toBe("admin_user");
    expect(g.className()).toBe("AdminUser");
    expect(g.tableName()).toBe("admin_users");
  });

  it("test_named_generator_attributes", () => {
    const g = build("post", ["title:string", "body:text"]);
    expect(g.attributes.map((a) => a.name)).toEqual(["title", "body"]);
  });

  it("test_namespaced_scaffold_plural_names", () => {
    const g = build("admin/post");
    expect(g.className()).toBe("Admin::Post");
    expect(g.filePath()).toBe("admin/post");
    expect(g.tableName()).toBe("admin_posts");
  });

  it("test_scaffold_plural_names", () => {
    const g = build("post");
    expect([g.pluralName(), g.singularName(), g.pluralTableName(), g.singularTableName()]).toEqual([
      "posts",
      "post",
      "posts",
      "post",
    ]);
  });
});
