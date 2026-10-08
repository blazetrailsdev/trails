import { describe, it, expect } from "vitest";
import "../index.js";
import { Default } from "./default.js";
import { defaultExtensions } from "./named.js";
import {
  Developer,
  DeveloperOrderedBySalary,
  ClassMethodDeveloperCalledDavid,
} from "../test-helpers/models/developer.js";

describe("scopeAttributes?", () => {
  it("is false for a model with no default scope and no current scope", () => {
    expect(Developer.isScopeAttributes()).toBe(false);
  });

  it("is true for a model with a macro default scope", () => {
    expect(DeveloperOrderedBySalary.isScopeAttributes()).toBe(true);
  });

  it("is true for a model with a method-form default scope", () => {
    expect(ClassMethodDeveloperCalledDavid.isScopeAttributes()).toBe(true);
  });

  it("is true inside a scoping block", async () => {
    await Developer.where({ name: "David" }).scoping(async () => {
      expect(Developer.isScopeAttributes()).toBe(true);
    });
    expect(Developer.isScopeAttributes()).toBe(false);
  });
});

describe("default_scope_override", () => {
  it("is true for a subclass that redefines default_scope, and for its own subclasses", () => {
    class Inheriting extends ClassMethodDeveloperCalledDavid {}

    Default.buildDefaultScope.call(ClassMethodDeveloperCalledDavid);
    Default.buildDefaultScope.call(Inheriting);

    expect(ClassMethodDeveloperCalledDavid.defaultScopeOverride).toBe(true);
    expect(Inheriting.defaultScopeOverride).toBe(true);
    expect(Inheriting.isScopeAttributes()).toBe(true);
  });

  it("is false for a model that only inherits the mixed-in default_scope", () => {
    Default.buildDefaultScope.call(DeveloperOrderedBySalary);

    expect(DeveloperOrderedBySalary.defaultScopeOverride).toBe(false);
  });
});

describe("build_default_scope", () => {
  it("defaults its relation to the model's own relation", () => {
    const withDefault = Default.buildDefaultScope.call(DeveloperOrderedBySalary);
    const withExplicit = Default.buildDefaultScope.call(
      DeveloperOrderedBySalary,
      DeveloperOrderedBySalary.relation(),
    );

    expect(withDefault.toSql()).toBe(withExplicit.toSql());
    expect(withDefault.toSql()).toMatch(/ORDER BY/);
  });
});

describe("default_extensions", () => {
  const extensions = [{ one: () => 1 }];

  it("answers the association scope's extensions", () => {
    const host = {
      currentScope: () => ({ isEmptyScope: true }),
      relation: () => ({ extensions }),
    };

    expect(defaultExtensions.call(host)).toBe(extensions);
  });

  it("falls back to the default scope, then to no extensions", () => {
    const host = {
      abstractClass: true,
      currentScope: () => ({ isEmptyScope: true }),
      relation: () => undefined,
    };

    expect(defaultExtensions.call(host)).toEqual([]);
  });
});
