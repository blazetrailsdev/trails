import { afterEach, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import { TopLevel, constSet, extend, env as ENV, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";

type Routed = { routes(): ReturnType<Application["routes"]> };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface UrlGenerationTest {
  get(path: string): Promise<unknown>;
  lastResponse(): { body: string };
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class UrlGenerationTest {
  app(): unknown {
    return Trails.application;
  }
}

describe("UrlGenerationTest", () => {
  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("it works", { timeout: 60_000 }, async () => {
    await import("../../lib/trailties/action-controller.js");
    await import("../../lib/trailties/action-view.js");

    class MyApp extends Application {
      static {
        Application.register(this);
        this.config.sessionStore(":cookie_store", { key: "_myapp_session" });
        this.config.activeSupport.deprecation = "log";
        this.config.eagerLoad = false;
        this.config.hosts.push(() => true);
        this.config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
      }
    }

    await Trails.application!.initializeBang();

    class ApplicationController extends ActionController.Base {}
    constSet(TopLevel, "ApplicationController", ApplicationController);

    class OmgController extends ApplicationController {
      async index(): Promise<void> {
        await this.render({ plain: (this as unknown as { omgPath(): string }).omgPath() });
      }
    }
    constSet(TopLevel, "OmgController", OmgController);

    (MyApp as unknown as Routed).routes().draw(function () {
      this.get("/", { to: "omg#index", as: "omg" });
    });

    const t = new UrlGenerationTest();
    extend(t, Methods);

    await t.get("/");
    expect(t.lastResponse().body).toBe("/");
  });

  it("routes know the relative root", () => {
    const relativeUrl = "/hello";
    const prev = ENV["TRAILS_RELATIVE_URL_ROOT"];
    setEnv("TRAILS_RELATIVE_URL_ROOT", relativeUrl);
    const app = class extends Application {};
    expect((app as unknown as Routed).routes().relativeUrlRoot).toBe(relativeUrl);
    setEnv("TRAILS_RELATIVE_URL_ROOT", prev);
  });
});
