import { describe, it, expect, afterEach } from "vitest";
import {
  ArgumentError,
  Deprecators,
  resetLoadHooks,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { GlobalID } from "@blazetrails/globalid";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "@blazetrails/globalid";
import { Trailtie, type GlobalIdConfig } from "./global-id.js";
import type { Configuration } from "../trailtie/configuration.js";

interface TrailtieApp {
  railtieName: string;
  config: Pick<Configuration, "get" | "set">;
  deprecators: Deprecators;
  keyGenerator(): KeyGenerator;
}
import { Application } from "../application.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";

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
    GlobalID["_app"] = undefined;
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  const blogApp = (): TrailtieApp => {
    const options: Record<string, unknown> = { globalId: {} as GlobalIdConfig };
    return {
      railtieName: "blog_app_application",
      deprecators: new Deprecators(),
      config: {
        get: (key) => options[key],
        set: (key, value) => {
          options[key] = value;
        },
      },
      keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
    };
  };

  const initializeApp = async (app: TrailtieApp): Promise<void> => {
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("after_initialize", app);
  };

  it("leaves the verifier unset when key_generator raises ArgumentError", async () => {
    const app = blogApp();
    app.keyGenerator = () => {
      throw new ArgumentError("Missing `secret_key_base`");
    };
    await initializeApp(app);
    expect(SignedGlobalID.verifier).toBeUndefined();
  });

  it("propagates a non-ArgumentError failure out of the derivation", async () => {
    const app = blogApp();
    app.keyGenerator = () => {
      throw new TypeError("boom");
    };
    await expect(initializeApp(app)).rejects.toThrow(TypeError);
  });
});

describe("GlobalID::Railtie against a real Application", () => {
  afterEach(() => {
    GlobalID["_app"] = undefined;
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  it("honours config.global_id.app set on the application's own configuration", async () => {
    class BlogAppApplication extends Application {}
    const app = new BlogAppApplication();
    const previous = app.config.get("globalId");
    app.config.set("globalId", { app: "boot-app" } as GlobalIdConfig);
    try {
      await runTrailtieInitializers(Trailtie, {
        railtieName: "blog_app_application",
        deprecators: new Deprecators(),
        config: app.config,
        keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
      } as TrailtieApp);
      expect(GlobalID.app).toBe("boot-app");
      expect(Object.hasOwn(app.config, "globalId")).toBe(false);
    } finally {
      app.config.set("globalId", previous);
    }
  });
});

describe("GlobalID::Railtie Active Record identification", () => {
  afterEach(() => {
    GlobalID["_app"] = undefined;
    resetLoadHooks();
  });

  it("includes GlobalID::Identification into the class the active_record hook runs on", async () => {
    const app: TrailtieApp = {
      railtieName: "blog_app_application",
      deprecators: new Deprecators(),
      config: { get: () => ({}) as GlobalIdConfig, set: () => {} },
      keyGenerator: () => new KeyGenerator("x".repeat(30), { iterations: 1000 }),
    };
    class Person {
      id = 5;
    }
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("active_record", Person);
    const person = new Person() as Person & { toGlobalId(): GlobalID; toGidParam(): string };
    expect(person.toGlobalId().toString()).toBe("gid://blog-app/Person/5");
    expect(person.toGidParam()).toBe(person.toGlobalId().toParam());
  });
});
