import { describe, it, expect } from "vitest";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";

describe("Railtie::Configuration (trails)", () => {
  it("raises NoMethodError with an informative message if assigning to an existing method", () => {
    const config = new Configuration();
    expect(() => config.set("eagerLoadNamespaces", 1)).toThrow(NoMethodError);
    expect(() => config.set("eagerLoadNamespaces", 1)).toThrow(
      /Cannot assign to `eagerLoadNamespaces`, it is a configuration method/,
    );
  });

  it("respondTo answers true for a real method as well as a stored option", () => {
    const config = new Configuration();
    config.set("someDynamicOption", 1);
    expect(config.respondTo("someDynamicOption")).toBe(true);
    expect(config.respondTo("toPrepare")).toBe(true);
    expect(config.respondTo("eagerLoadNamespaces")).toBe(true);
    expect(config.respondTo("neverSet")).toBe(false);
  });

  it("stores a key naming TS-only implementation surface, as Ruby has no such method", () => {
    const config = new Configuration();
    config.set("_options", 1);
    config.set("_actualMethod", 2);
    expect(config.get("_options")).toBe(1);
    expect(config.get("_actualMethod")).toBe(2);
  });
});
