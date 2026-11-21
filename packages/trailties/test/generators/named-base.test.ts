import { describe, it, expect, vi } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { Generators } from "../../lib/generators.js";
import { Trails } from "../../lib/trails.js";
import { ScaffoldControllerGenerator } from "../../lib/generators/trails/scaffold-controller/scaffold-controller-generator.js";

function generator(name: string, options: { modelName?: string } = {}) {
  return new ScaffoldControllerGenerator([name], options, { destinationRoot: "/" });
}

function assertName(generator: object, value: unknown, method: string): void {
  const member = (generator as Record<string, unknown>)[method];
  expect(typeof member === "function" ? member.call(generator) : member).toEqual(value);
}

describe("NamedBaseTest", () => {
  it("named generator with underscore", () => {
    const g = generator("line_item");
    assertName(g, "line_item", "name");
    assertName(g, [], "regularClassPath");
    assertName(g, "LineItem", "className");
    assertName(g, "line_item", "filePath");
    assertName(g, "line_item", "fileName");
    assertName(g, "Line item", "humanName");
    assertName(g, "line_item", "singularName");
    assertName(g, "line_items", "pluralName");
    assertName(g, "line_item", "i18nScope");
    assertName(g, "line_items", "tableName");
  });

  it("named generator attributes", () => {
    const g = generator("admin/foo");
    assertName(g, "admin/foo", "name");
    assertName(g, ["admin"], "regularClassPath");
    assertName(g, "Admin::Foo", "className");
    assertName(g, "admin/foo", "filePath");
    assertName(g, "foo", "fileName");
    assertName(g, "Foo", "humanName");
    assertName(g, "foo", "singularName");
    assertName(g, "foos", "pluralName");
    assertName(g, "admin.foo", "i18nScope");
    assertName(g, "admin_foos", "tableName");
    assertName(g, "admin/foos", "controllerName");
    assertName(g, ["admin"], "controllerClassPath");
    assertName(g, "Admin::Foos", "controllerClassName");
    assertName(g, "admin/foos", "controllerFilePath");
    assertName(g, "foos", "controllerFileName");
    assertName(g, "admin.foos", "controllerI18nScope");
    assertName(g, "admin_foo", "singularRouteName");
    assertName(g, "admin_foos", "pluralRouteName");
    assertName(g, "this.admin_foo", "redirectResourceName");
    assertName(g, "admin_foo", "modelResourceName");
    assertName(g, "adminFoos", "indexHelper");
  });

  it("named generator attributes as ruby", () => {
    const g = generator("Admin::Foo");
    assertName(g, "Admin::Foo", "name");
    assertName(g, ["admin"], "regularClassPath");
    assertName(g, "Admin::Foo", "className");
    assertName(g, "admin/foo", "filePath");
    assertName(g, "foo", "fileName");
    assertName(g, "foo", "singularName");
    assertName(g, "Foo", "humanName");
    assertName(g, "foos", "pluralName");
    assertName(g, "admin.foo", "i18nScope");
    assertName(g, "admin_foos", "tableName");
    assertName(g, "Admin::Foos", "controllerName");
    assertName(g, ["admin"], "controllerClassPath");
    assertName(g, "Admin::Foos", "controllerClassName");
    assertName(g, "admin/foos", "controllerFilePath");
    assertName(g, "foos", "controllerFileName");
    assertName(g, "admin.foos", "controllerI18nScope");
    assertName(g, "admin_foo", "singularRouteName");
    assertName(g, "admin_foos", "pluralRouteName");
    assertName(g, "this.admin_foo", "redirectResourceName");
    assertName(g, "admin_foo", "modelResourceName");
    assertName(g, "adminFoos", "indexHelper");
  });

  it("named generator attributes without pluralized", () => {
    const originalPluralizeTableNames = Base.pluralizeTableNames;
    Base.pluralizeTableNames = false;
    try {
      const g = generator("admin/foo");
      assertName(g, "admin_foo", "tableName");
    } finally {
      Base.pluralizeTableNames = originalPluralizeTableNames;
    }
  });

  it("namespaced scaffold plural names", () => {
    const g = generator("admin/foo");
    assertName(g, "admin/foos", "controllerName");
    assertName(g, ["admin"], "controllerClassPath");
    assertName(g, "Admin::Foos", "controllerClassName");
    assertName(g, "admin/foos", "controllerFilePath");
    assertName(g, "foos", "controllerFileName");
    assertName(g, "admin.foos", "controllerI18nScope");
  });

  it("namespaced scaffold plural names as ruby", () => {
    const g = generator("Admin::Foo");
    assertName(g, "Admin::Foos", "controllerName");
    assertName(g, ["admin"], "controllerClassPath");
    assertName(g, "Admin::Foos", "controllerClassName");
    assertName(g, "admin/foos", "controllerFilePath");
    assertName(g, "foos", "controllerFileName");
    assertName(g, "admin.foos", "controllerI18nScope");
  });

  it("scaffold plural names", () => {
    const g = generator("User");
    assertName(g, "this.user", "redirectResourceName");
    assertName(g, "user", "modelResourceName");
    assertName(g, "user", "singularRouteName");
    assertName(g, "users", "pluralRouteName");
  });

  it("application name", () => {
    const g = generator("Admin::Foo") as unknown as { applicationName(): string };
    const application = Trails.application;
    try {
      Trails.application = new Object() as never;
      assertName(g, "object", "applicationName");

      Trails.application = null;
      assertName(g, "application", "applicationName");
    } finally {
      Trails.application = application;
    }
  });

  it("index helper", () => {
    assertName(generator("Post"), "posts", "indexHelper");
  });

  it("index helper to pluralize once", () => {
    assertName(generator("Stadium"), "stadia", "indexHelper");
  });

  it("index helper with uncountable", () => {
    assertName(generator("Sheep"), "sheepIndex", "indexHelper");
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
    assertName(g, "user", "singularName");
    assertName(g, "User", "name");
    assertName(g, "user", "filePath");
    assertName(g, "User", "className");
    assertName(g, "user", "fileName");
    assertName(g, "User", "humanName");
    assertName(g, "users", "pluralName");
    assertName(g, "user", "i18nScope");
    assertName(g, "users", "tableName");
    assertName(g, "Admin::Foos", "controllerName");
    assertName(g, ["admin"], "controllerClassPath");
    assertName(g, "Admin::Foos", "controllerClassName");
    assertName(g, "admin/foos", "controllerFilePath");
    assertName(g, "foos", "controllerFileName");
    assertName(g, "admin.foos", "controllerI18nScope");
    assertName(g, "admin_user", "singularRouteName");
    assertName(g, "admin_users", "pluralRouteName");
    assertName(g, '["admin", this.user]', "redirectResourceName");
    assertName(g, '["admin", user]', "modelResourceName");
    assertName(g, "adminUsers", "indexHelper");
  });
});
