import { describe, it, expect } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { ScaffoldControllerGenerator } from "./rails/scaffold-controller/scaffold-controller-generator.js";

function generator(name: string, options: { modelName?: string } = {}) {
  return new ScaffoldControllerGenerator({ cwd: "/", output: () => {}, name, ...options });
}

describe("NamedBase", () => {
  it("test_named_generator_with_underscore", () => {
    const g = generator("line_item");
    expect(g.name).toEqual("line_item");
    expect(g.regularClassPath()).toEqual([]);
    expect(g.className()).toEqual("LineItem");
    expect(g.filePath()).toEqual("line_item");
    expect(g.fileName).toEqual("line_item");
    expect(g.humanName()).toEqual("Line item");
    expect(g.singularName()).toEqual("line_item");
    expect(g.pluralName()).toEqual("line_items");
    expect(g.i18nScope()).toEqual("line_item");
    expect(g.tableName()).toEqual("line_items");
  });

  it("test_named_generator_attributes", () => {
    const g = generator("admin/foo");
    expect(g.name).toEqual("admin/foo");
    expect(g.regularClassPath()).toEqual(["admin"]);
    expect(g.className()).toEqual("Admin::Foo");
    expect(g.filePath()).toEqual("admin/foo");
    expect(g.fileName).toEqual("foo");
    expect(g.humanName()).toEqual("Foo");
    expect(g.singularName()).toEqual("foo");
    expect(g.pluralName()).toEqual("foos");
    expect(g.i18nScope()).toEqual("admin.foo");
    expect(g.tableName()).toEqual("admin_foos");
    expect(g.controllerName).toEqual("admin/foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
    expect(g.singularRouteName()).toEqual("admin_foo");
    expect(g.pluralRouteName()).toEqual("admin_foos");
    expect(g.redirectResourceName()).toEqual("this.admin_foo");
    expect(g.modelResourceName()).toEqual("admin_foo");
    expect(g.indexHelper()).toEqual("adminFoos");
  });

  it("test_named_generator_attributes_without_pluralized", () => {
    const originalPluralizeTableNames = Base.pluralizeTableNames;
    Base.pluralizeTableNames = false;
    try {
      const g = generator("admin/foo");
      expect(g.tableName()).toEqual("admin_foo");
    } finally {
      Base.pluralizeTableNames = originalPluralizeTableNames;
    }
  });

  it("test_namespaced_scaffold_plural_names", () => {
    const g = generator("admin/foo");
    expect(g.controllerName).toEqual("admin/foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
  });

  it("test_namespaced_scaffold_plural_names_as_ruby", () => {
    const g = generator("Admin::Foo");
    expect(g.controllerName).toEqual("Admin::Foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
  });

  it("test_scaffold_plural_names", () => {
    const g = generator("User");
    expect(g.redirectResourceName()).toBe("this.user");
    expect(g.modelResourceName()).toBe("user");
    expect(g.singularRouteName()).toBe("user");
    expect(g.pluralRouteName()).toBe("users");
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
    expect(g.redirectResourceName()).toBe('["admin", this.user]');
    expect(g.modelResourceName()).toBe('["admin", user]');
    expect(g.indexHelper()).toBe("adminUsers");
  });
});
