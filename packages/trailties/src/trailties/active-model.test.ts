import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { Trailtie, type ActiveModelConfig } from "./active-model.js";
import { Deprecators } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
let deprecators: Deprecators;
let app: { deprecators: Deprecators };
import { SecurePassword } from "@blazetrails/activemodel";
import { Error as ActiveModelError } from "@blazetrails/activemodel";
import { deprecator } from "@blazetrails/activemodel";

describe("RailtieTest", () => {
  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
    Trailtie.config.set("activeModel", {} as ActiveModelConfig);
  });

  afterEach(() => {
    SecurePassword.minCost = false;
    ActiveModelError.i18nCustomizeFullMessage = false;
    _resetTrailsEnv();
    Trailtie.config.set("activeModel", {} as ActiveModelConfig);
  });

  it("secure password min_cost is false in the development environment", async () => {
    Trails.env = "development";
    await runTrailtieInitializers(Trailtie, app);

    expect(SecurePassword.minCost).toBe(false);
  });

  it("secure password min_cost is true in the test environment", async () => {
    Trails.env = "test";
    await runTrailtieInitializers(Trailtie, app);

    expect(SecurePassword.minCost).toBe(true);
  });

  it("i18n customize full message defaults to false", async () => {
    await runTrailtieInitializers(Trailtie, app);

    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be disabled", async () => {
    (Trailtie.config.get("activeModel") as ActiveModelConfig).i18nCustomizeFullMessage = false;
    await runTrailtieInitializers(Trailtie, app);

    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(false);
  });

  it("i18n customize full message can be enabled", async () => {
    (Trailtie.config.get("activeModel") as ActiveModelConfig).i18nCustomizeFullMessage = true;
    await runTrailtieInitializers(Trailtie, app);

    expect(ActiveModelError.i18nCustomizeFullMessage).toBe(true);
  });

  it("ActiveModel::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActiveModel deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("activeModel")).toBe(deprecator());
  });
});
