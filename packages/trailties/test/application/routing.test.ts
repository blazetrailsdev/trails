import { describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { constSet, include } from "@blazetrails/ruby-compat/include";
import { NoMethodError } from "@blazetrails/ruby-compat/no-method-error";
import { TopLevel } from "@blazetrails/ruby-compat/object";
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

const userModel = `
  import { Naming, Conversion, ModelName } from "@blazetrails/activemodel";
  import { extend, include } from "@blazetrails/ruby-compat";
  export class User {
    static _modelName: ModelName | undefined;
    static {
      extend(this, Naming);
      include(this, Conversion);
    }
    static get modelName() {
      return (this._modelName ??= new ModelName(this.constructor as typeof User, null, "User"));
    }
    isPersisted() {
      return false;
    }
  }
`;

describe("RoutingTest", { concurrent: true, timeout: 120_000 }, () => {
  let t: Host;

  Object.assign(RoutingTest.prototype, {
    async setup(): Promise<void> {
      t = new RoutingTest("test") as unknown as Host;
      await t.buildApp();
    },
    async teardown(): Promise<void> {
      await t.teardownApp();
      Trails.application = null;
      Application.appClass = null;
    },
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
      routes(`this.get({ up: "trails/health#show" }, { as: "trails_health_check" });`),
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

  it("root takes precedence over internal welcome controller", async () => {
    await t.app("development");

    await t.assertWelcome((await t.get("/")) as never);

    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.appFile("config/routes.ts", routes(`this.root({ to: "foo#index" });`));

    await t.get("/");
    expect(t.lastResponse().body).toBe("foo");
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

  it("routes appending blocks after reload", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller/:action");`));

    await t.addToConfig(`
      this.config.beforeEagerLoad((app) => {
        return app.reloadRoutesBang();
      });

      this.config.afterInitialize((app) => {
        app.routes().append(function () {
          this.get({ "/win": (e) => [200, { "Content-Type": "text/plain" }, ["WIN"]] });
        });
      });
    `);

    await t.app("production");

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

  it("routes drawing from config/routes", async () => {
    await t.appFile("config/routes.ts", routes(`this.draw("external");`));

    await t.appFile(
      "config/routes/external.ts",
      `import type { Mapper } from "@blazetrails/actionpack/action-dispatch/routing/mapper.js";
        export function drawRoutes(this: Mapper) {
        this.get(":controller/:action");
      }`,
    );

    await t.controller(
      "success",
      plainController(
        "SuccessController",
        `async index() { await this.render({ plain: "success!" }); }`,
        "ActionController.Base",
      ),
    );

    await t.app("development");
    await t.get("/success/index");
    expect(t.lastResponse().body).toBe("success!");
  });

  for (const [mode, [expectedAction, expectedUrl, expectedMapping]] of Object.entries({
    development: ["baz", "http://www.apple.com", "/dashboard"],
    production: ["bar", "http://www.microsoft.com", "/profile"],
  })) {
    it(`reloads routes when configuration is changed in ${mode}`, async () => {
      await t.controller(
        "foo",
        plainController(
          "FooController",
          `
            async bar() { await this.render({ plain: "bar" }); }
            async baz() { await this.render({ plain: "baz" }); }
            async custom() { await this.render({ plain: (this as { customUrl?(): string }).customUrl!() }); }
            async mapping() {
              const { User } = await import("../models/user.ts");
              await this.render({ plain: this.urlFor(new User()) });
            }
          `,
        ),
      );

      await t.appFile("app/models/user.ts", userModel);

      await t.appFile(
        "config/routes.ts",
        routes(`
          this.draw("external");
          this.get("custom", { to: "foo#custom" });
          this.get("mapping", { to: "foo#mapping" });

          this.direct("custom", undefined, () => "http://www.microsoft.com");
          this.resolve("User", () => "/profile");
        `),
      );

      await t.appFile(
        "config/routes/external.ts",
        `import type { Mapper } from "@blazetrails/actionpack/action-dispatch/routing/mapper.js";
        export function drawRoutes(this: Mapper) {
          this.get("foo", { to: "foo#bar" });
        }`,
      );

      await t.app(mode);

      const https = mode === "production" ? "on" : "off";

      await t.get("/foo", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe("bar");

      await t.get("/custom", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe("http://www.microsoft.com");

      await t.get("/mapping", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe("/profile");

      await t.appFile(
        "config/routes.ts",
        routes(`
          this.draw("another-external");
          this.get("custom", { to: "foo#custom" });
          this.get("mapping", { to: "foo#mapping" });

          this.direct("custom", undefined, () => "http://www.apple.com");
          this.resolve("User", () => "/dashboard");
        `),
      );

      await t.appFile(
        "config/routes/another-external.ts",
        `import type { Mapper } from "@blazetrails/actionpack/action-dispatch/routing/mapper.js";
        export function drawRoutes(this: Mapper) {
          this.get("foo", { to: "foo#baz" });
        }`,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await t.get("/foo", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe(expectedAction);

      await t.get("/custom", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe(expectedUrl);

      await t.get("/mapping", {}, { HTTPS: https });
      expect(t.lastResponse().body).toBe(expectedMapping);
    });
  }

  it("routes are added and removed when reloading", async () => {
    await t.app("development");

    await t.controller(
      "foo",
      plainController(
        "FooController",
        `
          async index() { await this.render({ plain: "foo" }); }
          async custom() { await this.render({ plain: (this as { customUrl?(): string }).customUrl!() }); }
          async mapping() {
            const { User } = await import("../models/user.ts");
            await this.render({ plain: this.urlFor(new User()) });
          }
        `,
      ),
    );

    await t.controller(
      "bar",
      plainController("BarController", `async index() { await this.render({ plain: "bar" }); }`),
    );

    await t.appFile("app/models/user.ts", userModel);
    const { User } = await import(await t.appPath("app/models/user.ts"));
    const urlHelpers = () =>
      Trails.application!.routes().urlHelpers() as unknown as Record<
        string,
        (...args: unknown[]) => string
      >;

    await t.appFile("config/routes.ts", routes(`this.get("foo", { to: "foo#index" });`));

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");
    expect(urlHelpers().fooPath()).toBe("/foo");

    await t.get("/bar");
    expect(t.lastResponse().status).toBe(404);
    expect(() => urlHelpers().barPath()).toThrow(TypeError);

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get("foo", { to: "foo#index" });
        this.get("bar", { to: "bar#index" });

        this.get("custom", { to: "foo#custom" });
        this.direct("custom", undefined, () => "http://www.apple.com");

        this.get("mapping", { to: "foo#mapping" });
        this.resolve("User", () => "/profile");
      `),
    );

    await Trails.application!.reloadRoutesBang();

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");
    expect(urlHelpers().fooPath()).toBe("/foo");

    await t.get("/bar");
    expect(t.lastResponse().body).toBe("bar");
    expect(urlHelpers().barPath()).toBe("/bar");

    await t.get("/custom");
    expect(t.lastResponse().body).toBe("http://www.apple.com");
    expect(urlHelpers().customUrl()).toBe("http://www.apple.com");

    await t.get("/mapping");
    expect(t.lastResponse().body).toBe("/profile");
    expect(urlHelpers().polymorphicPath(new User())).toBe("/profile");

    await t.appFile("config/routes.ts", routes(`this.get("foo", { to: "foo#index" });`));

    await Trails.application!.reloadRoutesBang();

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");
    expect(urlHelpers().fooPath()).toBe("/foo");

    await t.get("/bar");
    expect(t.lastResponse().status).toBe(404);
    expect(() => urlHelpers().barPath()).toThrow(TypeError);

    await t.get("/custom");
    expect(t.lastResponse().status).toBe(404);
    expect(() => urlHelpers().customUrl()).toThrow(TypeError);

    await t.get("/mapping");
    expect(t.lastResponse().status).toBe(404);
    expect(() => urlHelpers().polymorphicPath(new User())).toThrow(NoMethodError);
  });

  it("named routes are cleared when reloading", async () => {
    await t.app("development");

    await t.controller(
      "foo",
      plainController("FooController", `async index() { await this.render({ plain: "foo" }); }`),
    );

    await t.controller(
      "bar",
      plainController("BarController", `async index() { await this.render({ plain: "bar" }); }`),
    );

    await t.appFile("app/models/user.ts", userModel);
    const { User } = await import(await t.appPath("app/models/user.ts"));
    const urlHelpers = () =>
      Trails.application!.routes().urlHelpers() as unknown as Record<
        string,
        (...args: unknown[]) => string
      >;

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get(":locale/foo", { to: "foo#index", as: "foo" });
        this.get("users", { to: "foo#users", as: "users" });
        this.direct("microsoft", undefined, () => "http://www.microsoft.com");
        this.resolve("User", () => "/profile");
      `),
    );

    await t.get("/en/foo");
    expect(t.lastResponse().body).toBe("foo");
    expect(urlHelpers().fooPath({ locale: "en" })).toBe("/en/foo");
    expect(urlHelpers().microsoftUrl()).toBe("http://www.microsoft.com");
    expect(urlHelpers().polymorphicPath(new User())).toBe("/profile");

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get(":locale/bar", { to: "bar#index", as: "foo" });
        this.get("users", { to: "foo#users", as: "users" });
        this.direct("apple", undefined, () => "http://www.apple.com");
      `),
    );

    await Trails.application!.reloadRoutesBang();

    await t.get("/en/foo");
    expect(t.lastResponse().status).toBe(404);

    await t.get("/en/bar");
    expect(t.lastResponse().body).toBe("bar");
    expect(urlHelpers().fooPath({ locale: "en" })).toBe("/en/bar");
    expect(urlHelpers().appleUrl()).toBe("http://www.apple.com");
    expect(urlHelpers().polymorphicPath(new User())).toBe("/users");

    expect(() => urlHelpers().microsoftUrl()).toThrow(TypeError);
  });

  it("reloading routes removes methods and doesn't undefine them", async () => {
    await t.app("development");

    await t.appFile("config/routes.ts", routes(`this.get("/url", { to: "url#index" });`));

    await t.appFile(
      "app/models/url-helpers.ts",
      `
        export const UrlHelpers = {
          fooPath() {
            return "/foo";
          },
        };
      `,
    );

    await t.appFile(
      "app/models/context.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        import { include } from "@blazetrails/ruby-compat";
        import { UrlHelpers } from "./url-helpers.ts";
        export class Context {
          static {
            include(this, UrlHelpers);
            include(this, Trails.application!.routes().urlHelpers());
          }
        }
      `,
    );

    await t.controller(
      "url",
      plainController(
        "UrlController",
        `
          async index() {
            const { Context } = await import("../models/context.ts");
            const context = new Context() as { fooPath?(): string };
            await this.render({ plain: context.fooPath!() });
          }
        `,
      ),
    );

    await t.get("/url");
    expect(t.lastResponse().body).toBe("/foo");

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get("/url", { to: "url#index" });
        this.get("/bar", { to: "foo#index", as: "foo" });
      `),
    );

    await Trails.application!.reloadRoutesBang();

    await t.get("/url");
    expect(t.lastResponse().body).toBe("/bar");

    await t.appFile("config/routes.ts", routes(`this.get("/url", { to: "url#index" });`));

    await Trails.application!.reloadRoutesBang();

    await t.get("/url");
    expect(t.lastResponse().body).toBe("/foo");
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
