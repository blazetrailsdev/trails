import { beforeAll, describe, expect, it } from "vitest";

import { FixtureResolver, TemplateHandlers } from "@blazetrails/actionview";

import { Base } from "./base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

class ApplicationController extends Base {}

class BadgeController extends ApplicationController {
  async show(): Promise<void> {
    await this.renderAsync({ partial: "shared/status-badge", locals: { status: "ready" } });
  }

  async row(): Promise<void> {
    await this.renderAsync({ partial: "row" });
  }

  async footer(): Promise<void> {
    await this.renderAsync({ partial: "footer" });
  }
}

function makeRequest(): Request {
  return new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" });
}

beforeAll(() => {
  TemplateHandlers.registerTemplateHandler("html", {
    call: (_template: unknown, source: string) => `return ${JSON.stringify(source)};`,
  });
  BadgeController.prependViewPath(
    new FixtureResolver({
      "shared/_status-badge.html.html": "badge",
      "badge/_row.html.html": "row",
      "application/_footer.html.html": "footer",
    }),
  );
});

describe("ActionController::Base render partial:", () => {
  it("resolves a qualified partial name from a controller whose path is unrelated", async () => {
    const c = new BadgeController();
    await c.dispatch("show", makeRequest(), new Response());
    expect(c.responseBody).toBe("badge");
  });

  it("resolves an unqualified partial against the controller's prefix", async () => {
    const c = new BadgeController();
    await c.dispatch("row", makeRequest(), new Response());
    expect(c.responseBody).toBe("row");
  });

  it("reaches a partial in app/views/application from a subclass", async () => {
    const c = new BadgeController();
    await c.dispatch("footer", makeRequest(), new Response());
    expect(c.responseBody).toBe("footer");
  });
});

describe("ActionController::Cookies#cookies", () => {
  class CookiesController extends ApplicationController {
    async authenticate(): Promise<void> {
      this.cookies().set("user_name", "david");
      this.head("ok");
    }
  }

  it("is the request's cookie jar, reachable as a view helper", async () => {
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_COOKIE: "flavor=oatmeal",
    });
    const controller = new CookiesController();
    await controller.dispatch("authenticate", request, new Response());
    expect(controller.cookies()).toBe(request.cookieJar());
    expect(controller.cookies().get("flavor")).toBe("oatmeal");
    expect(request.cookieJar().get("user_name")).toBe("david");
    expect((CookiesController as unknown as { _helperMethods: string[] })._helperMethods).toContain(
      "cookies",
    );
  });
});
