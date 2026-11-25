import { describe, it, expect } from "vitest";
import { FlashHash } from "../../../lib/action-dispatch/middleware/flash.js";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Base } from "../../../lib/action-controller/base.js";
import { Flash } from "../../../lib/action-dispatch/middleware/flash.js";
import { Cookies } from "../../../lib/action-dispatch/middleware/cookies.js";
import { CookieStore } from "../../../lib/action-dispatch/middleware/session/cookie-store.js";
import { ShowExceptions } from "../../../lib/action-dispatch/middleware/show-exceptions.js";
import { IntegrationTest } from "../../../lib/action-dispatch/testing/integration.js";
import "../../support/abstract-unit.js";
import { Request } from "../../../lib/action-dispatch/http/request.js";
import { Response } from "../../../lib/action-dispatch/http/response.js";
import { include } from "@blazetrails/activesupport";
import {
  assertEqual,
  assertNil,
  assertNot,
  assertNotEqual,
  assertNothingRaised,
  assertRespondTo,
} from "@blazetrails/activesupport/testing/assertions";
import { constSet } from "@blazetrails/ruby-compat/include";
import { rbObjAsString, TopLevel } from "@blazetrails/ruby-compat/object";
import { Metal } from "../../../lib/action-controller/metal.js";
import { TestCase } from "../../../lib/action-controller/test-case.js";
import { Flash as ControllerFlash } from "../../../lib/action-controller/metal/flash.js";

class TestController extends Base {
  static {
    this.beforeAction(":haltAndRedir", { only: "filterHaltingAction" });
  }

  flashCopy!: Record<string, unknown>;
  flashy: unknown;
  flashyThat: unknown;
  flashyThatReset: unknown;
  flashyThis: unknown;

  async setFlash(): Promise<void> {
    (await this.flash).set("that", "hello");
    await this.render({ inline: "hello" });
  }

  async setFlashNow(): Promise<void> {
    (await this.flash).now.set("that", "hello");
    if ((await this.flash).now.get("foo") == null) (await this.flash).now.set("foo", "bar");
    if ((await this.flash).now.get("foo") == null) (await this.flash).now.set("foo", "err");
    this.flashy = (await this.flash).now.get("that");
    this.flashCopy = { ...(await this.flash).toHash() };
    await this.render({ inline: "hello" });
  }

  async attemptToUseFlashNow(): Promise<void> {
    this.flashCopy = { ...(await this.flash).toHash() };
    this.flashy = (await this.flash).get("that");
    await this.render({ inline: "hello" });
  }

  async useFlash(): Promise<void> {
    this.flashCopy = { ...(await this.flash).toHash() };
    this.flashy = (await this.flash).get("that");
    await this.render({ inline: "hello" });
  }

  async useFlashAndKeepIt(): Promise<void> {
    this.flashCopy = { ...(await this.flash).toHash() };
    this.flashy = (await this.flash).get("that");
    (await this.flash).keep();
    await this.render({ inline: "hello" });
  }

  async useFlashAndUpdateIt(): Promise<void> {
    (await this.flash).update({ this: "hello again" });
    this.flashCopy = { ...(await this.flash).toHash() };
    await this.render({ inline: "hello" });
  }

  async useFlashAfterResetSession(): Promise<void> {
    (await this.flash).set("that", "hello");
    this.flashyThat = (await this.flash).get("that");
    await this.resetSession();
    this.flashyThatReset = (await this.flash).get("that");
    (await this.flash).set("this", "good-bye");
    this.flashyThis = (await this.flash).get("this");
    await this.render({ inline: "hello" });
  }

  async stdAction(): Promise<void> {
    this.flashCopy = { ...(await this.flash).toHash() };
    await this.head(":ok");
  }

  async filterHaltingAction(): Promise<void> {
    this.flashCopy = { ...(await this.flash).toHash() };
  }

  async haltAndRedir(): Promise<void> {
    (await this.flash).set("foo", "bar");
    await this.redirectTo({ action: "stdAction" });
    this.flashCopy = { ...(await this.flash).toHash() };
  }

  async redirectWithAlert(): Promise<void> {
    await this.redirectTo("/nowhere", { alert: "Beware the nowheres!" });
  }

  async redirectWithNotice(): Promise<void> {
    await this.redirectTo("/somewhere", { notice: "Good luck in the somewheres!" });
  }

  async renderWithFlashNowAlert(): Promise<void> {
    (await this.flash).now.alert = "Beware the nowheres now!";
    await this.render({ inline: "hello" });
  }

  async renderWithFlashNowNotice(): Promise<void> {
    (await this.flash).now.notice = "Good luck in the somewheres now!";
    await this.render({ inline: "hello" });
  }

  async redirectWithOtherFlashes(): Promise<void> {
    await this.redirectTo("/wonderland", { flash: { joyride: "Horses!" } });
  }

  async redirectWithFooFlash(): Promise<void> {
    await this.redirectTo<"foo">("/wonderland", { foo: "for great justice" });
  }
}

async function get(
  action: string,
  controllerClass: typeof TestController = TestController,
): Promise<TestController> {
  const controller = new controllerClass();
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "test.host" };
  await controller.dispatch(action, new Request(env), await Response.new());
  return controller;
}

async function testCase(name: string): Promise<TestCase> {
  const tc = new TestCase(name);
  tc.controller = new TestController();
  await tc.beforeSetup();
  return tc;
}

describe("FlashTest", () => {
  const controllerOf = (tc: TestCase) => tc.controller as TestController;

  it("flash", async ({ task }) => {
    const tc = await testCase(task.name);
    await tc.get("setFlash");

    await tc.get("useFlash");
    assertEqual("hello", controllerOf(tc).flashCopy["that"]);
    assertEqual("hello", controllerOf(tc).flashy);

    await tc.get("useFlash");
    assertNil(controllerOf(tc).flashCopy["that"], "On second flash");
  });

  it("keep flash", async ({ task }) => {
    const tc = await testCase(task.name);
    await tc.get("setFlash");

    await tc.get("useFlashAndKeepIt");
    assertEqual("hello", controllerOf(tc).flashCopy["that"]);
    assertEqual("hello", controllerOf(tc).flashy);

    await tc.get("useFlash");
    assertEqual("hello", controllerOf(tc).flashCopy["that"], "On second flash");

    await tc.get("useFlash");
    assertNil(controllerOf(tc).flashCopy["that"], "On third flash");
  });

  it("flash now", async ({ task }) => {
    const tc = await testCase(task.name);
    await tc.get("setFlashNow");
    assertEqual("hello", controllerOf(tc).flashCopy["that"]);
    assertEqual("bar", controllerOf(tc).flashCopy["foo"]);
    assertEqual("hello", controllerOf(tc).flashy);

    await tc.get("attemptToUseFlashNow");
    assertNil(controllerOf(tc).flashCopy["that"]);
    assertNil(controllerOf(tc).flashCopy["foo"]);
    assertNil(controllerOf(tc).flashy);
  });

  it("update flash", async ({ task }) => {
    const tc = await testCase(task.name);
    await tc.get("setFlash");
    await tc.get("useFlashAndUpdateIt");
    assertEqual("hello", controllerOf(tc).flashCopy["that"]);
    assertEqual("hello again", controllerOf(tc).flashCopy["this"]);
    await tc.get("useFlash");
    assertNil(controllerOf(tc).flashCopy["that"], "On second flash");
    assertEqual("hello again", controllerOf(tc).flashCopy["this"], "On second flash");
  });

  it("flash after reset session", async ({ task }) => {
    const tc = await testCase(task.name);
    await tc.get("useFlashAfterResetSession");
    assertEqual("hello", controllerOf(tc).flashyThat);
    assertEqual("good-bye", controllerOf(tc).flashyThis);
    assertNil(controllerOf(tc).flashyThatReset);
  });

  it("does not set the session if the flash is empty", () => {
    const flash = new FlashHash();
    assertNil(flash.toSessionValue());
  });

  it("keep and discard return values", () => {
    const flash = new FlashHash();
    flash.update({ foo: "foo_indeed", bar: "bar_indeed" });

    expect(flash.discard("foo")).toBe("foo_indeed");
    assertNil(flash.discard("unknown"));
    expect((flash.discard() as FlashHash).toHash()).toEqual({
      foo: "foo_indeed",
      bar: "bar_indeed",
    });
    expect((flash.discard(null) as FlashHash).toHash()).toEqual({
      foo: "foo_indeed",
      bar: "bar_indeed",
    });

    expect(flash.keep("foo")).toBe("foo_indeed");
    assertNil(flash.keep("unknown"));
    expect((flash.keep() as FlashHash).toHash()).toEqual({ foo: "foo_indeed", bar: "bar_indeed" });
    expect((flash.keep(null) as FlashHash).toHash()).toEqual({
      foo: "foo_indeed",
      bar: "bar_indeed",
    });
  });

  it("redirect to with alert", async () => {
    const controller = await get("redirectWithAlert");
    expect((await controller.flash).get("alert")).toBe("Beware the nowheres!");
  });

  it("redirect to with notice", async () => {
    const controller = await get("redirectWithNotice");
    expect((await controller.flash).get("notice")).toBe("Good luck in the somewheres!");
  });

  it("render with flash now alert", async () => {
    const controller = await get("renderWithFlashNowAlert");
    assertEqual("Beware the nowheres now!", (await controller.flash).get("alert"));
  });

  it("render with flash now notice", async () => {
    const controller = await get("renderWithFlashNowNotice");
    assertEqual("Good luck in the somewheres now!", (await controller.flash).get("notice"));
  });

  it("redirect to with other flashes", async () => {
    const controller = await get("redirectWithOtherFlashes");
    expect((await controller.flash).get("joyride")).toBe("Horses!");
  });

  it("from session value nil returns empty", () => {
    const flash = FlashHash.fromSessionValue(null);
    expect(flash.isEmpty()).toBe(true);
  });

  it("sweep after halted action chain", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new TestController();
    await tc.beforeSetup();
    const flashCopy = () => (tc.controller as TestController).flashCopy;

    await tc.get("stdAction");
    assertNil(flashCopy()["foo"]);
    await tc.get("filterHaltingAction");
    assertEqual("bar", flashCopy()["foo"]);
    await tc.get("stdAction");
    assertEqual("bar", flashCopy()["foo"]);
    await tc.get("stdAction");
    assertNil(flashCopy()["foo"]);
  });

  it("redirect to with adding flash types", async () => {
    const testControllerWithFlashTypeFoo = (() => class extends TestController {})();
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    const controller = await get("redirectWithFooFlash", testControllerWithFlashTypeFoo);
    expect((await controller.flash).get("foo")).toBe("for great justice");
  });

  it("additional flash types are not listed in actions set", () => {
    const testControllerWithFlashTypeFoo = (() => class extends TestController {})();
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    expect(testControllerWithFlashTypeFoo.actionMethods()).not.toContain("foo");
  });

  it("add flash type to subclasses", () => {
    const testControllerWithFlashTypeFoo = (() => class extends TestController {})();
    testControllerWithFlashTypeFoo.addFlashTypes("foo");
    const subclassControllerWithNoFlashType = (() =>
      class extends testControllerWithFlashTypeFoo {})();
    expect(subclassControllerWithNoFlashType._flashTypes).toContain("foo");
  });

  it("does not add flash type to parent class", () => {
    (class extends TestController {}).addFlashTypes("bar");
    assertNot(TestController._flashTypes.includes("bar"));
  });
});

class FlashIntegrationTestController extends Base {
  static {
    this.addFlashTypes("bar");
  }

  async setFlash(): Promise<void> {
    (await this.flash).set("that", "hello");
    await this.head(":ok");
  }

  async setFlashNow(): Promise<void> {
    (await this.flash).now.set("that", "hello");
    await this.head(":ok");
  }

  async useFlash(): Promise<void> {
    await this.render({ inline: `flash: ${rbObjAsString((await this.flash).get("that"))}` });
  }

  async setFlashOptionally(): Promise<void> {
    (await this.flash).now.set("notice", this.params.get("flash"));
    if (await this.isStale(null, { etag: "abe" })) {
      await this.render({ inline: "maybe flash" });
    }
  }

  async setBar(): Promise<void> {
    (await this.flash).set("bar", "for great justice");
    await this.head(":ok");
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
  ): Promise<number> {
    const env: Record<string, unknown> = { ...(options.env ?? {}) };
    env[Cookies.GENERATOR_KEY] ??= Generator;
    env[Cookies.COOKIES_ROTATIONS] = Rotations;
    env["action_dispatch.signed_cookie_salt"] = SIGNED_COOKIE_SALT;
    return super.get(path, { ...options, env });
  }
}

async function withTestRouteSet(block: (tc: IntegrationTest) => Promise<void>): Promise<void> {
  const tc = new FlashIntegrationTestSession(expect.getState().currentTestName!);
  tc.routes.draw(function () {
    this.get("/set_flash", { to: "flash_integration_test#setFlash" });
    this.get("/set_flash_now", { to: "flash_integration_test#setFlashNow" });
    this.get("/use_flash", { to: "flash_integration_test#useFlash" });
    this.get("/set_bar", { to: "flash_integration_test#setBar" });
    this.get("/set_flash_optionally", { to: "flash_integration_test#setFlashOptionally" });
  });
  tc.app = IntegrationTest.buildApp(tc.routes, (middleware) => {
    middleware.use(CookieStore, { key: SessionKey });
    middleware.use(Flash);
    middleware.delete(ShowExceptions);
  });
  constSet(TopLevel, "FlashIntegrationTestController", FlashIntegrationTestController);
  await block(tc);
}

describe("FlashIntegrationTest", () => {
  it("flash", async () => {
    await withTestRouteSet(async (tc) => {
      await tc.get("/set_flash");
      tc.assertResponse(":success");
      assertEqual("hello", (await tc.request.flash).get("that"));

      await tc.get("/use_flash");
      tc.assertResponse(":success");
      assertEqual("flash: hello", tc.response.body);
    });
  });

  it("just using flash does not stream a cookie back", async () => {
    await withTestRouteSet(async (tc) => {
      await tc.get("/use_flash");
      tc.assertResponse(":success");
      assertNil(tc.response.headers.get("Set-Cookie"));
      assertEqual("flash: ", tc.response.body);
    });
  });

  it("setting flash does not raise in following requests", async () => {
    await withTestRouteSet(async (tc) => {
      const env = { "action_dispatch.request.flash_hash": new FlashHash() };
      await tc.get("/set_flash", { env });
      await assertNothingRaised(async () => {
        await tc.get("/set_flash", { env });
      });
    });
  });

  it("setting flash now does not raise in following requests", async () => {
    await withTestRouteSet(async (tc) => {
      const env = { "action_dispatch.request.flash_hash": new FlashHash() };
      await tc.get("/set_flash_now", { env });
      await assertNothingRaised(async () => {
        await tc.get("/set_flash_now", { env });
      });
    });
  });

  it("added flash types method", async () => {
    await withTestRouteSet(async (tc) => {
      await tc.get("/set_bar");
      tc.assertResponse(":success");
      assertEqual(
        "for great justice",
        await (tc.controller as FlashIntegrationTestController & { bar: unknown }).bar,
      );
    });
  });

  it("flash factored into etag", async () => {
    await withTestRouteSet(async (tc) => {
      await tc.get("/set_flash_optionally");
      const noFlashEtag = tc.response.etag;

      await tc.get("/set_flash_optionally", { params: { flash: "hello!" } });
      const helloFlashEtag = tc.response.etag;

      assertNotEqual(noFlashEtag, helloFlashEtag);

      await tc.get("/set_flash_optionally", { params: { flash: "hello!" } });
      const anotherHelloFlashEtag = tc.response.etag;

      assertEqual(anotherHelloFlashEtag, helloFlashEtag);

      await tc.get("/set_flash_optionally", { params: { flash: "goodbye!" } });
      const goodbyeFlashEtag = tc.response.etag;

      assertNotEqual(anotherHelloFlashEtag, goodbyeFlashEtag);
    });
  });

  it("flash usable in metal without helper", async () => {
    let controllerClass: typeof Metal | null = null;

    await assertNothingRaised(() => {
      controllerClass = (() => class extends Metal {})();
      include(controllerClass, ControllerFlash);
    });

    const controller = new controllerClass!();

    assertRespondTo(controller, "alert");
    assertRespondTo(controller, "notice");
  });
});
