import { describe, it, expect, afterEach } from "vitest";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { ArgumentError, months, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Trailtie, type GlobalIdConfig, type TrailtieApp } from "./global-id.js";
import { getApp, _resetApp } from "@blazetrails/globalid";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "@blazetrails/globalid";
import { Verifier } from "@blazetrails/globalid";

const SECRET_KEY_BASE = "x".repeat(30);

function blogApp(secretKeyBase: string | null = SECRET_KEY_BASE): TrailtieApp {
  const options: Record<string, unknown> = { globalId: {} as GlobalIdConfig };
  return {
    railtieName: "blog_app_application",
    config: {
      get: (key) => options[key],
      set: (key, value) => {
        options[key] = value;
      },
    },
    keyGenerator: () => {
      if (secretKeyBase === null) {
        throw new ArgumentError(
          "Missing `secret_key_base` for 'test' environment, set this string with `bin/rails credentials:edit`",
        );
      }
      return new KeyGenerator(secretKeyBase, { iterations: 1000 });
    },
  };
}

async function initializeApp(app: TrailtieApp): Promise<void> {
  await runTrailtieInitializers(Trailtie, app);
  runLoadHooks("after_initialize", app);
}

describe("RailtieTest", () => {
  afterEach(() => {
    _resetApp();
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  it("GlobalID.app for Blog::Application defaults to blog", async () => {
    await initializeApp(blogApp());
    expect(getApp()).toBe("blog-app");
  });

  it("GlobalID.app can be set with config.global_id.app =", async () => {
    const app = blogApp();
    (app.config.get("globalId") as GlobalIdConfig).app = "foo";
    await initializeApp(app);
    expect(getApp()).toBe("foo");
  });

  it("SignedGlobalID.expires_in can be explicitly set to nil with config.global_id.expires_in", async () => {
    const app = blogApp();
    (app.config.get("globalId") as GlobalIdConfig).expiresIn = null;
    await initializeApp(app);
    expect(SignedGlobalID.expiresIn).toBeNull();
  });

  it("config.global_id can be used to set configurations after the railtie has been loaded", async () => {
    const app = blogApp();
    await runTrailtieInitializers(Trailtie, app);
    (app.config.get("globalId") as GlobalIdConfig).app = "foobar";
    (app.config.get("globalId") as GlobalIdConfig).expiresIn = months(12).toI();
    runLoadHooks("after_initialize", app);

    expect(getApp()).toBe("foobar");
    expect(SignedGlobalID.expiresIn).toBe(months(12).toI());
  });

  it("config.global_id can be used to explicitly set SignedGlobalID.expires_in to nil after the railtie has been loaded", async () => {
    const app = blogApp();
    await runTrailtieInitializers(Trailtie, app);
    (app.config.get("globalId") as GlobalIdConfig).expiresIn = null;
    runLoadHooks("after_initialize", app);

    expect(SignedGlobalID.expiresIn).toBeNull();
  });

  it("SignedGlobalID.verifier defaults to Blog::Application.message_verifier(:signed_global_ids) when secret_key_base is present", async () => {
    const app = blogApp();
    await initializeApp(app);
    const message = { id: 42 };
    const signedMessage = SignedGlobalID.verifier!.generate(message);
    const expected = new Verifier(
      new KeyGenerator(SECRET_KEY_BASE, { iterations: 1000 }).generateKey("signed_global_ids"),
    );
    expect(expected.generate(message)).toBe(signedMessage);
  });

  it("SignedGlobalID.verifier can be set with config.global_id.verifier =", async () => {
    const app = blogApp();
    const customVerifier = new MessageVerifier("muchSECRETsoHIDDEN");
    (app.config.get("globalId") as GlobalIdConfig).verifier = customVerifier;
    await initializeApp(app);
    const message = { id: 42 };
    const signedMessage = SignedGlobalID.verifier!.generate(message);
    expect(customVerifier.generate(message)).toBe(signedMessage);
  });
});
