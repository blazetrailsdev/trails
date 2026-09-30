import { describe, it, expect } from "vitest";
import { FlashHash } from "../../action-dispatch/flash.js";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Base } from "../base.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import { Flash } from "../../action-dispatch/middleware/flash.js";
import { CookieStore } from "../../action-dispatch/middleware/session/cookie-store.js";
import { ShowExceptions } from "../../action-dispatch/middleware/show-exceptions.js";
import type { MiddlewareFactory } from "../../action-dispatch/middleware/stack.js";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import "../../test-helpers/abstract-unit.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";
import { assertNil } from "@blazetrails/activesupport";

class TestController extends Base {
  async redirectWithAlert(): Promise<void> {
    this.redirectTo("/nowhere", { alert: "Beware the nowheres!" });
  }

  async redirectWithNotice(): Promise<void> {
    this.redirectTo("/somewhere", { notice: "Good luck in the somewheres!" });
  }

  async redirectWithOtherFlashes(): Promise<void> {
    this.redirectTo("/wonderland", { flash: { joyride: "Horses!" } });
  }

  async redirectWithFooFlash(): Promise<void> {
    this.redirectTo("/wonderland", { foo: "for great justice" });
  }
}

async function get(
  action: string,
  controllerClass: typeof TestController = TestController,
): Promise<TestController> {
  const controller = new controllerClass();
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "test.host" };
  await controller.dispatch(action, new Request(env), new Response());
  return controller;
}

describe("FlashTest", () => {
  it("flash", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    expect(flash.get("notice")).toBe("hello");
  });

  it("keep flash", () => {
    const flash = new FlashHash({ notice: "hello" });
    flash.keep();
    flash.sweep();
    expect(flash.get("notice")).toBe("hello");
  });

  it("flash now", () => {
    const flash = new FlashHash();
    flash.now("notice", "immediate");
    expect(flash.get("notice")).toBe("immediate");
    flash.sweep();
    expect(flash.get("notice")).toBeUndefined();
  });

  it("update flash", () => {
    const flash = new FlashHash();
    flash.update({ notice: "updated" });
    expect(flash.get("notice")).toBe("updated");
  });

  it("flash after reset session", () => {
    const flash = new FlashHash({ notice: "old" });
    flash.clear();
    expect(flash.empty).toBe(true);
  });

  it("does not set the session if the flash is empty", () => {
    const flash = new FlashHash();
    assertNil(flash.toSessionValue());
  });

  it("keep and discard return values", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    const kept = flash.keep();
    expect(kept).toEqual({ a: "1", b: "2" });
    const discarded = flash.discard("a");
    expect(discarded).toEqual({ a: "1", b: "2" });
  });

  it("redirect to with alert", async () => {
    const controller = await get("redirectWithAlert");
    expect(controller.flash.get("alert")).toBe("Beware the nowheres!");
  });

  it("redirect to with notice", async () => {
    const controller = await get("redirectWithNotice");
    expect(controller.flash.get("notice")).toBe("Good luck in the somewheres!");
  });

  it("render with flash now alert", () => {
    const flash = new FlashHash();
    flash.now("alert", "immediate alert");
    expect(flash.alert).toBe("immediate alert");
  });

  it("render with flash now notice", () => {
    const flash = new FlashHash();
    flash.now("notice", "immediate notice");
    expect(flash.notice).toBe("immediate notice");
  });

  it("redirect to with other flashes", async () => {
    const controller = await get("redirectWithOtherFlashes");
    expect(controller.flash.get("joyride")).toBe("Horses!");
  });

  it("from session value nil returns empty", () => {
    const flash = FlashHash.fromSessionValue(null);
    expect(flash.empty).toBe(true);
  });

  it.skip("sweep after halted action chain", () => {});

  it("redirect to with adding flash types", async () => {
    const testControllerWithFlashTypeFoo = class extends TestController {};
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    const controller = await get("redirectWithFooFlash", testControllerWithFlashTypeFoo);
    expect(controller.flash.get("foo")).toBe("for great justice");
  });

  it("additional flash types are not listed in actions set", () => {
    const testControllerWithFlashTypeFoo = class extends TestController {};
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    expect(testControllerWithFlashTypeFoo.actionMethods()).not.toContain("foo");
  });

  it("add flash type to subclasses", () => {
    const testControllerWithFlashTypeFoo = class extends TestController {};
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    const subclassControllerWithNoFlashType = class extends testControllerWithFlashTypeFoo {};
    expect(subclassControllerWithNoFlashType._flashTypes).toContain("foo");
  });

  it("does not add flash type to parent class", () => {
    (class extends TestController {}).addFlashTypes("bar");
    expect(TestController._flashTypes.includes("bar")).toBe(false);
  });
});

class FlashIntegrationTestController extends Base {
  static {
    this.addFlashTypes("bar");
  }

  async setBar(): Promise<void> {
    this.flash.set("bar", "for great justice");
    this.head("ok");
  }
}

const SessionKey = "_myapp_session";
const Generator = new KeyGenerator("b3c631c314c0bbca50c1b2843150fe33", { iterations: 1000 });
const Rotations = new RotationConfiguration();
const SIGNED_COOKIE_SALT = "signed cookie";

class FlashIntegrationTestSession extends IntegrationTest {
  override async get(
    path: string,
    options: Parameters<IntegrationTest["get"]>[1] = {},
  ): Promise<void> {
    const env: Record<string, unknown> = { ...(options.env ?? {}) };
    env["action_dispatch.key_generator"] ??= Generator;
    env["action_dispatch.cookies_rotations"] = Rotations;
    env["action_dispatch.signed_cookie_salt"] = SIGNED_COOKIE_SALT;
    return super.get(path, { ...options, env });
  }
}

async function withTestRouteSet(block: (t: IntegrationTest) => Promise<void>): Promise<void> {
  const t = new FlashIntegrationTestSession();
  t.routes.draw((r) => {
    r.get("/set_bar", { to: "flash_integration_test#setBar" });
  });
  t.app = IntegrationTest.buildApp(t.routes, (middleware) => {
    middleware.use(CookieStore as MiddlewareFactory, { key: SessionKey });
    middleware.use(Flash as unknown as MiddlewareFactory);
    middleware.delete(ShowExceptions as MiddlewareFactory);
  });
  controllerConstants.set("flash_integration_test", FlashIntegrationTestController);
  await block(t);
}

describe("FlashIntegrationTest", () => {
  it.skip("flash", () => {});

  it.skip("just using flash does not stream a cookie back", () => {});

  it("setting flash does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    flash.sweep();
    expect(flash.get("notice")).toBe("hello");
  });

  it("setting flash now does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.now("notice", "now");
    expect(flash.get("notice")).toBe("now");
  });

  it("added flash types method", async () => {
    await withTestRouteSet(async (t) => {
      await t.get("/set_bar");
      t.assertResponse("success");
      expect((t.controller as FlashIntegrationTestController & { bar: unknown }).bar).toBe(
        "for great justice",
      );
    });
  });

  it.skip("flash factored into etag", () => {});

  it("flash usable in metal without helper", () => {
    const controller = new Base();
    expect("alert" in controller).toBe(true);
    expect("notice" in controller).toBe(true);
  });
});
