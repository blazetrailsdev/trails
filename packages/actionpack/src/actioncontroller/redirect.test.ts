import { describe, it, expect } from "vitest";
import { Base, DoubleRenderError } from "./base.js";
import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";

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
// action_controller/redirect_test.rb
// ==========================================================================
describe("ActionController redirecting", () => {
  it("redirect_to with path", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/posts");
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(302);
    expect(c.getHeader("location")).toBe("/posts");
  });

  it("redirect_to with full URL", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("https://example.com/other");
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("location")).toBe("https://example.com/other");
  });

  it("redirect_to with 301", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/new", { status: 301 });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(301);
  });

  it("redirect_to with see_other", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/done", { status: "see_other" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(303);
  });

  it("redirect_to sets HTML body with link", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/target");
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toContain("/target");
    expect(c.body).toContain("redirected");
    expect(c.contentType).toBe("text/html; charset=utf-8");
  });

  it("redirect_to marks as performed", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/target");
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.performed).toBe(true);
  });

  it("redirect_back uses referer", async () => {
    class C extends Base {
      async index() {
        this.redirectBack({ fallbackLocation: "/fallback" });
      }
    }
    const c = new C();
    const req = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_REFERER: "/previous-page",
    });
    await c.dispatch("index", req, makeResponse());
    expect(c.getHeader("location")).toBe("/previous-page");
  });

  it("redirect_back uses fallback when no referer", async () => {
    class C extends Base {
      async index() {
        this.redirectBack({ fallbackLocation: "/home" });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("location")).toBe("/home");
  });

  it("redirect_back with custom status", async () => {
    class C extends Base {
      async index() {
        this.redirectBack({ fallbackLocation: "/", status: 303 });
      }
    }
    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.status).toBe(303);
  });

  it("redirect then redirect throws", async () => {
    class C extends Base {
      async index() {
        this.redirectTo("/a");
        this.redirectTo("/b");
      }
    }
    const c = new C();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(
      DoubleRenderError,
    );
  });

  it("redirect in before_action prevents action", async () => {
    const log: string[] = [];
    class C extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    C.beforeAction((controller) => {
      (controller as Base).redirectTo("/login");
      return false;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.getHeader("location")).toBe("/login");
    expect(log).toEqual([]);
  });
});
