import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { TopLevel, constSet, include } from "@blazetrails/ruby-compat";
import { onLoad } from "@blazetrails/activesupport";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class RoutingTest extends TestCase {}
include(RoutingTest, Isolation);
include(RoutingTest, Methods);
registerSpecType(/^RoutingTest$/, RoutingTest);

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

const routes = (body: string): string => `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    ${body}
  });
`;

const plainController = (name: string, body: string, parent = "ApplicationController"): string => `
  import { ApplicationController } from "./application-controller.ts";
  import { ActionController } from "@blazetrails/actionpack";
  export class ${name} extends ${parent} {
    ${body}
  }
`;

describe("RoutingTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new RoutingTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("trails/welcome in development", async () => {
    await t.app("development");
    await t.get("/");
    expect(t.lastResponse().status).toBe(200);
  });

  it("trails/info in development", async () => {
    await t.app("development");
    await t.get("/trails/info");
    expect(t.lastResponse().status).toBe(302);
  });

  it("trails/info/routes in development", async () => {
    await t.app("development");
    await t.get("/trails/info/routes");
    expect(t.lastResponse().status).toBe(200);
  });

  it("trails/info/properties in development", async () => {
    await t.app("development");
    await t.get("/trails/info/properties");
    expect(t.lastResponse().status).toBe(200);
  });

  it("/trails/info routes are accessible with globbing route present", async () => {
    await t.app("development");

    await t.appFile("config/routes.ts", routes(`this.get("*foo", { to: "foo#index" });`));

    await t.get("/trails/info");
    expect(t.lastResponse().status).toBe(302);

    await t.get("trails/info/routes");
    expect(t.lastResponse().status).toBe(200);

    await t.get("trails/info/properties");
    expect(t.lastResponse().status).toBe(200);
  });

  it("trails/welcome in production", async () => {
    await t.app("production");
    await t.get("/", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("trails/info in production", async () => {
    await t.app("production");
    await t.get("/trails/info", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("trails/info/routes in production", async () => {
    await t.app("production");
    await t.get("/trails/info/routes", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("trails/info/properties in production", async () => {
    await t.app("production");
    await t.get("/trails/info/properties", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("trails/health in production", async () => {
    await t.app("production");

    await t.appFile(
      "config/routes.ts",
      routes(`this.get({ up: "trails/health#show" }, { as: "trailsHealthCheck" });`),
    );

    await t.get("/up", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(200);
  });

  it("simple controller", async () => {
    await t.simpleController();

    await t.app("development");

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");
  });

  it("mount rack app", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`
        this.mount((env) => [200, {}, [env["PATH_INFO"]]], { at: "/blog" });
        // The line below is required because mount sometimes
        // fails when a resource route is added.
        this.resource("user");
      `),
    );

    await t.app("development");

    await t.get("/blog/archives");
    expect(t.lastResponse().body).toBe("/archives");
  });

  it("mount named rack app", async () => {
    await t.controller(
      "foo",
      plainController(
        "FooController",
        `async index() { await this.render({ plain: this.myBlogPath() }); }`,
      ),
    );

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.mount((env) => [200, {}, [env["PATH_INFO"]]], { at: "/blog", as: "my_blog" });
        this.get({ "/foo": "foo#index" });
      `),
    );

    await t.app("development");

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("/blog");
  });

  it("multiple controllers", async () => {
    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.controller(
      "bar",
      plainController(
        "BarController",
        `async index() { await this.render({ plain: "bar" }); }`,
        "ActionController.Base",
      ),
    );

    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.app("development");

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");

    await t.get("/bar");
    expect(t.lastResponse().body).toBe("bar");
  });

  it("nested controller", async () => {
    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.controller(
      "admin/foo",
      `
        import { ApplicationController } from "../application-controller.ts";
        export class FooController extends ApplicationController {
          async index() {
            await this.render({ plain: "admin::foo" });
          }
        }
      `,
    );

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get("admin/foo", { to: "admin/foo#index" });
        this.get("foo", { to: "foo#index" });
      `),
    );

    await t.app("development");

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");

    await t.get("/admin/foo");
    expect(t.lastResponse().body).toBe("admin::foo");
  });

  it("appended root takes precedence over internal welcome controller", async () => {
    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {});

        Trails.application!.routes().append(function () {
          this.get("/", { to: "foo#index" });
        });
      `,
    );

    await t.app("development");
    await t.get("/");

    expect(t.lastResponse().body).toBe("foo");
  });

  it("simple controller with helper", async () => {
    await t.controller(
      "foo",
      plainController(
        "FooController",
        `async index() { await this.render({ inline: "<%= isFooOrBar() %>" }); }`,
      ),
    );

    await t.appFile(
      "app/helpers/bar-helper.ts",
      `
        export const BarHelper = {
          isFooOrBar() {
            return "bar";
          },
        };
      `,
    );

    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.app("development");

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("bar");
  });

  it("routes appending blocks", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller/:action");`));

    await t.addToConfig(`
      this.routes().append(function () {
        this.get({ "/win": (e) => [200, { "Content-Type": "text/plain" }, ["WIN"]] });
      });
    `);

    await t.app("development");

    await t.get("/win");
    expect(t.lastResponse().body).toBe("WIN");

    await t.appFile("config/routes.ts", routes(`this.get({ lol: "hello#index" });`));

    await t.get("/win");
    expect(t.lastResponse().body).toBe("WIN");
  });

  it("routes are loaded just after initialization", async () => {
    await import(await t.appPath("config/application.ts"));

    onLoad("after_initialize", () => {
      constSet(TopLevel, "InitializeRackApp", () => [200, {}, ["InitializeRackApp"]]);
    });

    await t.appFile(
      "config/routes.ts",
      routes(`this.get("foo", { to: (TopLevel as any).InitializeRackApp });`).replace(
        "import { Trails }",
        'import { TopLevel } from "@blazetrails/ruby-compat";\n  import { Trails }',
      ),
    );

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("InitializeRackApp");
  });

  it("reload_routes! is part of Trails.application API", async () => {
    await t.app("development");
    await expect(Trails.application!.reloadRoutesBang()).resolves.not.toThrow();
  });

  it("root path", async () => {
    await t.app("development");

    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get("foo", { to: "foo#index" });
        this.root({ to: "foo#index" });
      `),
    );

    await t.removeFile("public/index.html");

    await t.get("/");
    expect(t.lastResponse().body).toBe("foo");
  });

  it("resource routing with irregular inflection", async () => {
    await t.app("development");

    await t.appFile(
      "config/initializers/inflection.ts",
      `
        import { Inflector } from "@blazetrails/activesupport";
        Inflector.inflections((inflect) => {
          inflect.irregular("yazi", "yazilar");
        });
      `,
    );

    await t.appFile("config/routes.ts", routes(`this.resources("yazilar");`));

    await t.controller(
      "yazilar",
      plainController(
        "YazilarController",
        `async index() { await this.render({ plain: "yazilar#index" }); }`,
      ),
    );

    await t.get("/yazilars");
    expect(t.lastResponse().status).toBe(404);

    await t.get("/yazilar");
    expect(t.lastResponse().status).toBe(200);
  });

  it("request to trails/welcome for api_only app is successful", async () => {
    await t.addToConfig(`
      this.config.apiOnly = true;
      this.config.actionDispatch.showExceptions = "none";
      this.config.actionController.allowForgeryProtection = true;
    `);

    await t.app("development");

    await t.get("/");
    expect(t.lastResponse().status).toBe(200);
  });

  it("request to trails/welcome is successful when default_protect_from_forgery is false", async () => {
    await t.addToConfig(`
      this.config.actionDispatch.showExceptions = "none";
      this.config.actionController.defaultProtectFromForgery = false;
    `);

    await t.app("development");

    await t.get("/");
    expect(t.lastResponse().status).toBe(200);
  });
});
