import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { env as processEnv, setEnv } from "@blazetrails/activesupport/process-adapter";
import { Trailtie } from "./trailtie.js";
import { Deprecators, Trailtie as BaseTrailtie } from "@blazetrails/activesupport";
let deprecators: Deprecators;
let app: { deprecators: Deprecators };
import { SecurePassword } from "./secure-password.js";
import { Error as ActiveModelError } from "./error.js";
import { deprecator } from "./deprecator.js";

async function runInitializers(app?: unknown): Promise<void> {
  for (const initializer of Trailtie.instance().initializers) await initializer.run(app);
}


describe("RailtieTest", () => {
  const CONFIG_KEYS = ["activeModel", "i18nCustomizeFullMessage"];
  let savedConfig: Record<string, unknown>;

  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
    savedConfig = Object.fromEntries(CONFIG_KEYS.map((k) => [k, Trailtie.config.get(k)]));
  });

  afterEach(() => {
    SecurePassword.minCost = false;
    ActiveModelError.i18nCustomizeFullMessage = false;
    for (const key of CONFIG_KEYS) Trailtie.config.set(key, savedConfig[key]);
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
      await runInitializers(app);
      expect(SecurePassword.minCost).toBe(true);
    } finally {
      setEnv("TRAILS_ENV", prev);
    }
  });

  it("runInitializers registers the ActiveModel deprecator", async () => {
    await runInitializers(app);
    expect(deprecators.get("activeModel")).toBe(deprecator());
  });

  it("runInitializers applies i18nCustomizeFullMessage from Railtie.config.activeModel", async () => {
    Trailtie.config.set("activeModel", {
      i18nCustomizeFullMessage: true,
    });
    await runInitializers(app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers applies i18nCustomizeFullMessage from flat Railtie.config (backwards-compat)", async () => {
    Trailtie.config.set("i18nCustomizeFullMessage", true);
    await runInitializers(app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("runInitializers defaults i18nCustomizeFullMessage to false when config is absent", async () => {
    await runInitializers(app);
    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });
});
