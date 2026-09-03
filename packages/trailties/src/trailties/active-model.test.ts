import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { env as processEnv, setEnv } from "@blazetrails/ruby-compat";
import { Trailtie } from "./active-model.js";
import { Deprecators } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
let deprecators: Deprecators;
let app: { deprecators: Deprecators };
import { SecurePassword } from "@blazetrails/activemodel";
import { Error as ActiveModelError } from "@blazetrails/activemodel";
import { deprecator } from "@blazetrails/activemodel";

describe("RailtieTest", () => {
  let savedConfig: Record<string, unknown>;

  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
    savedConfig = {
      activeModel: Trailtie.config.get("activeModel"),
      i18nCustomizeFullMessage: Trailtie.config.get("i18nCustomizeFullMessage"),
    };
  });

  afterEach(() => {
    SecurePassword.minCost = false;
    ActiveModelError.i18nCustomizeFullMessage = false;
    for (const [key, value] of Object.entries(savedConfig)) Trailtie.config.set(key, value);
  });

  it("secure password min_cost is false in the development environment", () => {
    Trailtie.initialize({ env: "development" });
    expect(SecurePassword.minCost).toBe(false);
  });

  it("secure password min_cost is true in the test environment", () => {
    Trailtie.initialize({ env: "test" });
    expect(SecurePassword.minCost).toBe(true);
  });

  it("i18n customize full message defaults to false", () => {
    Trailtie.initialize();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be disabled", () => {
    ActiveModelError.i18nCustomizeFullMessage = true;
    Trailtie.initialize();
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be enabled", () => {
    Trailtie.initialize({ i18nCustomizeFullMessage: true });
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("i18n customize full message can be enabled via nested activeModel config", () => {
    Trailtie.initialize({ activeModel: { i18nCustomizeFullMessage: true } });
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("ActiveModel::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers applies the active_model.secure_password setting", async () => {
    const prev = processEnv.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    try {
      await runTrailtieInitializers(Trailtie, app);
      expect(SecurePassword.minCost).toBe(true);
    } finally {
      setEnv("TRAILS_ENV", prev);
    }
  });

  it("runInitializers registers the ActiveModel deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("activeModel")).toBe(deprecator());
  });

  it("runInitializers applies i18nCustomizeFullMessage from Railtie.config.activeModel", async () => {
    Trailtie.config.set("activeModel", {
      i18nCustomizeFullMessage: true,
    });
    await runTrailtieInitializers(Trailtie, app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers applies i18nCustomizeFullMessage from flat Railtie.config (backwards-compat)", async () => {
    Trailtie.config.set("i18nCustomizeFullMessage", true);
    await runTrailtieInitializers(Trailtie, app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers defaults i18nCustomizeFullMessage to false when config is absent", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });
});
