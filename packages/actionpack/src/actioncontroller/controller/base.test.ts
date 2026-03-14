import { describe, it, expect } from "vitest";
import { Base, API, DoubleRenderError } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

// ==========================================================================
// action_controller/base_test.rb — Rendering
// ==========================================================================
describe("ControllerInstanceTests", () => {
  it("render json", async () => {
    class JsonController extends Base {
      async index() {
        this.render({ json: { hello: "world" } });
      }
    }
    const c = new JsonController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe('{"hello":"world"}');
    expect(c.contentType).toBe("application/json; charset=utf-8");
  });

  it("render json string", async () => {
    class JsonStringController extends Base {
      async index() {
        this.render({ json: '{"raw":true}' });
      }
    }
    const c = new JsonStringController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe('{"raw":true}');
  });

  it("render plain", async () => {
    class PlainController extends Base {
      async index() {
        this.render({ plain: "hello" });
      }
    }
    const c = new PlainController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("hello");
    expect(c.contentType).toBe("text/plain; charset=utf-8");
  });

  it("render html", async () => {
    class HtmlController extends Base {
      async index() {
        this.render({ html: "<h1>Hi</h1>" });
      }
    }
    const c = new HtmlController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<h1>Hi</h1>");
    expect(c.contentType).toBe("text/html; charset=utf-8");
  });

  it("render body", async () => {
    class BodyController extends Base {
      async index() {
        this.render({ body: "raw body" });
      }
    }
    const c = new BodyController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("raw body");
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("render text", async () => {
    class TextController extends Base {
      async index() {
        this.render({ text: "text content" });
      }
    }
    const c = new TextController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("text content");
    expect(c.contentType).toBe("text/plain; charset=utf-8");
  });

  it("render with status", async () => {
    class StatusController extends Base {
      async index() {
        this.render({ json: { ok: true }, status: 201 });
      }
    }
    const c = new StatusController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });

  it("render with status symbol", async () => {
    class StatusSymController extends Base {
      async index() {
        this.render({ json: {}, status: "created" });
      }
    }
    const c = new StatusSymController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });

  it("render with custom content type", async () => {
    class CustomCtController extends Base {
      async index() {
        this.render({ plain: "data", contentType: "text/csv" });
      }
    }
    const c = new CustomCtController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.contentType).toBe("text/csv");
  });

  it("render implicit (no options) renders empty html", async () => {
    class ImplicitController extends Base {
      async index() {
        this.render();
      }
    }
    const c = new ImplicitController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.contentType).toBe("text/html; charset=utf-8");
  });

  it("render with template resolver", async () => {
    class TemplateController extends Base {
      async index() {
        this.render();
      }
    }
    TemplateController.templateResolver = (controller, action, _format) => {
      return `<p>${controller}#${action}</p>`;
    };

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<p>template#index</p>");
  });

  it("double render throws DoubleRenderError", async () => {
    class DoubleController extends Base {
      async index() {
        this.render({ plain: "first" });
        this.render({ plain: "second" });
      }
    }
    const c = new DoubleController();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(
      DoubleRenderError,
    );
  });

  it("renderToString does not commit the response", async () => {
    class RtsController extends Base {
      result = "";
      async index() {
        this.result = this.renderToString({ plain: "preview" });
        this.render({ plain: "final" });
      }
    }
    const c = new RtsController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.result).toBe("preview");
    expect(c.body).toBe("final");
  });
});

// ==========================================================================
// action_controller/base_test.rb — Redirecting
// ==========================================================================
describe("ActionController::Base redirecting", () => {
  it("redirectTo sets location and 302", async () => {
    class RedirectController extends Base {
      async index() {
        this.redirectTo("/other");
      }
    }
    const c = new RedirectController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(302);
    expect(c.getHeader("location")).toBe("/other");
    expect(c.performed).toBe(true);
  });

  it("redirectTo with custom status", async () => {
    class RedirectStatusController extends Base {
      async index() {
        this.redirectTo("/moved", { status: 301 });
      }
    }
    const c = new RedirectStatusController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(301);
  });

  it("redirectTo with symbol status", async () => {
    class RedirectSymController extends Base {
      async index() {
        this.redirectTo("/see", { status: "see_other" });
      }
    }
    const c = new RedirectSymController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(303);
  });

  it("redirect then render throws DoubleRenderError", async () => {
    class DoubleRedirectController extends Base {
      async index() {
        this.redirectTo("/a");
        this.render({ plain: "oops" });
      }
    }
    const c = new DoubleRedirectController();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(
      DoubleRenderError,
    );
  });

  it("redirectBack uses referer", async () => {
    class RedirectBackController extends Base {
      async index() {
        this.redirectBack({ fallbackLocation: "/fallback" });
      }
    }
    const c = new RedirectBackController();
    const req = makeRequest({ HTTP_REFERER: "/previous" });
    await c.dispatch("index", req, makeResponse());
    expect(c.getHeader("location")).toBe("/previous");
  });

  it("redirectBack uses fallback when no referer", async () => {
    class RedirectBackFallController extends Base {
      async index() {
        this.redirectBack({ fallbackLocation: "/fallback" });
      }
    }
    const c = new RedirectBackFallController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("location")).toBe("/fallback");
  });
});

// ==========================================================================
// action_controller/base_test.rb — Flash
// ==========================================================================
describe("ActionController::Base flash", () => {
  it("notice sets flash notice", () => {
    const c = new (class extends Base {})();
    c.notice = "Success!";
    expect(c.flash.notice).toBe("Success!");
    expect(c.notice).toBe("Success!");
  });

  it("alert sets flash alert", () => {
    const c = new (class extends Base {})();
    c.alert = "Danger!";
    expect(c.flash.alert).toBe("Danger!");
    expect(c.alert).toBe("Danger!");
  });
});

// ==========================================================================
// action_controller/base_test.rb — Rescue
// ==========================================================================
describe("ActionController::Base rescue_from", () => {
  it("rescues from a specific error class", async () => {
    class CustomError extends Error {
      name = "CustomError";
    }
    class RescueController extends Base {
      async index() {
        throw new CustomError("boom");
      }
    }
    let rescued = false;
    class RescueController2 extends Base {
      async index() {
        throw new CustomError("boom");
      }
    }
    RescueController2.rescueFrom(CustomError, () => {
      rescued = true;
    });

    const c = new RescueController2();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(rescued).toBe(true);
  });

  it("does not rescue unregistered errors", async () => {
    class SpecificError extends Error {
      name = "SpecificError";
    }
    class OtherError extends Error {
      name = "OtherError";
    }
    class NoRescueController extends Base {
      async index() {
        throw new OtherError("nope");
      }
    }
    NoRescueController.rescueFrom(SpecificError, () => {});

    const c = new NoRescueController();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(OtherError);
  });

  it("child inherits rescue handlers", async () => {
    class AppError extends Error {
      name = "AppError";
    }
    class ParentRescue extends Base {
      async index() {
        throw new AppError("parent");
      }
    }
    let handled = false;
    ParentRescue.rescueFrom(AppError, () => {
      handled = true;
    });

    class ChildRescue extends ParentRescue {}

    const c = new ChildRescue();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(handled).toBe(true);
  });
});

// ==========================================================================
// action_controller/base_test.rb — Caching / Conditional GET
// ==========================================================================
describe("ActionController::Base conditional GET", () => {
  it("freshWhen sets etag header", async () => {
    class FreshController extends Base {
      async index() {
        this.freshWhen({ etag: "test-data" });
        if (!this.performed) {
          this.render({ plain: "fresh" });
        }
      }
    }
    const c = new FreshController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("etag")).toMatch(/^W\/"[a-f0-9]+"/);
  });

  it("freshWhen sets last-modified header", async () => {
    const date = new Date("2024-01-01T00:00:00Z");
    class LmController extends Base {
      async index() {
        this.freshWhen({ lastModified: date });
        if (!this.performed) {
          this.render({ plain: "ok" });
        }
      }
    }
    const c = new LmController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("last-modified")).toBe(date.toUTCString());
  });

  it("freshWhen returns 304 when etag matches", async () => {
    class Match304Controller extends Base {
      async index() {
        this.freshWhen({ etag: "match-me" });
        if (!this.performed) {
          this.render({ plain: "content" });
        }
      }
    }
    // First, get the etag
    const c1 = new Match304Controller();
    await c1.dispatch("index", makeRequest(), makeResponse());
    const etag = c1.getHeader("etag")!;

    // Second request with If-None-Match
    const c2 = new Match304Controller();
    const req = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_IF_NONE_MATCH: etag,
    });
    await c2.dispatch("index", req, makeResponse());
    expect(c2.status).toBe(304);
  });

  it("stale returns true when content needs re-render", async () => {
    let staleResult: boolean | undefined;
    class StaleController extends Base {
      async index() {
        staleResult = this.stale({ etag: "stale-test" });
        if (staleResult) {
          this.render({ plain: "rendered" });
        }
      }
    }
    const c = new StaleController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(staleResult).toBe(true);
  });

  it("expiresIn sets cache-control header", () => {
    const c = new (class extends Base {})();
    c.expiresIn(3600, { public: true, mustRevalidate: true });
    expect(c.getHeader("cache-control")).toBe("max-age=3600, public, must-revalidate");
  });

  it("expiresNow sets no-cache", () => {
    const c = new (class extends Base {})();
    c.expiresNow();
    expect(c.getHeader("cache-control")).toBe("no-cache");
  });
});

// ==========================================================================
// action_controller/base_test.rb — Send Data
// ==========================================================================
describe("ActionController::Base sendData", () => {
  it("sends data with filename", () => {
    const c = new (class extends Base {})();
    c.sendData("csv,data", { filename: "export.csv", type: "text/csv" });
    expect(c.body).toBe("csv,data");
    expect(c.contentType).toBe("text/csv");
    expect(c.getHeader("content-disposition")).toBe('attachment; filename="export.csv"');
    expect(c.performed).toBe(true);
  });

  it("sends data with custom disposition", () => {
    const c = new (class extends Base {})();
    c.sendData("inline-data", { disposition: "inline", filename: "doc.pdf" });
    expect(c.getHeader("content-disposition")).toBe('inline; filename="doc.pdf"');
  });

  it("sends data without filename", () => {
    const c = new (class extends Base {})();
    c.sendData("raw");
    expect(c.body).toBe("raw");
    expect(c.contentType).toBe("application/octet-stream");
  });
});

// ==========================================================================
// action_controller/api_test.rb
// ==========================================================================
describe("ActionController::API", () => {
  it("renders json", async () => {
    class ApiController extends API {
      async index() {
        this.render({ json: { status: "ok" } });
      }
    }
    const c = new ApiController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe('{"status":"ok"}');
    expect(c.contentType).toBe("application/json; charset=utf-8");
  });

  it("renders plain text", async () => {
    class ApiPlainController extends API {
      async index() {
        this.render({ plain: "hello api" });
      }
    }
    const c = new ApiPlainController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("hello api");
  });

  it("renders body", async () => {
    class ApiBodyController extends API {
      async index() {
        this.render({ body: "raw" });
      }
    }
    const c = new ApiBodyController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("raw");
  });

  it("render with status", async () => {
    class ApiStatusController extends API {
      async index() {
        this.render({ json: {}, status: "created" });
      }
    }
    const c = new ApiStatusController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });

  it("double render throws", async () => {
    class ApiDoubleController extends API {
      async index() {
        this.render({ json: {} });
        this.render({ json: {} });
      }
    }
    const c = new ApiDoubleController();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(
      DoubleRenderError,
    );
  });

  it("redirectTo sets location and empty body", async () => {
    class ApiRedirectController extends API {
      async index() {
        this.redirectTo("/api/v2");
      }
    }
    const c = new ApiRedirectController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(302);
    expect(c.getHeader("location")).toBe("/api/v2");
    expect(c.body).toBe("");
  });

  it("redirectTo with custom status", async () => {
    class ApiRedirect301Controller extends API {
      async index() {
        this.redirectTo("/api/v2", { status: 301 });
      }
    }
    const c = new ApiRedirect301Controller();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(301);
  });

  it("redirect then render throws", async () => {
    class ApiDoubleRedController extends API {
      async index() {
        this.redirectTo("/a");
        this.render({ json: {} });
      }
    }
    const c = new ApiDoubleRedController();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(
      DoubleRenderError,
    );
  });
});

// ==========================================================================
// DoubleRenderError
// ==========================================================================
describe("DoubleRenderError", () => {
  it("has correct name", () => {
    const err = new DoubleRenderError();
    expect(err.name).toBe("DoubleRenderError");
  });

  it("has default message", () => {
    const err = new DoubleRenderError();
    expect(err.message).toContain("Render and/or redirect");
  });

  it("accepts custom message", () => {
    const err = new DoubleRenderError("custom");
    expect(err.message).toBe("custom");
  });
});
