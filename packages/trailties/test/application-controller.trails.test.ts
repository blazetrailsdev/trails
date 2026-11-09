import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { LookupContext, type Template } from "@blazetrails/actionview";
import { File } from "@blazetrails/ruby-compat";
import { ApplicationController } from "../lib/application-controller.js";
import { Application } from "../lib/application.js";
import { InfoController } from "../lib/info-controller.js";
import { Trails } from "../lib/trails.js";

class ApplicationControllerTestApp extends Application {}

describe("Trails::ApplicationController", () => {
  beforeEach(() => {
    Trails.application = ApplicationControllerTestApp.instance();
    Trails.application.config.secretKeyBase = "secret_key_base".repeat(4);
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("disables the nonce generator and allows inline script and style sources", async ({
    task,
  }) => {
    const tc = new ActionController.TestCase(task.name);
    tc.controller = new InfoController();
    await tc.beforeSetup();
    tc.routes = new RouteSet();
    tc.routes.draw(function () {
      this.get("/trails/info/properties", { to: "trails/info#properties" });
    });
    tc.request.env["REMOTE_ADDR"] = "127.0.0.1";
    await tc.get("properties");

    expect(tc.request.contentSecurityPolicyNonceGenerator).toBeNull();
    const policy = tc.request.contentSecurityPolicy!.build();
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("prepends its templates directory as a path, and the build ships the application layout", async () => {
    const templates = File.expandPath("../lib/templates", import.meta.dirname);
    expect([...ApplicationController.viewPaths()].map((p) => String(p))).toContain(templates);
    const dist = File.expandPath("../dist/templates", import.meta.dirname);
    const layout = new LookupContext([dist]).findTemplate(
      "application",
      ["layouts"],
      false,
      [],
      {},
    ) as Template;
    expect(await File.isExist(`${layout.identifier}.js`)).toBe(true);
  });
});
