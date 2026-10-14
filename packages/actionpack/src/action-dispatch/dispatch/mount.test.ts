import { beforeEach, describe, it } from "vitest";
import { assert, assertEqual, assertNotEqual, TopLevel } from "@blazetrails/activesupport";
import { bodyFromString, type RackEnv, type RackResponse } from "@blazetrails/rack";
import { Engine } from "@blazetrails/trailties/engine";
import { Trailtie } from "@blazetrails/trailties/trailtie";
import type { MountableApp } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";
import { IntegrationTest } from "../testing/integration.js";
import { RoutedRackApp } from "../../test-helpers/abstract-unit.js";

TopLevel.Trails = { Engine, Trailtie } as unknown as typeof TopLevel.Trails;

const Router = new RouteSet();

class AppWithRoutes extends Engine {
  private static _routes?: RouteSet;

  static {
    Engine.register(this);
  }

  static routes(): RouteSet {
    return (this._routes ??= new RouteSet());
  }
}

class SinatraLikeApp {
  static routes(): object {
    return {};
  }

  static call(_env: RackEnv): RackResponse {
    return [200, { "Content-Type": "text/html" }, bodyFromString("OK")];
  }
}

Router.draw(function () {
  const SprocketsApp = (env: RackEnv): RackResponse => [
    200,
    { "Content-Type": "text/html" },
    bodyFromString(`${env["SCRIPT_NAME"]} -- ${env["PATH_INFO"]}`),
  ];

  this.mount(SprocketsApp, { at: "/sprockets" });
  this.mount(SprocketsApp, { at: "/star*" });
  this.mount(new Map([[SprocketsApp, "/shorthand"]]));

  this.mount(SinatraLikeApp, { at: "/fakeengine", as: "fake" });
  this.mount(SinatraLikeApp, { at: "/getfake", via: ":get" });

  this.scope("/its_a", () => {
    this.mount(SprocketsApp, { at: "/sprocket" });
  });

  this.resources("users", () => {
    this.mount(AppWithRoutes as unknown as MountableApp, {
      at: "/fakeengine",
      as: "fake_mounted_at_resource",
    });
  });

  this.mount(SprocketsApp, { at: "/", via: ":get" });
});

const APP = new RoutedRackApp(Router);

class TestRoutingMount extends IntegrationTest {
  override get app(): unknown {
    return APP;
  }
}

describe("TestRoutingMount", () => {
  let t: TestRoutingMount;

  beforeEach(({ task }) => {
    t = new TestRoutingMount(task.name);
  });

  it("app name is properly generated when engine is mounted in resources", () => {
    assert(
      Router.mountedHelpers().isMethodDefined("userFakeMountedAtResource"),
      "A mounted helper should be defined with a parent's prefix",
    );
    assert(
      Router.namedRoutes.isKey("user_fake_mounted_at_resource"),
      "A named route should be defined with a parent's prefix",
    );
  });

  it("mounting at root path", async () => {
    await t.get("/omg");
    assertEqual(" -- /omg", t.response.body);

    await t.get("/~omg");
    assertEqual(" -- /~omg", t.response.body);
  });

  it("mounting at path with non word character", async () => {
    await t.get("/star*/omg");
    assertEqual("/star* -- /omg", t.response.body);
  });

  it("mounting sets script name", async () => {
    await t.get("/sprockets/omg");
    assertEqual("/sprockets -- /omg", t.response.body);
  });

  it("mounting works with nested script name", async () => {
    await t.get("/foo/sprockets/omg", {
      headers: { SCRIPT_NAME: "/foo", PATH_INFO: "/sprockets/omg" },
    });
    assertEqual("/foo/sprockets -- /omg", t.response.body);
  });

  it("mounting works with scope", async () => {
    await t.get("/its_a/sprocket/omg");
    assertEqual("/its_a/sprocket -- /omg", t.response.body);
  });

  it("mounting with shorthand", async () => {
    await t.get("/shorthand/omg");
    assertEqual("/shorthand -- /omg", t.response.body);
  });

  it("mounting does not match similar paths", async () => {
    await t.get("/shorthandomg");
    assertNotEqual("/shorthand -- /omg", t.response.body);
    assertEqual(" -- /shorthandomg", t.response.body);
  });

  it("mounting works with via", async () => {
    await t.get("/getfake");
    assertEqual("OK", t.response.body);

    await t.post("/getfake");
    t.assertResponse("not_found");
  });

  it("with fake engine does not call invalid method", async () => {
    await t.get("/fakeengine");
    assertEqual("OK", t.response.body);
  });
});
