import { afterEach, describe, expect, it } from "vitest";
import { constantize, demodulize, safeConstantize } from "@blazetrails/activesupport";
import {
  NameError,
  TypeError,
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
    unregisterConstant("Raising", Raising);
  });

  const Raising = {
    name: "Raising",
    get Other(): unknown {
      throw new NameError("uninitialized constant Elsewhere", "Elsewhere");
    },
    get Broken(): unknown {
      throw new TypeError("not a class");
    },
  };

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

  it("demodulizes the full constant path, not a last-segment name", () => {
    registerConstant("Admin::NestedJob", NestedJob);

    expect(demodulize(rbModName(Base)!)).toBe("Base");
    expect(demodulize(rbModName(NestedJob)!)).toBe("NestedJob");
  });

  it("safeConstantize propagates an error that is not about the requested constant", () => {
    registerConstant("Raising", Raising);

    expect(() => safeConstantize("Raising::Other")).toThrow("uninitialized constant Elsewhere");
    expect(() => safeConstantize("Raising::Broken")).toThrow(TypeError);
    expect(safeConstantize("Raising::Missing")).toBeUndefined();
  });

  it("raises NameError for an unregistered job class", () => {
    class UnregisteredJob extends Base {}

    expect(() => constantize(rbModName(UnregisteredJob)!)).toThrow(NameError);
    expect(() => constantize("UnregisteredJob")).toThrow("uninitialized constant UnregisteredJob");
    expect(safeConstantize("UnregisteredJob")).toBeUndefined();
    expect(() => constantize("ActiveJob::Serializers::MissingSerializer")).toThrow(NameError);
  });
});
