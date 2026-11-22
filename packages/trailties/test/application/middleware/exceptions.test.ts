import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { ActionController, ParamBuilder } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import { RuntimeError, include } from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class MiddlewareExceptionsTest extends TestCase {}
include(MiddlewareExceptionsTest, Isolation);
include(MiddlewareExceptionsTest, Methods);
registerSpecType(/^MiddlewareExceptionsTest$/, MiddlewareExceptionsTest);

type Host = Generation &
  Omit<Rack, "get" | "app"> & {
    app(env?: string): Promise<Application>;
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    post(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    request(path: string, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string; mediaType: string | null };
    capture(stream: string, block: () => Promise<unknown>): Promise<string>;
  };

const routes = (body: string): string => `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    ${body}
  });
`;

const fooController = (body: string): string => `
  import { ActionController, AbstractController } from "@blazetrails/actionpack";
  import { RecordNotFound, StatementInvalid } from "@blazetrails/activerecord";
  import { RuntimeError } from "@blazetrails/ruby-compat";
  export class FooController extends ActionController.Base {
    ${body}
  }
`;

describe("MiddlewareExceptionsTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new MiddlewareExceptionsTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("show exceptions middleware filter backtrace before logging", async () => {
    await t.controller("foo", fooController(`async index() { throw new Error("oops"); }`));

    const log = await t.capture("stdout", async () => {
      await t.get("/foo", {}, { HTTPS: "on" });
      expect(t.lastResponse().status).toBe(500);
    });

    expect(log).not.toMatch(/action_dispatch/);
    expect(log).toMatch(/oops/);
  });

  it("renders active record exceptions as 404", async () => {
    await t.controller("foo", fooController(`async index() { throw new RecordNotFound(); }`));

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("renders unknown http methods as 405", async () => {
    await t.request("/", { REQUEST_METHOD: "NOT_AN_HTTP_METHOD", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(405);
  });

  it("renders unknown http methods as 405 when routes are used as the custom exceptions app", async () => {
    await t.appFile("config/routes.ts", routes(""));

    await t.addToConfig("this.config.exceptionsApp = this.routes();");

    (await t.app()).config.actionDispatch.showExceptions = "all";

    await t.request("/", { REQUEST_METHOD: "NOT_AN_HTTP_METHOD", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(405);
  });

  it("renders unknown http formats as 406 when routes are used as the custom exceptions app", async () => {
    await t.controller(
      "foo",
      fooController(`
        async index() {
          await this.render({ plain: "rendering index!" });
        }

        async notAcceptable() {
          await this.render({ json: { error: "some error message" }, status: ":not_acceptable" });
        }
      `),
    );

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get("/foo", { to: "foo#index" });
        this.post("/foo", { to: "foo#index" });
        this.match("/406", { to: "foo#notAcceptable", via: ":all" });
      `),
    );

    await t.addToConfig("this.config.exceptionsApp = this.routes();");
    await t.addToConfig(`this.config.actionDispatch.showExceptions = "all";`);
    await t.addToConfig("this.config.considerAllRequestsLocal = false;");

    await t.get("/foo", {}, { HTTP_ACCEPT: "invalid", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(406);
    expect(t.lastResponse().body).not.toBe("rendering index!");

    await t.get("/foo", {}, { CONTENT_TYPE: "invalid", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(406);
    expect(t.lastResponse().body).not.toBe("rendering index!");

    await t.get("/foo", {}, { HTTP_ACCEPT: "invalid", CONTENT_TYPE: "invalid", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(406);
    expect(t.lastResponse().body).not.toBe("rendering index!");

    await t.post("/foo", {}, { HTTP_ACCEPT: "invalid", CONTENT_TYPE: "invalid", HTTPS: "on" });
    expect(t.lastResponse().status).toBe(406);
    expect(t.lastResponse().body).not.toBe("rendering index!");
  });

  it("uses custom exceptions app", async () => {
    await t.addToConfig(`
        this.config.exceptionsApp = (env: unknown) => {
          return [404, { "Content-Type": "text/plain" }, ["YOU FAILED"]];
        };
`);

    (await t.app()).config.actionDispatch.showExceptions = "all";

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
    expect(t.lastResponse().body).toBe("YOU FAILED");
  });

  it("URL generation error when action_dispatch.show_exceptions is set raises an exception", async () => {
    await t.controller(
      "foo",
      fooController(`async index() { throw new ActionController.UrlGenerationError(); }`),
    );

    (await t.app()).config.actionDispatch.showExceptions = "all";

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(500);
  });

  it("unspecified route when action_dispatch.show_exceptions is not set raises an exception", async () => {
    (await t.app()).config.actionDispatch.showExceptions = "none";

    await expect(t.get("/foo", {}, { HTTPS: "on" })).rejects.toThrow(ActionController.RoutingError);
  });

  it("unspecified route when action_dispatch.show_exceptions is set shows 404", async () => {
    (await t.app()).config.actionDispatch.showExceptions = "all";

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().body).toContain("The page you were looking for doesn’t exist.");
  });

  it("unspecified route when action_dispatch.show_exceptions and consider_all_requests_local are set shows diagnostics", async () => {
    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().body).toContain("No route matches");
  });

  it("routing to a nonexistent controller when action_dispatch.show_exceptions and consider_all_requests_local are set shows diagnostics", async () => {
    await t.appFile("config/routes.ts", routes(`this.resources("articles");`));

    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;

    await t.get("/articles", {}, { HTTPS: "on" });
    expect(t.lastResponse().body).toContain("<title>Action Controller: Exception caught</title>");
  });

  it("displays diagnostics message when exception raised in template that contains UTF-8", async () => {
    await t.controller("foo", fooController(`async index() {}`));

    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;

    await t.appFile(
      "app/views/foo/index.html.tse",
      `
        <% throw new Error('boooom') %>
        ✓測試テスト시험
      `,
    );

    await t.get("/foo", { utf8: "✓" }, { HTTPS: "on" });
    expect(t.lastResponse().body).toMatch(/boooom/);
    expect(t.lastResponse().body).toMatch(/測試テスト시험/);
  });

  it("displays diagnostics message when malformed query parameters are provided", async () => {
    await t.controller("foo", fooController(`async index() {}`));

    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;

    await t.get("/foo?x[y]=1&x[y][][w]=2", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(400);
    expect(t.lastResponse().body).toContain("Invalid query parameters");
  });

  it("displays diagnostics message when too deep query parameters are provided", async () => {
    await t.controller("foo", fooController(`async index() {}`));

    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;

    const limit = ParamBuilder.default.paramDepthLimit + 1;
    const maliciousUrl = `/foo?${"[test]".repeat(limit)}=test`;

    await t.get(maliciousUrl, {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(400);
    expect(t.lastResponse().body).toContain("Invalid query parameters");
  });

  it("displays statement invalid template correctly", async () => {
    await t.controller("foo", fooController(`async index() { throw new StatementInvalid(); }`));
    const app = await t.app();
    app.config.actionDispatch.showExceptions = "all";
    app.config.considerAllRequestsLocal = true;
    app.config.actionDispatch.ignoreAcceptHeader = false;

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(500);
    expect(t.lastResponse().body).toContain("<title>Action Controller: Exception caught</title>");
    expect(t.lastResponse().body).toContain("ActiveRecord::StatementInvalid");

    await t.get(
      "/foo",
      {},
      { HTTP_ACCEPT: "text/plain", HTTP_X_REQUESTED_WITH: "XMLHttpRequest", HTTPS: "on" },
    );
    expect(t.lastResponse().status).toBe(500);
    expect(t.lastResponse().mediaType).toBe("text/plain");
    expect(t.lastResponse().body).toContain("ActiveRecord::StatementInvalid");
  });

  it("show_exceptions :rescubale with a rescuable error", async () => {
    await t.controller(
      "foo",
      fooController(`async index() { throw new AbstractController.ActionNotFound(); }`),
    );

    (await t.app()).config.actionDispatch.showExceptions = "rescuable";

    await t.get("/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(404);
  });

  it("show_exceptions :rescubale with a non-rescuable error", async () => {
    await t.controller("foo", fooController(`async index() { throw new RuntimeError("oops"); }`));

    (await t.app()).config.actionDispatch.showExceptions = "rescuable";

    const error = await t.get("/foo", {}, { HTTPS: "on" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as Error).message).toBe("oops");
  });
});
