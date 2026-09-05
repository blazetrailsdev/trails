import { describe, it, expect } from "vitest";
import { Configuration } from "./configuration.js";

describe("Railtie::Configuration (trails)", () => {
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
