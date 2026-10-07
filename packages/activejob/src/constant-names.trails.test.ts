import { afterEach, describe, expect, it } from "vitest";
import { constantize, safeConstantize } from "@blazetrails/activesupport";
import {
  NameError,
  rbModName,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";

describe("ActiveJob constant names", () => {
  class HelloJob extends Base {}
  class NestedJob extends Base {}

  afterEach(() => {
    unregisterConstant("HelloJob", HelloJob);
    unregisterConstant("Admin::NestedJob", NestedJob);
  });

  it("names a framework class by its Ruby constant path and resolves it again", () => {
    expect(rbModName(Base)).toBe("ActiveJob::Base");
    expect(constantize(rbModName(Base)!)).toBe(Base);
  });

  it("round-trips a registered job class name through constantize", () => {
    registerConstant("HelloJob", HelloJob);
    registerConstant("Admin::NestedJob", NestedJob);

    expect(rbModName(HelloJob)).toBe("HelloJob");
    expect(constantize(rbModName(HelloJob)!)).toBe(HelloJob);
    expect(rbModName(NestedJob)).toBe("Admin::NestedJob");
    expect(constantize(rbModName(NestedJob)!)).toBe(NestedJob);
  });

  it("raises NameError for an unregistered job class", () => {
    class UnregisteredJob extends Base {}

    expect(() => constantize(rbModName(UnregisteredJob)!)).toThrow(NameError);
    expect(() => constantize("UnregisteredJob")).toThrow("uninitialized constant UnregisteredJob");
    expect(safeConstantize("UnregisteredJob")).toBeUndefined();
    expect(() => constantize("ActiveJob::Serializers::MissingSerializer")).toThrow(NameError);
  });
});
