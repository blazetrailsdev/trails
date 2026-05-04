import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { env as processEnv, setEnv } from "@blazetrails/activesupport/process-adapter";
import { Railtie } from "./railtie.js";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
const { deprecators } = BaseRailtie;
import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";
import { deprecator } from "./deprecator.js";

describe("RailtieTest", () => {
  // Snapshot the global subclasses list so activesupport tests that
  // truncate it can't make this suite order-dependent.
  let savedSubclasses: (typeof BaseRailtie)[];
  let savedConfig: Record<string, unknown>;

  beforeEach(() => {
    savedSubclasses = [...BaseRailtie.subclasses];
    try {
      savedConfig =
        typeof structuredClone === "function"
          ? structuredClone(Railtie.config)
          : { ...Railtie.config };
    } catch {
      savedConfig = { ...Railtie.config };
    }
  });

  afterEach(() => {
    SecurePassword.minCost = false;
    ActiveModelError.i18nCustomizeFullMessage = false;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).length = 0;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).push(...savedSubclasses);
    // Reset per-class config to saved snapshot
    for (const key of Object.keys(Railtie.config)) {
      delete (Railtie.config as Record<string, unknown>)[key];
    }
    Object.assign(Railtie.config, savedConfig);
    // Clear deprecators registry
    for (const key of Object.keys(deprecators)) {
      delete deprecators[key];
    }
  });

  it("secure password min_cost is false in the development environment", () => {
    Railtie.initialize({ env: "development" });
    expect(SecurePassword.minCost).toBe(false);
  });

  it("secure password min_cost is true in the test environment", () => {
    Railtie.initialize({ env: "test" });
    expect(SecurePassword.minCost).toBe(true);
  });

  it("i18n customize full message defaults to false", () => {
    Railtie.initialize();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be disabled", () => {
    ActiveModelError.i18nCustomizeFullMessage = true;
    Railtie.initialize();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be enabled", () => {
    Railtie.initialize({ i18nCustomizeFullMessage: true });
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("i18n customize full message can be enabled via nested activeModel config", () => {
    Railtie.initialize({ activeModel: { i18nCustomizeFullMessage: true } });
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("ActiveModel::Railtie is registered in the global subclasses list", () => {
    // Mirrors Rails::Railtie.subclasses which auto-populates via `inherited`.
    expect(BaseRailtie.subclasses).toContain(Railtie);
  });

  it("runInitializers applies the active_model.secure_password setting", () => {
    // Simulate a test environment via TRAILS_ENV so the initializer
    // fires the min_cost branch. Snapshot-and-restore the prior value
    // so a developer or runner that already had TRAILS_ENV set sees
    // it back after the test.
    const prev = processEnv.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    try {
      Railtie.runInitializers();
      expect(SecurePassword.minCost).toBe(true);
    } finally {
      setEnv("TRAILS_ENV", prev);
    }
  });

  it("runInitializers registers the ActiveModel deprecator", () => {
    Railtie.runInitializers();
    expect(deprecators["activeModel"]).toBe(deprecator());
  });

  it("runInitializers applies i18nCustomizeFullMessage from Railtie.config.activeModel", () => {
    (Railtie.config as Record<string, unknown>)["activeModel"] = {
      i18nCustomizeFullMessage: true,
    };
    Railtie.runInitializers();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers applies i18nCustomizeFullMessage from flat Railtie.config (backwards-compat)", () => {
    (Railtie.config as Record<string, unknown>)["i18nCustomizeFullMessage"] = true;
    Railtie.runInitializers();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers defaults i18nCustomizeFullMessage to false when config is absent", () => {
    Railtie.runInitializers();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });
});
