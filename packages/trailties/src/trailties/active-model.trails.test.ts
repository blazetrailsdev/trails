import { describe, it, expect, afterEach } from "vitest";
import * as ActiveModel from "@blazetrails/activemodel";
import { Deprecators } from "@blazetrails/activesupport";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { _resetTrailsEnv } from "../rails.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { Trailtie, type ActiveModelConfig } from "./active-model.js";

describe("ActiveModel::Railtie class body", () => {
  afterEach(() => {
    ActiveModel.SecurePassword.minCost = false;
    ActiveModel.Error.i18nCustomizeFullMessage = false;
    _resetTrailsEnv();
    Trailtie.config.set("activeModel", {} as ActiveModelConfig);
  });

  it("pushes ActiveModel onto the shared eager-load namespace list", () => {
    expect(Trailtie.config.eagerLoadNamespaces).toContain(ActiveModel.ActiveModel);
  });

  it("ActiveModel::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActiveModel deprecator", async () => {
    const deprecators = new Deprecators();
    await runTrailtieInitializers(Trailtie, { deprecators });
    expect(deprecators.get("activeModel")).toBe(ActiveModel.deprecator());
  });
});
