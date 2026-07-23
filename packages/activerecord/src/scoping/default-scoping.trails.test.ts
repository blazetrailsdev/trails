/**
 * TS-only coverage for `scope_attributes?`. Rails has no direct test for the
 * predicate — it is exercised indirectly through new-record seeding and the
 * `find`/`find_by` StatementCache guards — so these cases live here rather than
 * in the ported default_scoping_test.rb file.
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { Base } from "../base.js";
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

  it("is inherited by Base subclasses", () => {
    expect(typeof Base.isScopeAttributes).toBe("function");
  });
});
