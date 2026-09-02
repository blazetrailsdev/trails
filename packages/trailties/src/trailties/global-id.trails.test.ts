import { describe, it, expect, afterEach } from "vitest";
import { ArgumentError, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { GlobalID } from "@blazetrails/globalid";
import { _resetApp } from "@blazetrails/globalid";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "@blazetrails/globalid";
import { Trailtie, type GlobalIdConfig, type TrailtieApp } from "./global-id.js";

describe("GlobalID::Railtie class body", () => {
  it("pushes GlobalID onto the shared eager-load namespace list", () => {
    expect(Trailtie.config.eagerLoadNamespaces).toContain(GlobalID);
  });

  it("seeds the config.global_id namespace before any initializer runs", () => {
    expect(Trailtie.config.get("globalId")).toBeDefined();
  });
});

describe("GlobalID::Railtie verifier derivation", () => {
  afterEach(() => {
    _resetApp();
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  const blogApp = (): TrailtieApp & { config: { globalId: GlobalIdConfig } } => ({
    railtieName: "blog_app_application",
    config: { globalId: {} },
    keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
  });

  const initializeApp = (app: TrailtieApp): void => {
    Trailtie.initialize(app);
    runLoadHooks("after_initialize", app);
  };

  it("leaves the verifier unset when key_generator raises ArgumentError", () => {
    const app = blogApp();
    app.keyGenerator = () => {
      throw new ArgumentError("Missing `secret_key_base`");
    };
    initializeApp(app);
    expect(SignedGlobalID.verifier).toBeUndefined();
  });

  it("propagates a non-ArgumentError failure out of the derivation", () => {
    const app = blogApp();
    app.keyGenerator = () => {
      throw new TypeError("boom");
    };
    expect(() => initializeApp(app)).toThrow(TypeError);
  });
});
