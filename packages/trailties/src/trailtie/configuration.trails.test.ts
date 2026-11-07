import { describe, it, expect } from "vitest";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import { EngineConfiguration } from "../engine/configuration.js";

describe("Railtie::Configuration (trails)", () => {
  it("respondTo answers true for a real method as well as a stored option", () => {
    const config = new Configuration();
    config.set("someDynamicOption", 1);
    expect(config.isRespondTo("someDynamicOption")).toBe(true);
    expect(config.isRespondTo("toPrepare")).toBe(true);
    expect(config.isRespondTo("eagerLoadNamespaces")).toBe(true);
    expect(config.isRespondTo("neverSet")).toBe(false);
  });

  it("respond_to? answers an attr_accessor held as an instance field", () => {
    expect(new EngineConfiguration().isRespondTo("defaultScope")).toBe(true);
  });

  it("stores a key naming TS-only implementation surface, as Ruby has no such method", () => {
    const config = new Configuration();
    config.set("_options", 1);
    config.set("_actualMethod", 2);
    expect(config.get("_options")).toBe(1);
    expect(config.get("_actualMethod")).toBe(2);
  });

  it("a property read of an unset key reaches method_missing's super arm", () => {
    const config = new Configuration() as Configuration & { neverSetKey: unknown };
    expect(() => config.neverSetKey).toThrow(NoMethodError);
    config.set("neverSetKey", 1);
    expect(config.neverSetKey).toBe(1);
  });

  it("answers JS protocol probes without raising", () => {
    const config = new Configuration() as Configuration & { then: unknown };
    expect(config.then).toBeUndefined();
  });
});

describe("Trailtie::Configuration method_missing in the prototype chain", () => {
  it("lets a subclass with a #private field construct and answer config names", () => {
    class Sub extends Configuration {
      #tag = "sub";
      tag(): string {
        return this.#tag;
      }
    }
    const config = new Sub() as Sub & Record<string, unknown>;
    config.protoChainOption = 7;
    expect(config.tag()).toBe("sub");
    expect(config.protoChainOption).toBe(7);
    expect(Object.hasOwn(config, "protoChainOption")).toBe(false);
    expect(config instanceof Sub).toBe(true);
    expect(Object.getPrototypeOf(config)).toBe(Sub.prototype);
  });
});
