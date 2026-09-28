import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import { CookieStore } from "../../action-dispatch/middleware/session/cookie-store.js";
import { ShowExceptions } from "../../action-dispatch/middleware/show-exceptions.js";
import type { MiddlewareFactory } from "../../action-dispatch/middleware/stack.js";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import "../../test-helpers/abstract-unit.js";

class NoticesController extends Base {
  async create(): Promise<void> {
    this.redirectTo("/notices", { notice: "Post was successfully created." });
  }

  async index(): Promise<void> {
    await this.render({ inline: '<p style="color: green"><%= notice %></p>' });
  }
}

class NoticesSession extends IntegrationTest {
  override async process(
    method: string,
    path: string,
    options: Parameters<IntegrationTest["process"]>[2] = {},
  ): Promise<number> {
    const env: Record<string, unknown> = { ...(options.env ?? {}) };
    env["action_dispatch.key_generator"] ??= new KeyGenerator("a".repeat(64), { iterations: 2 });
    env["action_dispatch.cookies_rotations"] ??= new RotationConfiguration();
    env["action_dispatch.signed_cookie_salt"] ??= "signed cookie";
    return super.process(method, path, { ...options, env });
  }
}

describe("add_flash_types readers", () => {
  it("reads notice on the controller and in the view after a redirect", async () => {
    const t = new NoticesSession();
    t.routes.draw((r) => {
      r.post("/notices", { to: "notices#create" });
      r.get("/notices", { to: "notices#index" });
    });
    t.app = IntegrationTest.buildApp(t.routes, (middleware) => {
      middleware.use(CookieStore as MiddlewareFactory, { key: "_session" });
      middleware.delete(ShowExceptions as MiddlewareFactory);
    });
    controllerConstants.set("notices", NoticesController);

    await t.post("/notices");
    t.assertResponse("redirect");
    await t.followRedirectBang();
    t.assertResponse("success");

    expect((t.controller as NoticesController).notice).toBe("Post was successfully created.");
    expect((t.controller as NoticesController).alert).toBeUndefined();
    expect(t.responseBody).toBe('<p style="color: green">Post was successfully created.</p>');
  });
});
