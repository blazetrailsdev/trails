import { describe, it, expect } from "vitest";
import { Base, DoubleRenderError } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";
import { redirectTo, redirectBack } from "../../actiondispatch/redirect.js";

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
describe("RedirectTest", () => {
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

  it("simple redirect", () => {
    const result = redirectTo("http://example.com/posts");
    expect(result.status).toBe(302);
    expect(result.location).toBe("http://example.com/posts");
    expect(result.body).toContain("redirected");
  });

  it("redirect with header break", () => {
    expect(() => redirectTo("http://example.com\r\ninjection")).toThrow(/header break/);
  });

  it("redirect with null bytes", () => {
    expect(() => redirectTo("http://example.com\0evil")).toThrow(/null bytes/);
  });

  it("redirect with no status", () => {
    const result = redirectTo("/posts");
    expect(result.status).toBe(302);
  });

  it("redirect with status", () => {
    const result = redirectTo("/posts", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("redirect with status hash", () => {
    const result = redirectTo("/posts", { status: 307 });
    expect(result.status).toBe(307);
  });

  it("redirect with protocol", () => {
    const result = redirectTo("https://example.com/posts");
    expect(result.location).toBe("https://example.com/posts");
  });

  it("url redirect with status", () => {
    const result = redirectTo("http://example.com/", { status: 301 });
    expect(result.status).toBe(301);
    expect(result.location).toBe("http://example.com/");
  });

  it("url redirect with status hash", () => {
    const result = redirectTo("http://example.com/", { status: 303 });
    expect(result.status).toBe(303);
  });

  it("relative url redirect with status", () => {
    const result = redirectTo("/relative/path", { status: 301 });
    expect(result.status).toBe(301);
    expect(result.location).toBe("/relative/path");
  });

  it("relative url redirect with status hash", () => {
    const result = redirectTo("/foo", { status: 307 });
    expect(result.status).toBe(307);
  });

  it("relative url redirect host with port", () => {
    const result = redirectTo("http://example.com:3000/foo");
    expect(result.location).toBe("http://example.com:3000/foo");
  });

  it("simple redirect using options", () => {
    const result = redirectTo("/dashboard", { status: 302 });
    expect(result.status).toBe(302);
    expect(result.location).toBe("/dashboard");
  });

  it("module redirect", () => {
    const result = redirectTo("/admin/dashboard");
    expect(result.location).toBe("/admin/dashboard");
  });

  it("module redirect using options", () => {
    const result = redirectTo("/admin/dashboard", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("redirect to url", () => {
    const result = redirectTo("http://www.example.com");
    expect(result.location).toBe("http://www.example.com");
  });

  it("redirect to url with unescaped query string", () => {
    const result = redirectTo("http://example.com?a=1&b=2");
    expect(result.location).toBe("http://example.com?a=1&b=2");
  });

  it("redirect to url with complex scheme", () => {
    const result = redirectTo("data:text/html,test");
    expect(result.location).toBe("data:text/html,test");
  });

  it("redirect to url with network path reference", () => {
    const result = redirectTo("//cdn.example.com/file.js");
    expect(result.location).toBe("//cdn.example.com/file.js");
  });

  it("redirect back", () => {
    const result = redirectBack({
      referer: "http://example.com/prev",
      fallbackLocation: "/",
    });
    expect(result.location).toBe("http://example.com/prev");
  });

  it("redirect back with no referer", () => {
    const result = redirectBack({
      fallbackLocation: "/",
    });
    expect(result.location).toBe("/");
  });

  it("redirect back with no referer redirects to another host", () => {
    const result = redirectBack({
      fallbackLocation: "http://other.com/",
    });
    expect(result.location).toBe("http://other.com/");
  });

  it("safe redirect back from other host", () => {
    const result = redirectBack({
      referer: "http://evil.com/attack",
      fallbackLocation: "/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("/");
  });

  it("safe redirect back from the same host", () => {
    const result = redirectBack({
      referer: "http://example.com/prev",
      fallbackLocation: "/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("http://example.com/prev");
  });

  it("safe redirect back with no referer", () => {
    const result = redirectBack({
      fallbackLocation: "/fallback",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("/fallback");
  });

  it("safe redirect back with no referer redirects to another host", () => {
    const result = redirectBack({
      fallbackLocation: "http://other.com/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("http://other.com/");
  });

  it("safe redirect to root", () => {
    const result = redirectTo("/");
    expect(result.location).toBe("/");
    expect(result.status).toBe(302);
  });

  it("redirect back with explicit fallback kwarg", () => {
    const result = redirectBack({
      fallbackLocation: "/dashboard",
    });
    expect(result.location).toBe("/dashboard");
  });

  it("redirect body contains escaped html", () => {
    const result = redirectTo("/test<script>");
    expect(result.body).not.toContain("<script>");
    expect(result.body).toContain("&lt;script&gt;");
  });

  it("redirect to url with stringlike", () => {
    const url = new URL("http://example.com/path");
    const result = redirectTo(url);
    expect(result.location).toBe("http://example.com/path");
  });

  it("redirect to nil", () => {
    expect(() => redirectTo(null)).toThrow("Cannot redirect to nil!");
  });

  it("redirect to params", () => {
    const result = redirectTo("/posts?page=2");
    expect(result.location).toBe("/posts?page=2");
  });

  it("unsafe redirect", () => {
    const result = redirectTo("http://evil.com/attack");
    expect(result.location).toBe("http://evil.com/attack");
  });

  it("unsafe redirect back", () => {
    const result = redirectBack({
      referer: "http://evil.com/attack",
      fallbackLocation: "/",
      allowOtherHost: true,
    });
    expect(result.location).toBe("http://evil.com/attack");
  });

  it("only path redirect", () => {
    const result = redirectTo("/only/this/path");
    expect(result.location).toBe("/only/this/path");
    expect(result.status).toBe(302);
  });

  it("redirect to external with rescue", async () => {
    class C extends Base {
      async action() {
        this.redirectTo("http://external.com");
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.getHeader("location")).toBe("http://external.com");
    expect(c.status).toBe(302);
  });
});

// ==========================================================================
// controller/redirect_test.rb — ModuleRedirectTest
// ==========================================================================
describe("ModuleRedirectTest", () => {
  it("simple redirect", () => {
    const result = redirectTo("/module/dashboard");
    expect(result.location).toBe("/module/dashboard");
    expect(result.status).toBe(302);
  });

  it("simple redirect using options", () => {
    const result = redirectTo("/module/dashboard", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("module redirect", () => {
    const result = redirectTo("/admin/module/dashboard");
    expect(result.location).toBe("/admin/module/dashboard");
  });

  it("module redirect using options", () => {
    const result = redirectTo("/admin/module/dashboard", { status: 307 });
    expect(result.status).toBe(307);
  });
});
