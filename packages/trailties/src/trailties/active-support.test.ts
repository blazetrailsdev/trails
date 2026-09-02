import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import {
  Deprecation,
  Deprecators,
  DEFAULT_BEHAVIORS,
  deprecator as activeSupportDeprecator,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { Trailtie, type ActiveSupportConfig } from "./active-support.js";

const deprecator = activeSupportDeprecator();
let deprecators: Deprecators;
let appConfig: Record<string, unknown>;
let app: { config: { get(key: string): unknown }; deprecators: Deprecators };

describe("RailtieTest", () => {
  let savedActiveSupport: unknown;
  let savedHashDigestClass: typeof Digest.hashDigestClass;

  beforeEach(() => {
    deprecators = new Deprecators();
    appConfig = {};
    app = { config: { get: (key: string): unknown => appConfig[key] }, deprecators };
    savedHashDigestClass = Digest.hashDigestClass;
    const cur = Trailtie.config.get("activeSupport");
    try {
      savedActiveSupport =
        typeof structuredClone === "function" ? structuredClone(cur) : { ...(cur as object) };
    } catch {
      savedActiveSupport = { ...(cur as object) };
    }
  });

  afterEach(() => {
    Trailtie.config.set("activeSupport", savedActiveSupport);
    Digest.hashDigestClass = savedHashDigestClass;
  });

  it("ActiveSupport::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("seeds config.activeSupport on load", () => {
    expect(Trailtie.config.get("activeSupport")).toBeDefined();
  });

  it("runInitializers registers the ActiveSupport deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("activeSupport")).toBe(deprecator);
  });

  it("runInitializers applies hashDigestClass from Railtie.config.activeSupport", async () => {
    const custom = { hexdigest: (data: string): string => `custom:${data}` };
    Trailtie.config.set("activeSupport", { hashDigestClass: custom } satisfies ActiveSupportConfig);
    await runTrailtieInitializers(Trailtie, app);
    expect(Digest.hashDigestClass).toBe(custom);
  });

  it("runInitializers silences all deprecators when reportDeprecations is false", async () => {
    const other = new Deprecation();
    deprecators.set("other", other);
    Trailtie.config.set("activeSupport", {
      reportDeprecations: false,
    } satisfies ActiveSupportConfig);
    const savedBehavior = deprecator.behavior;
    const savedSilenced = deprecator.silenced;
    const savedDisallowed = deprecator.disallowedBehavior;
    try {
      await runTrailtieInitializers(Trailtie, app);
      for (const d of [deprecator, other]) {
        expect(d.silenced).toBe(true);
        expect(d.behavior).toEqual([DEFAULT_BEHAVIORS.silence]);
        expect(d.disallowedBehavior).toEqual([DEFAULT_BEHAVIORS.silence]);
      }
    } finally {
      deprecator.behavior = savedBehavior;
      deprecator.silenced = savedSilenced;
      deprecator.disallowedBehavior = savedDisallowed;
    }
  });

  it("runInitializers applies deprecation behavior to all registered deprecators", async () => {
    const other = new Deprecation();
    deprecators.set("other", other);
    Trailtie.config.set("activeSupport", {
      deprecation: "raise",
      disallowedDeprecation: "raise",
      disallowedDeprecationWarnings: ["bad"],
    } satisfies ActiveSupportConfig);
    const savedBehavior = deprecator.behavior;
    const savedDisallowed = deprecator.disallowedBehavior;
    const savedWarnings = [...deprecator.disallowedWarnings];
    try {
      await runTrailtieInitializers(Trailtie, app);
      for (const d of [deprecator, other]) {
        expect(d.behavior).toEqual([DEFAULT_BEHAVIORS.raise]);
        expect(d.disallowedBehavior).toEqual([DEFAULT_BEHAVIORS.raise]);
        expect(d.disallowedWarnings).toEqual(["bad"]);
      }
    } finally {
      deprecator.behavior = savedBehavior;
      deprecator.disallowedBehavior = savedDisallowed;
      deprecator.disallowedWarnings = savedWarnings;
    }
  });

  it("runInitializers leaves hashDigestClass untouched when config is absent", async () => {
    const before = Digest.hashDigestClass;
    await runTrailtieInitializers(Trailtie, app);
    expect(Digest.hashDigestClass).toBe(before);
  });

  it("runInitializers reads deprecation settings off the yielded application's config", async () => {
    const other = new Deprecation();
    deprecators.set("other", other);
    appConfig["activeSupport"] = { reportDeprecations: false } satisfies ActiveSupportConfig;
    Trailtie.config.set("activeSupport", {} satisfies ActiveSupportConfig);
    const savedBehavior = deprecator.behavior;
    const savedSilenced = deprecator.silenced;
    const savedDisallowed = deprecator.disallowedBehavior;
    try {
      await runTrailtieInitializers(Trailtie, app);
      for (const d of [deprecator, other]) {
        expect(d.silenced).toBe(true);
        expect(d.behavior).toEqual([DEFAULT_BEHAVIORS.silence]);
      }
    } finally {
      deprecator.behavior = savedBehavior;
      deprecator.silenced = savedSilenced;
      deprecator.disallowedBehavior = savedDisallowed;
    }
  });
});
