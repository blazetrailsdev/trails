import { describe, it, expect } from "vitest";
import { NamedBase } from "./named-base.js";
import { ScaffoldControllerGenerator } from "./rails/scaffold-controller/scaffold-controller-generator.js";

function build(name: string, attributes: string[] = []): NamedBase {
  return new NamedBase({ cwd: "/", output: () => {}, name, attributes });
}

function generator(name: string, options: { modelName?: string } = {}) {
  return new ScaffoldControllerGenerator({ cwd: "/", output: () => {}, name, ...options });
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

  it("test_index_helper", () => {
    expect(generator("Post").indexHelper()).toBe("posts");
  });

  it("test_index_helper_to_pluralize_once", () => {
    expect(generator("Stadium").indexHelper()).toBe("stadia");
  });

  it("test_index_helper_with_uncountable", () => {
    expect(generator("Sheep").indexHelper()).toBe("sheepIndex");
  });

  it("test_scaffold_plural_names_with_model_name_option", () => {
    const g = generator("Admin::Foo", { modelName: "User" });
    expect(g.singularRouteName()).toBe("admin_user");
    expect(g.pluralRouteName()).toBe("admin_users");
    expect(g.modelResourceName()).toBe('["admin", user]');
    expect(g.indexHelper()).toBe("adminUsers");
  });
});
