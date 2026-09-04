import { describe, it, expect, afterEach } from "vitest";
import { ArgumentError, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { GlobalID, getApp } from "@blazetrails/globalid";
import { _resetApp } from "@blazetrails/globalid";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "@blazetrails/globalid";
import { Trailtie, type GlobalIdConfig, type TrailtieApp } from "./global-id.js";
import { Application } from "../application.js";

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

  const blogApp = (): TrailtieApp => {
    const options: Record<string, unknown> = { globalId: {} as GlobalIdConfig };
    return {
      railtieName: "blog_app_application",
      config: {
        get: (key) => options[key],
        set: (key, value) => {
          options[key] = value;
        },
      },
      keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
    };
  };

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

describe("GlobalID::Railtie against a real Application", () => {
  afterEach(() => {
    _resetApp();
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  it("honours config.global_id.app set on the application's own configuration", () => {
    class BlogAppApplication extends Application {}
    const app = new BlogAppApplication();
    const previous = app.config.get("globalId");
    app.config.set("globalId", { app: "boot-app" } as GlobalIdConfig);
    try {
      Trailtie.initialize({
        railtieName: "blog_app_application",
        config: app.config,
        keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
      } as TrailtieApp);
      expect(getApp()).toBe("boot-app");
      expect(Object.prototype.hasOwnProperty.call(app.config, "globalId")).toBe(false);
    } finally {
      app.config.set("globalId", previous);
    }
  });
});
