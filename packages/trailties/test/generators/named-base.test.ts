import { describe, it, expect, vi } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { Generators } from "../../lib/generators.js";
import { Trails } from "../../lib/trails.js";
import { ScaffoldControllerGenerator } from "../../lib/generators/trails/scaffold-controller/scaffold-controller-generator.js";

function generator(name: string, options: { modelName?: string } = {}) {
  return new ScaffoldControllerGenerator([name], options, { destinationRoot: "/" });
}

describe("NamedBaseTest", () => {
  it("named generator with underscore", () => {
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

  it("named generator attributes", () => {
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

  it("named generator attributes as ruby", () => {
    const g = generator("Admin::Foo");
    expect(g.name).toEqual("Admin::Foo");
    expect(g.regularClassPath()).toEqual(["admin"]);
    expect(g.className()).toEqual("Admin::Foo");
    expect(g.filePath()).toEqual("admin/foo");
    expect(g.fileName).toEqual("foo");
    expect(g.singularName()).toEqual("foo");
    expect(g.humanName()).toEqual("Foo");
    expect(g.pluralName()).toEqual("foos");
    expect(g.i18nScope()).toEqual("admin.foo");
    expect(g.tableName()).toEqual("admin_foos");
    expect(g.controllerName).toEqual("Admin::Foos");
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

  it("named generator attributes without pluralized", () => {
    const originalPluralizeTableNames = Base.pluralizeTableNames;
    Base.pluralizeTableNames = false;
    try {
      const g = generator("admin/foo");
      expect(g.tableName()).toEqual("admin_foo");
    } finally {
      Base.pluralizeTableNames = originalPluralizeTableNames;
    }
  });

  it("namespaced scaffold plural names", () => {
    const g = generator("admin/foo");
    expect(g.controllerName).toEqual("admin/foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
  });

  it("namespaced scaffold plural names as ruby", () => {
    const g = generator("Admin::Foo");
    expect(g.controllerName).toEqual("Admin::Foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
  });

  it("scaffold plural names", () => {
    const g = generator("User");
    expect(g.redirectResourceName()).toBe("this.user");
    expect(g.modelResourceName()).toBe("user");
    expect(g.singularRouteName()).toBe("user");
    expect(g.pluralRouteName()).toBe("users");
  });

  it("application name", () => {
    const g = generator("Admin::Foo") as unknown as { applicationName(): string };
    const application = Trails.application;
    try {
      Trails.application = new Object() as never;
      expect(g.applicationName()).toEqual("object");

      Trails.application = null;
      expect(g.applicationName()).toEqual("application");
    } finally {
      Trails.application = application;
    }
  });

  it("index helper", () => {
    expect(generator("Post").indexHelper()).toBe("posts");
  });

  it("index helper to pluralize once", () => {
    expect(generator("Stadium").indexHelper()).toBe("stadia");
  });

  it("index helper with uncountable", () => {
    expect(generator("Sheep").indexHelper()).toBe("sheepIndex");
  });

  it("hide namespace", () => {
    const g = generator("Hidden");
    const klass = g.constructor as typeof ScaffoldControllerGenerator;
    vi.spyOn(klass, "namespace").mockReturnValue("hidden");
    try {
      expect(Generators.hiddenNamespaces()).not.toContain("hidden");
      klass.hideBang();
      expect(Generators.hiddenNamespaces()).toContain("hidden");
    } finally {
      vi.restoreAllMocks();
      Generators.hiddenNamespaces().splice(Generators.hiddenNamespaces().indexOf("hidden"), 1);
    }
  });

  it("scaffold plural names with model name option", () => {
    const g = generator("Admin::Foo", { modelName: "User" });
    expect(g.singularName()).toEqual("user");
    expect(g.name).toEqual("User");
    expect(g.filePath()).toEqual("user");
    expect(g.className()).toEqual("User");
    expect(g.fileName).toEqual("user");
    expect(g.humanName()).toEqual("User");
    expect(g.pluralName()).toEqual("users");
    expect(g.i18nScope()).toEqual("user");
    expect(g.tableName()).toEqual("users");
    expect(g.controllerName).toEqual("Admin::Foos");
    expect(g.controllerClassPath()).toEqual(["admin"]);
    expect(g.controllerClassName()).toEqual("Admin::Foos");
    expect(g.controllerFilePath()).toEqual("admin/foos");
    expect(g.controllerFileName).toEqual("foos");
    expect(g.controllerI18nScope()).toEqual("admin.foos");
    expect(g.singularRouteName()).toBe("admin_user");
    expect(g.pluralRouteName()).toBe("admin_users");
    expect(g.redirectResourceName()).toBe('["admin", this.user]');
    expect(g.modelResourceName()).toBe('["admin", user]');
    expect(g.indexHelper()).toBe("adminUsers");
  });
});
