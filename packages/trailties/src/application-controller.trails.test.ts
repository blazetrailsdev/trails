import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { Application } from "./application.js";
import { InfoController } from "./info-controller.js";
import { Trails } from "./rails.js";

class ApplicationControllerTestApp extends Application {}

describe("Rails::ApplicationController", () => {
  beforeEach(() => {
    Trails.application = ApplicationControllerTestApp.instance();
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("disables the nonce generator and allows inline script and style sources", async () => {
    const tc = new ActionController.TestCase(InfoController);
    await tc.get("properties", { env: { REMOTE_ADDR: "127.0.0.1" } });

    expect(tc.request.contentSecurityPolicyNonceGenerator).toBeNull();
    const policy = tc.request.contentSecurityPolicy!.build();
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });
});
