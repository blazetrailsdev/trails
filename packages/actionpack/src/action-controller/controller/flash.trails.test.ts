import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { ActionNotFound } from "../../abstract-controller/base.js";
import { Base } from "../base.js";
import { Metal } from "../metal.js";
import { Flash } from "../metal/flash.js";
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
  it("reads notice on the controller and in the view after a redirect", async ({ task }) => {
    const t = new NoticesSession(task.name);
    t.routes.draw(function () {
      this.post("/notices", { to: "notices#create" });
      this.get("/notices", { to: "notices#index" });
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
    expect(t.body).toBe('<p style="color: green">Post was successfully created.</p>');
  });

  it("drops a flash type from action methods cached before add_flash_types", () => {
    class WarningsController extends Base {
      async warning(): Promise<void> {}
    }
    expect(WarningsController.actionMethods()).toContain("warning");
    WarningsController.addFlashTypes("warning");
    expect(WarningsController.actionMethods()).not.toContain("warning");
  });

  it("drops an inherited multi-word action a flash type of the same name shadows", async () => {
    class FooBarsController extends Base {
      async fooBar(): Promise<void> {}
    }
    expect(FooBarsController.actionMethods()).toContain("fooBar");

    const shadowed = (() => class extends FooBarsController {})();
    shadowed.addFlashTypes("fooBar");
    expect(shadowed.actionMethods()).not.toContain("fooBar");
    await expect(new shadowed().process("fooBar")).rejects.toThrow(ActionNotFound);

    const untouched = (() => class extends FooBarsController {})();
    untouched.addFlashTypes("foo_bar");
    expect(untouched.actionMethods()).toContain("fooBar");
  });

  it("extends add_flash_types and action_methods onto a Metal includer", () => {
    class MetalFlashController extends Metal {
      async show(): Promise<void> {}
    }
    include(MetalFlashController, Flash);
    const klass = MetalFlashController as unknown as {
      prototype: object;
      addFlashTypes(...types: string[]): void;
      actionMethods(): string[];
    };
    expect(Object.hasOwn(klass, "addFlashTypes")).toBe(true);
    expect(klass.actionMethods()).toContain("show");
    expect(klass.actionMethods()).not.toContain("alert");
    klass.addFlashTypes("warning");
    expect("warning" in klass.prototype).toBe(true);
    expect("warning" in Metal.prototype).toBe(false);
  });
});
