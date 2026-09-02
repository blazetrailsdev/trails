import { describe, it, expect, afterEach } from "vitest";
import { ArgumentError, months, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Trailtie, type GlobalIdConfig, type TrailtieApp } from "./global-id.js";
import { getApp, _resetApp } from "@blazetrails/globalid";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "@blazetrails/globalid";
import { Verifier } from "@blazetrails/globalid";

const SECRET_KEY_BASE = "x".repeat(30);

/** Stands in for Rails' `BlogApp::Application`, which the Ruby test boots. */
function blogApp(
  secretKeyBase: string | null = SECRET_KEY_BASE,
): TrailtieApp & { config: { globalId: GlobalIdConfig } } {
  return {
    railtieName: "blog_app_application",
    config: { globalId: {} },
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

/** Rails' `@app.initialize!` — the `global_id` initializer, then the
 * `after_initialize` block it registers. */
function initializeApp(app: TrailtieApp): void {
  Trailtie.initialize(app);
  runLoadHooks("after_initialize", app);
}

describe("RailtieTest", () => {
  afterEach(() => {
    _resetApp();
    _resetSignedGlobalIDClassConfig();
    resetLoadHooks();
  });

  it("GlobalID.app for Blog::Application defaults to blog", () => {
    initializeApp(blogApp());
    expect(getApp()).toBe("blog-app");
  });

  it("GlobalID.app can be set with config.global_id.app =", () => {
    const app = blogApp();
    app.config.globalId.app = "foo";
    initializeApp(app);
    expect(getApp()).toBe("foo");
  });

  it("SignedGlobalID.expires_in can be explicitly set to nil with config.global_id.expires_in", () => {
    const app = blogApp();
    app.config.globalId.expiresIn = null;
    initializeApp(app);
    expect(SignedGlobalID.expiresIn).toBeNull();
  });

  it("config.global_id can be used to set configurations after the railtie has been loaded", () => {
    const app = blogApp();
    Trailtie.initialize(app);
    app.config.globalId.app = "foobar";
    app.config.globalId.expiresIn = months(12).toI();
    runLoadHooks("after_initialize", app);

    expect(getApp()).toBe("foobar");
    expect(SignedGlobalID.expiresIn).toBe(months(12).toI());
  });

  it("config.global_id can be used to explicitly set SignedGlobalID.expires_in to nil after the railtie has been loaded", () => {
    const app = blogApp();
    Trailtie.initialize(app);
    app.config.globalId.expiresIn = null;
    runLoadHooks("after_initialize", app);

    expect(SignedGlobalID.expiresIn).toBeNull();
  });

  it("SignedGlobalID.verifier defaults to Blog::Application.message_verifier(:signed_global_ids) when secret_key_base is present", () => {
    const app = blogApp();
    initializeApp(app);
    const message = { id: 42 };
    const signedMessage = SignedGlobalID.verifier!.generate(message);
    const expected = new Verifier(
      new KeyGenerator(SECRET_KEY_BASE, { iterations: 1000 }).generateKey("signed_global_ids"),
    );
    expect(expected.generate(message)).toBe(signedMessage);
  });

  it("SignedGlobalID.verifier can be set with config.global_id.verifier =", () => {
    const app = blogApp();
    const customVerifier = new MessageVerifier("muchSECRETsoHIDDEN");
    app.config.globalId.verifier = customVerifier;
    initializeApp(app);
    const message = { id: 42 };
    const signedMessage = SignedGlobalID.verifier!.generate(message);
    expect(customVerifier.generate(message)).toBe(signedMessage);
  });
});
