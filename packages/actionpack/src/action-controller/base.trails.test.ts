import { beforeAll, describe, expect, it, vi } from "vitest";

import { FixtureResolver, MissingTemplate, TemplateHandlers } from "@blazetrails/actionview";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

class ApplicationController extends Base {}

class BadgeController extends ApplicationController {
  async show(): Promise<void> {
    await this.render({ partial: "shared/status-badge", locals: { status: "ready" } });
  }

  async row(): Promise<void> {
    await this.render({ partial: "row" });
  }

  async footer(): Promise<void> {
    await this.render({ partial: "footer" });
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

describe("ActionController::Base#respond_to?", () => {
  class BackController extends ApplicationController {
    back = "";
    async show(): Promise<void> {
      this.back = this.viewContext().urlFor(":back");
      this.head("ok");
    }
  }

  it("answers respond_to? without negotiating MimeResponds#respond_to", async () => {
    const controller = new BackController();
    await controller.dispatch("show", makeRequest(), new Response());
    expect(rbObjRespondTo(controller, "request")).toBe(true);
  });

  it("lets the view context answer url_for(:back) with the referer", async () => {
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_REFERER: "http://localhost/previous",
    });
    const controller = new BackController();
    await controller.dispatch("show", request, new Response());
    expect(controller.back).toBe("http://localhost/previous");
  });
});

describe("ActionController::Streaming#_render_template", () => {
  class StreamController extends ApplicationController {
    async show(): Promise<void> {
      await this.render({ partial: "row", stream: true });
    }
  }
  StreamController.prependViewPath(
    new FixtureResolver({ "stream/_row.html.html": "streamed row" }),
  );

  it("renders a stream: true template through view_renderer.render_body with no-cache", async () => {
    const controller = new StreamController();
    const renderBody = vi.spyOn(controller.viewRenderer(), "renderBody");
    await controller.dispatch("show", makeRequest(), new Response());
    expect(renderBody).toHaveBeenCalledOnce();
    expect(controller.responseBody).toBe("streamed row");
    expect(controller.response.getHeader("cache-control")).toBe("no-cache");
  });
});

describe("ActionController::Base bare render", () => {
  class BareController extends ApplicationController {
    async index(): Promise<void> {
      await this.render();
    }
  }

  it("raises MissingTemplate for a bare render with no view paths", async () => {
    await expect(
      new BareController().dispatch("index", makeRequest(), new Response()),
    ).rejects.toBeInstanceOf(MissingTemplate);
  });
});
