import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Railtie as BaseRailtie, Deprecation, deprecator } from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { Trailtie, type ActiveSupportConfig } from "./active-support.js";

const { deprecators } = BaseRailtie;

describe("RailtieTest", () => {
  let savedSubclasses: (typeof BaseRailtie)[];
  let savedActiveSupport: unknown;
  let savedHashDigestClass: typeof Digest.hashDigestClass;

  beforeEach(() => {
    savedSubclasses = [...BaseRailtie.subclasses];
    savedHashDigestClass = Digest.hashDigestClass;
    const cur = Trailtie.config["activeSupport"];
    try {
      savedActiveSupport =
        typeof structuredClone === "function" ? structuredClone(cur) : { ...(cur as object) };
    } catch {
      savedActiveSupport = { ...(cur as object) };
    }
  });

  afterEach(() => {
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).length = 0;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).push(...savedSubclasses);
    Trailtie.config["activeSupport"] = savedActiveSupport;
    for (const key of Object.keys(deprecators)) {
      delete deprecators[key];
    }
    Digest.hashDigestClass = savedHashDigestClass;
  });

  it("ActiveSupport::Railtie is registered in the global subclasses list", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
  });

  it("seeds config.activeSupport on load", () => {
    expect(Trailtie.config["activeSupport"]).toBeDefined();
  });

  it("runInitializers registers the ActiveSupport deprecator", () => {
    Trailtie.runInitializers();
    expect(deprecators["activeSupport"]).toBe(deprecator);
  });

  it("runInitializers applies hashDigestClass from Railtie.config.activeSupport", () => {
    const custom = { hexdigest: (data: string): string => `custom:${data}` };
    Trailtie.config["activeSupport"] = { hashDigestClass: custom } satisfies ActiveSupportConfig;
    Trailtie.runInitializers();
    expect(Digest.hashDigestClass).toBe(custom);
  });

  it("runInitializers silences all deprecators when reportDeprecations is false", () => {
    const other = new Deprecation();
    deprecators["other"] = other;
    Trailtie.config["activeSupport"] = { reportDeprecations: false } satisfies ActiveSupportConfig;
    const savedBehavior = deprecator.behavior;
    const savedSilenced = deprecator.silenced;
    const savedDisallowed = deprecator.disallowedBehavior;
    try {
      Trailtie.runInitializers();
      for (const d of [deprecator, other]) {
        expect(d.silenced).toBe(true);
        expect(d.behavior).toBe("silence");
        expect(d.disallowedBehavior).toBe("silence");
      }
    } finally {
      deprecator.behavior = savedBehavior;
      deprecator.silenced = savedSilenced;
      deprecator.disallowedBehavior = savedDisallowed;
    }
  });

  it("runInitializers applies deprecation behavior to all registered deprecators", () => {
    const other = new Deprecation();
    deprecators["other"] = other;
    Trailtie.config["activeSupport"] = {
      deprecation: "raise",
      disallowedDeprecation: "raise",
      disallowedDeprecationWarnings: ["bad"],
    } satisfies ActiveSupportConfig;
    const savedBehavior = deprecator.behavior;
    const savedDisallowed = deprecator.disallowedBehavior;
    const savedWarnings = [...deprecator.disallowedWarnings];
    try {
      Trailtie.runInitializers();
      for (const d of [deprecator, other]) {
        expect(d.behavior).toBe("raise");
        expect(d.disallowedBehavior).toBe("raise");
        expect(d.disallowedWarnings).toEqual(["bad"]);
      }
    } finally {
      deprecator.behavior = savedBehavior;
      deprecator.disallowedBehavior = savedDisallowed;
      deprecator.disallowedWarnings = savedWarnings;
    }
  });

  it("runInitializers leaves hashDigestClass untouched when config is absent", () => {
    const before = Digest.hashDigestClass;
    Trailtie.runInitializers();
    expect(Digest.hashDigestClass).toBe(before);
  });
});
