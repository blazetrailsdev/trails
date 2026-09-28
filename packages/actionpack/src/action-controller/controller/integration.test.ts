import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bodyFromString, Lint, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  assertIncludes,
  assertNotIncludes,
  include,
  underscore,
  type Included,
} from "@blazetrails/activesupport";
import { Module, NoMethodError, rbFSend, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { XML } from "@blazetrails/nokogiri";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import { Base } from "../base.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import { X_CASCADE } from "../../action-dispatch/constants.js";
import { Metal } from "../metal.js";
import type { MountableApp, RouteOptions } from "../../action-dispatch/routing/mapper.js";
import { CookieAssertions, SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

afterEach(() => vi.restoreAllMocks());

describe("SessionTest", () => {
  const StubApp = (_env: RackEnv): RackResponse => [
    200,
    { "Content-Type": "text/html", "Content-Length": "13" },
    bodyFromString("Hello, World!"),
  ];

  let session: IntegrationTest;

  beforeEach(() => {
    session = new IntegrationTest();
    session.app = StubApp;
  });

  it("https bang works and sets truth by default", () => {
    expect(session.isHttps()).toBe(false);
    session.httpsBang();
    expect(session.isHttps()).toBe(true);
    session.httpsBang(false);
    expect(session.isHttps()).toBe(false);
  });

  it("host!", () => {
    expect(session.host).not.toBe("glu.ttono.us");
    session.hostBang("rubyonrails.com");
    expect(session.host).toBe("rubyonrails.com");
  });

  it("follow redirect raises when no redirect", async () => {
    vi.spyOn(session, "isRedirect", "get").mockReturnValue(false);
    await expect(session.followRedirectBang()).rejects.toThrow(Error);
  });

  it("get", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.get(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("GET", path, { params, headers });
  });

  it("get with env and headers", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    const env = { HTTP_X_REQUESTED_WITH: "XMLHttpRequest" };
    await session.get(path, { params, headers, env });
    expect(spy).toHaveBeenCalledWith("GET", path, { params, headers, env });
  });

  it("post", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.post(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("POST", path, { params, headers });
  });

  it("patch", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.patch(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("PATCH", path, { params, headers });
  });

  it("put", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.put(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("PUT", path, { params, headers });
  });

  it("delete", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.delete(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("DELETE", path, { params, headers });
  });

  it("head", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.head(path, { params, headers });
    expect(spy).toHaveBeenCalledWith("HEAD", path, { params, headers });
  });

  it("xml http request get", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.get(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("GET", path, { params, headers, xhr: true });
  });

  it("xml http request post", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.post(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("POST", path, { params, headers, xhr: true });
  });

  it("xml http request patch", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.patch(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("PATCH", path, { params, headers, xhr: true });
  });

  it("xml http request put", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.put(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("PUT", path, { params, headers, xhr: true });
  });

  it("xml http request delete", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.delete(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("DELETE", path, { params, headers, xhr: true });
  });

  it("xml http request head", async () => {
    const spy = vi.spyOn(session, "process").mockResolvedValue(0);
    const path = "/index";
    const params = { q: "blah" };
    const headers = { location: "blah" };
    await session.head(path, { params, headers, xhr: true });
    expect(spy).toHaveBeenCalledWith("HEAD", path, { params, headers, xhr: true });
  });
});

describe("IntegrationTestTest", () => {
  let test: IntegrationTest;

  beforeEach(() => {
    test = new IntegrationTest();
  });

  it("opens new session", () => {
    const session1 = test.openSession((_sess) => {});
    const session2 = test.openSession();

    expect(session1 === session2).toBeFalsy();
  });

  it("child session assertions bubble up to root", () => {
    const assertionsBefore = test.assertions;
    test.openSession().assertions += 1;
    expect(test.assertions - assertionsBefore).toBe(1);
  });

  it("does not prevent method missing passing up to ancestors", () => {
    const mixin = new Module((mod) => {
      mod.defineMethod("methodMissing", (name: string) => {
        if (name === "foo") return "pass";
        throw new NoMethodError(`undefined method '${name}'`, name);
      });
    });
    include(test.constructor as typeof IntegrationTest, mixin);
    try {
      expect(rbFSend(test, "foo")).toBe("pass");
    } finally {
      mixin.removeMethod("methodMissing");
    }
  });
});

class RackLintIntegrationTest extends IntegrationTest {
  override get app(): unknown {
    return (this._app ??= IntegrationTest.buildApp(this.routes, (middleware) => {
      middleware.unshift(Lint);
    }));
  }

  override set app(value: unknown) {
    this._app = value;
  }
}

describe("RackLintIntegrationTest", () => {
  it("integration test follows rack SPEC", async () => {
    const t = new RackLintIntegrationTest();
    await t.withRouting(async (set: RouteSet) => {
      set.draw((r) => {
        r.get("/", { to: (_: RackEnv): RackResponse => [200, {}, bodyFromString("")] });
      });

      await t.get("/");

      expect(t.status).toBe(200);
    });
  });
});

describe("IntegrationTestUsesCorrectClass", () => {
  it("integration methods called", async () => {
    const t = new IntegrationTest();
    t.resetBang();
    const headers = { Origin: "*" };

    for (const verb of ["get", "post", "head", "patch", "put", "delete", "options"] as const) {
      await expect(t[verb]("/", { headers })).resolves.not.toThrow();
    }
  });
});

class IntegrationController extends Base {
  declare actionUrl: (...args: unknown[]) => string;

  async get(): Promise<void> {
    await this.respondTo((format) => {
      format.html(() => this.render({ plain: "OK", status: 200 }));
      format.js(() => this.render({ plain: "JS OK", status: 200 }));
      format.json(() => this.render({ json: "JSON OK", status: 200 }));
      format.xml(() => this.render({ xml: "<root></root>", status: 200 }));
      format.rss(() => this.render({ xml: "<root></root>", status: 200 }));
      format.atom(() => this.render({ xml: "<root></root>", status: 200 }));
    });
  }

  async getWithVarySetXRequestedWith(): Promise<void> {
    await this.respondTo((format) => {
      format.json(() => {
        this.response.headers.set("Vary", "X-Requested-With");
        return this.render({ json: "JSON OK", status: 200 });
      });
    });
  }

  async getWithParams(): Promise<void> {
    await this.render({ plain: `foo: ${this.params.get("foo")}`, status: 200 });
  }

  async post(): Promise<void> {
    await this.render({ plain: "Created", status: 201 });
  }

  async method(): Promise<void> {
    await this.render({ plain: `method: ${this.request.method.toLowerCase()}` });
  }

  async cookieMonster(): Promise<void> {
    this.cookies().set("cookie_1", null);
    this.cookies().set("cookie_3", "chocolate");
    await this.render({ plain: "Gone", status: 410 });
  }

  async setCookie(): Promise<void> {
    this.cookies().set("foo", "bar");
    this.head("ok");
  }

  async getCookie(): Promise<void> {
    await this.render({ plain: this.cookies().get("foo") });
  }

  async redirect(): Promise<void> {
    this.redirectTo(this.actionUrl("get"));
  }

  async redirect307(): Promise<void> {
    this.redirectTo(this.actionUrl("post"), { status: 307 });
  }

  async redirect308(): Promise<void> {
    this.redirectTo(this.actionUrl("post"), { status: 308 });
  }

  async removeHeader(): Promise<void> {
    this.response.headers.delete(this.params.get("header") as string);
    this.head("ok", { c: "3" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include CookieAssertions`
class IntegrationProcessTest extends IntegrationTest {
  static IntegrationController = IntegrationController;

  async withDefaultHeaders<T>(
    headers: Record<string, string>,
    block: () => Promise<T>,
  ): Promise<T> {
    const original = Response.defaultHeaders;
    Response.defaultHeaders = headers;
    try {
      return await block();
    } finally {
      Response.defaultHeaders = original;
    }
  }

  async withTestRouteSet<T>(block: () => Promise<T>): Promise<T> {
    const oldIntegrationSession = { ...this };
    try {
      return await this.withRouting(async (set: RouteSet) => {
        const https = this.isHttps();
        const host = this.host;
        this.resetBang();
        this.httpsBang(https);
        this.hostBang(host);
        const controller = class extends IntegrationProcessTest.IntegrationController {};
        include(controller, set.urlHelpers());
        const to = controller as unknown as MountableApp;

        set.draw((r) => {
          r.get("moved", { to: r.redirect("/method") });

          deprecator().silence(() => {
            r.match(":action", { to, via: ["get", "post"], as: "action" });
            r.get("get/:action", { to, as: "get_action" });
          });
        });
        include(rbObjSingletonClass(this) as typeof IntegrationProcessTest, set.urlHelpers());
        return await block();
      });
    } finally {
      const { request, response, controller, _htmlDocument } = this;
      Object.assign(this, oldIntegrationSession, { request, response, controller, _htmlDocument });
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include CookieAssertions`; the merge is how `include()` types it
interface IntegrationProcessTest extends Included<typeof CookieAssertions> {}
include(IntegrationProcessTest, CookieAssertions);

describe("IntegrationProcessTest", () => {
  let t: IntegrationProcessTest;
  const assertResponse = (type: number | string): void => t.assertResponse(type);
  const assertRedirectedTo = (url: string): void => t.assertRedirectedTo(url);
  const assertSetCookieHeader = (expected: string, header?: string): void =>
    t.assertSetCookieHeader(expected, header);

  beforeEach(() => {
    t = new IntegrationProcessTest();
  });

  it.skip("get", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get");
      expect(t.status).toBe(200);
      expect(t.statusMessage).toBe("OK");
      assertResponse(200);
      assertResponse("success");
      assertResponse("ok");
      expect(t.cookies.toHash()).toEqual({});
      expect(t.body).toBe("OK");
      expect(t.response.body).toBe("OK");
      expect(t.htmlDocument).toBeInstanceOf(XML.Document);
      expect(t.requestCount).toBe(1);
    });
  });

  it("get xml rss atom", async () => {
    for (const mimeString of ["application/xml", "application/rss+xml", "application/atom+xml"]) {
      await t.withTestRouteSet(async () => {
        await t.get("/get", { headers: { HTTP_ACCEPT: mimeString } });
        expect(t.status).toBe(200);
        expect(t.statusMessage).toBe("OK");
        assertResponse(200);
        assertResponse("success");
        assertResponse("ok");
        expect(t.cookies.toHash()).toEqual({});
        expect(t.body).toBe("<root></root>");
        expect(t.response.body).toBe("<root></root>");
        expect(t.htmlDocument.constructor).toBe(XML.Document);
        expect(t.requestCount).toBe(1);
      });
    }
  });

  it.skip("post", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/post");
      expect(t.status).toBe(201);
      expect(t.statusMessage).toBe("Created");
      assertResponse(201);
      assertResponse("success");
      assertResponse("created");
      expect(t.cookies.toHash()).toEqual({});
      expect(t.body).toBe("Created");
      expect(t.response.body).toBe("Created");
      expect(t.htmlDocument).toBeInstanceOf(XML.Document);
      expect(t.requestCount).toBe(1);
    });
  });

  it("response cookies are added to the cookie jar for the next request", async () => {
    await t.withTestRouteSet(async () => {
      t.cookies.set("cookie_1", "sugar");
      t.cookies.set("cookie_2", "oatmeal");
      await t.get("/cookieMonster");
      assertSetCookieHeader(
        "cookie_1=; path=/\ncookie_3=chocolate; path=/",
        t.headers!.get("Set-Cookie"),
      );
      expect(t.cookies.toHash()).toEqual({
        cookie_1: "",
        cookie_2: "oatmeal",
        cookie_3: "chocolate",
      });
    });
  });

  it("cookie persist to next request", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/setCookie");
      assertResponse("success");

      expect(t.headers!.get("Set-Cookie")).toBe("foo=bar; path=/");
      expect(t.cookies.toHash()).toEqual({ foo: "bar" });

      await t.get("/getCookie");
      assertResponse("success");
      expect(t.body).toBe("bar");

      expect(t.headers!.get("Set-Cookie")).toBeUndefined();
      expect(t.cookies.toHash()).toEqual({ foo: "bar" });
    });
  });

  it("cookie persist to next request on another domain", async () => {
    await t.withTestRouteSet(async () => {
      t.hostBang("37s.backpack.test");

      await t.get("/setCookie");
      assertResponse("success");

      expect(t.headers!.get("Set-Cookie")).toBe("foo=bar; path=/");
      expect(t.cookies.toHash()).toEqual({ foo: "bar" });

      await t.get("/getCookie");
      assertResponse("success");
      expect(t.body).toBe("bar");

      expect(t.headers!.get("Set-Cookie")).toBeUndefined();
      expect(t.cookies.toHash()).toEqual({ foo: "bar" });
    });
  });

  it.skip("redirect", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/redirect");
      expect(t.status).toBe(302);
      expect(t.statusMessage).toBe("Found");
      assertResponse(302);
      assertResponse("redirect");
      assertResponse("found");
      expect(t.response.body).toBe("");
      expect(t.htmlDocument).toBeInstanceOf(XML.Document);
      expect(t.requestCount).toBe(1);

      await t.followRedirectBang();
      expect(t.request.referer).toBe("http://www.example.com/redirect");
      assertResponse("success");
      expect(t.path).toBe("/get");

      await t.get("/moved");
      assertResponse("redirect");
      assertRedirectedTo("/method");
    });
  });

  it("307 redirect uses the same http verb", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/redirect307");
      expect(t.status).toBe(307);
      await t.followRedirectBang();
      expect(t.request.method).toBe("POST");
    });
  });

  it("308 redirect uses the same http verb", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/redirect308");
      expect(t.status).toBe(308);
      await t.followRedirectBang();
      expect(t.request.method).toBe("POST");
    });
  });

  it.skip("redirect reset html document", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/redirect");
      const previousHtmlDocument = t.htmlDocument;

      await t.followRedirectBang();

      assertResponse("ok");
      expect(t.htmlDocument).not.toBe(previousHtmlDocument);
    });
  });

  it("redirect with arguments", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/redirect");
      await t.followRedirectBang({ params: { foo: "bar" } });

      assertResponse("ok");
      expect(t.request.parameters["foo"]).toBe("bar");
    });
  });

  it("xml http request get", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get", { xhr: true });
      expect(t.status).toBe(200);
      expect(t.statusMessage).toBe("OK");
      assertResponse(200);
      assertResponse("success");
      assertResponse("ok");
      expect(t.response.body).toBe("JS OK");
    });
  });

  it("request with bad format", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get.php", { xhr: true });
      expect(t.status).toBe(406);
      assertResponse(406);
      assertResponse("not_acceptable");
    });
  });

  it("creation of multiple integration sessions", () => {
    void t.integrationSession;
    const a = t.openSession();
    const b = t.openSession();

    expect(a.integrationSession).not.toBe(b.integrationSession);
  });

  it("get with query string", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/getWithParams?foo=bar");
      expect(t.request.env["REQUEST_URI"]).toBe("/getWithParams?foo=bar");
      expect(t.request.fullpath).toBe("/getWithParams?foo=bar");
      expect(t.request.env["QUERY_STRING"]).toBe("foo=bar");
      expect(t.request.queryString).toBe("foo=bar");
      expect(t.request.parameters["foo"]).toBe("bar");

      expect(t.status).toBe(200);
      expect(t.response.body).toBe("foo: bar");
    });
  });

  it("get with parameters", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/getWithParams", { params: { foo: "bar" } });
      expect(t.request.env["PATH_INFO"]).toBe("/getWithParams");
      expect(t.request.pathInfo).toBe("/getWithParams");
      expect(t.request.env["QUERY_STRING"]).toBe("foo=bar");
      expect(t.request.queryString).toBe("foo=bar");
      expect(t.request.parameters["foo"]).toBe("bar");

      expect(t.status).toBe(200);
      expect(t.response.body).toBe("foo: bar");
    });
  });

  it("post then get with parameters do not leak across requests", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/post", { params: { leaks: "does-leak?" } });

      await t.get("/getWithParams", { params: { foo: "bar" } });

      const input = t.request.env["rack.input"] as { read(): string } | null | undefined;
      expect(input == null || input.read() === "").toBeTruthy();
      expect(t.request.env["QUERY_STRING"]).toBe("foo=bar");
      expect(t.request.queryString).toBe("foo=bar");
      expect(t.request.parameters["foo"]).toBe("bar");
      expect(t.request.parameters["leaks"] == null).toBeTruthy();
    });
  });

  it("head", async () => {
    await t.withTestRouteSet(async () => {
      await t.head("/get");
      expect(t.status).toBe(200);
      expect(t.body).toBe("");

      await t.head("/post");
      expect(t.status).toBe(201);
      expect(t.body).toBe("");

      await t.get("/get/method");
      expect(t.status).toBe(200);
      expect(t.body).toBe("method: get");

      await t.head("/get/method");
      expect(t.status).toBe(200);
      expect(t.body).toBe("");
    });
  });

  it("generate url with controller", () => {
    expect(t.urlFor({ controller: "foo" })).toBe("http://www.example.com/foo");
  });

  it("port via host!", async () => {
    await t.withTestRouteSet(async () => {
      t.hostBang("www.example.com:8080");
      await t.get("/get");
      expect(t.request.port).toBe(8080);
    });
  });

  it("port via process", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("http://www.example.com:8080/get");
      expect(t.request.port).toBe(8080);
    });
  });

  it("https and port via host and https!", async () => {
    await t.withTestRouteSet(async () => {
      t.hostBang("www.example.com");
      t.httpsBang(true);

      await t.get("/get");
      expect(t.request.port).toBe(443);
      expect(t.request.ssl).toBe(true);

      t.hostBang("www.example.com:443");
      t.httpsBang(true);

      await t.get("/get");
      expect(t.request.port).toBe(443);
      expect(t.request.ssl).toBe(true);

      t.hostBang("www.example.com:8443");
      t.httpsBang(true);

      await t.get("/get");
      expect(t.request.port).toBe(8443);
      expect(t.request.ssl).toBe(true);
    });
  });

  it("https and port via process", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("https://www.example.com/get");
      expect(t.request.port).toBe(443);
      expect(t.request.ssl).toBe(true);

      await t.get("https://www.example.com:8443/get");
      expect(t.request.port).toBe(8443);
      expect(t.request.ssl).toBe(true);
    });
  });

  it("respect removal of default headers by a controller action", async () => {
    await t.withTestRouteSet(async () => {
      await t.withDefaultHeaders({ a: "1", b: "2" }, async () => {
        await t.get("/removeHeader", { params: { header: "a" } });
      });
    });

    assertNotIncludes(
      t.response.headers,
      "a",
      "Response should not include default header removed by the controller action",
    );
    assertIncludes(t.response.headers, "b");
    assertIncludes(t.response.headers, "c");
  });

  it("accept not overridden when xhr true", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get", { headers: { Accept: "application/json" }, xhr: true });
      expect(t.request.accept).toBe("application/json");
      expect(t.response.mediaType).toBe("application/json");

      await t.get("/get", { headers: { HTTP_ACCEPT: "application/json" }, xhr: true });
      expect(t.request.accept).toBe("application/json");
      expect(t.response.mediaType).toBe("application/json");
    });
  });

  it("setting vary header when request is xhr with accept header", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get", { headers: { Accept: "application/json" }, xhr: true });
      expect(t.response.headers.get("Vary")).toBe("Accept");
    });
  });

  it("not setting vary header when format is provided", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/get", { params: { format: "json" } });
      expect(t.response.headers.get("Vary")).toBeUndefined();
    });
  });

  it("not setting vary header when it has already been set", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/getWithVarySetXRequestedWith", {
        headers: { Accept: "application/json" },
        xhr: true,
      });
      expect(t.response.headers.get("Vary")).toBe("X-Requested-With");
    });
  });

  it("not setting vary header when ignore accept header is set", async () => {
    const originalIgnoreAcceptHeader = Request.ignoreAcceptHeader;
    Request.ignoreAcceptHeader = true;

    try {
      await t.withTestRouteSet(async () => {
        await t.get("/get", { headers: { Accept: "application/json" }, xhr: true });
        expect(t.response.headers.get("Vary")).toBeUndefined();
      });
    } finally {
      Request.ignoreAcceptHeader = originalIgnoreAcceptHeader;
    }
  });
});

const Poller = {
  async call(env: RackEnv): Promise<RackResponse> {
    if (/^\/success/.test(env["PATH_INFO"] as string)) {
      return [
        200,
        { "Content-Type": "text/plain", "Content-Length": "12" },
        bodyFromString("Hello World!"),
      ];
    } else {
      return [404, { "Content-Type": "text/plain", "Content-Length": "0" }, bodyFromString("")];
    }
  },
};

class MetalIntegrationTest extends IntegrationTest {}
include(MetalIntegrationTest, SharedTestRoutes.urlHelpers());

describe("MetalIntegrationTest", () => {
  let t: MetalIntegrationTest;
  const assertResponse = (type: number | string): void => t.assertResponse(type);

  beforeEach(() => {
    t = new MetalIntegrationTest();
    t.app = Poller;
  });

  it("successful get", async () => {
    await t.get("/success");
    assertResponse(200);
    assertResponse("success");
    assertResponse("ok");
    expect(t.responseBody).toBe("Hello World!");
  });

  it("failed get", async () => {
    await t.get("/failure");
    assertResponse(404);
    assertResponse("not_found");
    expect(t.responseBody).toBe("");
  });

  it("generate url without controller", () => {
    expect(t.urlFor({ controller: "foo" })).toBe("http://www.example.com/foo");
  });

  it("pass headers", async () => {
    await t.get("/success", {
      headers: { Referer: "http://www.example.com/foo", Host: "http://nohost.com" },
    });
    expect(t.request.env["HTTP_HOST"]).toBe("http://nohost.com");
    expect(t.request.env["HTTP_REFERER"]).toBe("http://www.example.com/foo");
  });

  it("pass headers and env", async () => {
    await t.get("/success", {
      headers: { "X-Test-Header": "value" },
      env: { HTTP_REFERER: "http://test.com/", HTTP_HOST: "http://test.com" },
    });
    expect(t.request.env["HTTP_HOST"]).toBe("http://test.com");
    expect(t.request.env["HTTP_REFERER"]).toBe("http://test.com/");
    expect(t.request.env["HTTP_X_TEST_HEADER"]).toBe("value");
  });

  it("pass env", async () => {
    await t.get("/success", {
      env: { HTTP_REFERER: "http://test.com/", HTTP_HOST: "http://test.com" },
    });
    expect(t.request.env["HTTP_HOST"]).toBe("http://test.com");
    expect(t.request.env["HTTP_REFERER"]).toBe("http://test.com/");
  });

  it("ignores common ports in host", async () => {
    await t.get("http://test.com");
    expect(t.request.env["HTTP_HOST"]).toBe("test.com");

    await t.get("https://test.com");
    expect(t.request.env["HTTP_HOST"]).toBe("test.com");
  });

  it("keeps uncommon ports in host", async () => {
    await t.get("http://test.com:123");
    expect(t.request.env["HTTP_HOST"]).toBe("test.com:123");

    await t.get("http://test.com:443");
    expect(t.request.env["HTTP_HOST"]).toBe("test.com:443");

    await t.get("https://test.com:80");
    expect(t.request.env["HTTP_HOST"]).toBe("test.com:80");
  });
});

describe("ApplicationIntegrationTest", () => {
  class MetalController extends Metal {
    async new(): Promise<void> {
      this.status = 200;
    }
  }

  class TestController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: "index" });
    }
  }

  class MountedApp {
    static railtieName = "application_integration_test_mounted_app";

    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static call(): void {}

    static {
      this.routes.draw((r) => {
        r.get("baz", { to: "application_integration_test/test#index", as: "baz" });
      });
    }
  }

  class ApplicationIntegrationTest extends IntegrationTest {
    static call(env: RackEnv): Promise<RackResponse> {
      return this.routes.call(env);
    }

    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static {
      include(TestController, SharedTestRoutes.urlHelpers());
      controllerConstants.set("application_integration_test/metal", MetalController);
      controllerConstants.set("application_integration_test/test", TestController);
      this.routes.draw((r) => {
        r.get("", { to: "application_integration_test/test#index", as: "empty_string" });

        r.get("metal", { to: "application_integration_test/metal#new", as: "new_metal" });

        r.get("foo", { to: "application_integration_test/test#index", as: "foo" });
        r.get("bar", { to: "application_integration_test/test#index", as: "bar" });

        r.mount(MountedApp as unknown as MountableApp, { at: "/mounted", as: "mounted" });
        r.get("fooz", {
          to: (_env: RackEnv): RackResponse => [
            200,
            { [X_CASCADE]: "pass" },
            bodyFromString("omg"),
          ],
          anchor: false,
        });
        r.get("fooz", { to: "application_integration_test/test#index" });
      });
    }

    override get app(): unknown {
      return this.constructor;
    }
  }
  type Helpers = Record<string, (...args: unknown[]) => string> & {
    mounted: Record<string, (...args: unknown[]) => string>;
  };

  let t: ApplicationIntegrationTest & Helpers;
  beforeEach(() => {
    t = new ApplicationIntegrationTest() as ApplicationIntegrationTest & Helpers;
  });

  it("includes route helpers", () => {
    expect(t.emptyStringPath()).toBe("/");
    expect(t.fooPath()).toBe("/foo");
    expect(t.barPath()).toBe("/bar");
  });

  it("includes mounted helpers", () => {
    expect(t.mounted.bazPath()).toBe("/mounted/baz");
  });

  it("path after cascade pass", async () => {
    await t.get("/fooz");
    expect(t.response.body).toBe("index");
    expect(t.path).toBe("/fooz");
  });

  it("route helpers after controller access", async () => {
    await t.get("/");
    expect(t.emptyStringPath()).toBe("/");

    await t.get("/foo");
    expect(t.fooPath()).toBe("/foo");

    await t.get("/bar");
    expect(t.barPath()).toBe("/bar");
  });

  it("route helpers after metal controller access", async () => {
    await t.get("/metal");
    expect(t.fooPath({ q: "solution" })).toBe("/foo?q=solution");
  });

  it("missing route helper before controller access", () => {
    expect(() => t.missingPath()).toThrow(TypeError);
  });

  it("missing route helper after controller access", async () => {
    await t.get("/foo");
    expect(() => t.missingPath()).toThrow(TypeError);
  });

  it("process do not modify the env passed as argument", async () => {
    const env = { SERVER_NAME: "server", "action_dispatch.custom": "custom" };
    const oldEnv = { ...env };
    await t.get("/foo", { env });
    expect(env).toEqual(oldEnv);
  });
});

describe("EnvironmentFilterIntegrationTest", () => {
  class TestController extends Base {
    async post(): Promise<void> {
      await this.render({ plain: "Created", status: 201 });
    }
  }

  class EnvironmentFilterIntegrationTest extends IntegrationTest {
    static call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.parameter_filter"] = ["password"];
      return this.routes.call(env);
    }

    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static {
      controllerConstants.set("environment_filter_integration_test/test", TestController);
      this.routes.draw((r) => {
        r.match("/post", { to: "environment_filter_integration_test/test#post", via: "post" });
      });
    }

    override get app(): unknown {
      return this.constructor;
    }
  }

  it("filters rack request form vars", async () => {
    const t = new EnvironmentFilterIntegrationTest();
    await t.post("/post", { params: { username: "cjolly", password: "secret" } });

    expect(t.request.filteredParameters()["username"]).toBe("cjolly");
    expect(t.request.filteredParameters()["password"]).toBe("[FILTERED]");
    expect(t.request.filteredEnv()["rack.request.form_vars"]).toBe("[FILTERED]");
  });
});

describe("ControllerWithHeadersMethodIntegrationTest", () => {
  class TestController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: "ok" });
    }

    override get headers(): never {
      return Object.freeze({}) as never;
    }
  }

  it("doesn't call controller's headers method", async () => {
    const t = new IntegrationTest();
    controllerConstants.set("controller_with_headers_method_integration_test/test", TestController);
    await t.withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        r.get("/ok", { to: "controller_with_headers_method_integration_test/test#index" });
      });

      await t.get("/ok");

      t.assertResponse(200);
    });
  });
});

describe("UrlOptionsIntegrationTest", () => {
  class FooController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: "foo#index" });
    }

    async show(): Promise<void> {
      await this.render({ plain: "foo#show" });
    }

    async edit(): Promise<void> {
      await this.render({ plain: "foo#show" });
    }
  }

  class BarController extends Base {
    // @ts-expect-error TS2611: Rails overrides the default_url_options class_attribute reader with a method
    override get defaultUrlOptions(): Record<string, unknown> {
      return { host: "bar.com" };
    }

    async index(): Promise<void> {
      await this.render({ plain: "foo#index" });
    }
  }

  class UrlOptionsIntegrationTest extends IntegrationTest {
    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static call(env: RackEnv): Promise<RackResponse> {
      return this.routes.call(env);
    }

    override get app(): unknown {
      return this.constructor;
    }

    static {
      include(FooController, SharedTestRoutes.urlHelpers());
      include(BarController, SharedTestRoutes.urlHelpers());
      controllerConstants.set("url_options_integration_test/foo", FooController);
      controllerConstants.set("url_options_integration_test/bar", BarController);
      this.routes.draw((r) => {
        r.defaultUrlOptions = { host: "foo.com" };

        r.scope({ module: "url_options_integration_test" }, () => {
          r.get("/foo", { to: "foo#index", as: "foos" });
          r.get("/foo/:id", { to: "foo#show", as: "foo" });
          r.get("/foo/:id/edit", { to: "foo#edit", as: "edit_foo" });
          r.get("/bar", { to: "bar#index", as: "bars" });
        });
      });
    }
  }
  type Helpers = Record<string, (...args: unknown[]) => string>;

  let t: UrlOptionsIntegrationTest & Helpers;
  beforeEach(() => {
    t = new UrlOptionsIntegrationTest() as UrlOptionsIntegrationTest & Helpers;
  });

  it("session uses default URL options from routes", () => {
    expect(t.foosUrl()).toBe("http://foo.com/foo");
  });

  it("current host overrides default URL options from routes", async () => {
    await t.get("/foo");
    t.assertResponse("success");
    expect(t.foosUrl()).toBe("http://www.example.com/foo");
  });

  it("controller can override default URL options from request", async () => {
    await t.get("/bar");
    t.assertResponse("success");
    expect(t.foosUrl()).toBe("http://bar.com/foo");
  });

  it("can override default url options", async () => {
    const originalHost = { ...t.defaultUrlOptions };
    try {
      t.defaultUrlOptions["host"] = "foobar.com";
      expect(t.foosUrl()).toBe("http://foobar.com/foo");

      await t.get("/bar");
      t.assertResponse("success");
      expect(t.foosUrl()).toBe("http://foobar.com/foo");
    } finally {
      t.defaultUrlOptions = originalHost;
    }
  });

  it("current request path parameters are recalled", async () => {
    await t.get("/foo/1");
    t.assertResponse("success");
    expect(t.urlFor({ action: "edit", onlyPath: true })).toBe("/foo/1/edit");
  });
});

describe("HeadWithStatusActionIntegrationTest", () => {
  class FooController extends Base {
    // @ts-expect-error TS2426: the Rails action is named status, which Metal answers as an accessor
    override async status(): Promise<void> {
      this.head("ok");
    }
  }

  class HeadWithStatusActionIntegrationTest extends IntegrationTest {
    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static call(env: RackEnv): Promise<RackResponse> {
      return this.routes.call(env);
    }

    override get app(): unknown {
      return this.constructor;
    }

    static {
      controllerConstants.set("head_with_status_action_integration_test/foo", FooController);
      this.routes.draw((r) => {
        r.get("/foo/status", { to: "head_with_status_action_integration_test/foo#status" });
      });
    }
  }

  it("get /foo/status with head result does not cause stack overflow error", async () => {
    const t = new HeadWithStatusActionIntegrationTest();
    await expect(t.get("/foo/status")).resolves.not.toThrow();
    t.assertResponse("ok");
  });
});

describe("IntegrationWithRoutingTest", () => {
  class FooController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: "ok" });
    }
  }

  class IntegrationWithRoutingTest extends IntegrationTest {}

  it("with routing resets session", async () => {
    const t = new IntegrationWithRoutingTest();
    const klassNamespace = underscore(IntegrationWithRoutingTest.name);
    controllerConstants.set(`${klassNamespace}/foo`, FooController);

    await t.withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        r.namespace(klassNamespace, () => {
          r.resources("foo", { path: "/with" } as RouteOptions);
        });
      });

      await t.get("/integration_with_routing_test/with");
      t.assertResponse(200);
      expect(t.response.body).toBe("ok");
    });

    await t.withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        r.namespace(klassNamespace, () => {
          r.resources("foo", { path: "/routing" } as RouteOptions);
        });
      });

      await t.get("/integration_with_routing_test/routing");
      t.assertResponse(200);
      expect(t.response.body).toBe("ok");
    });
  });
});

describe("IntegrationRequestsWithoutSetup", () => {
  class FooController extends Base {
    async ok(): Promise<void> {
      this.cookies().set("key", "ok");
      await this.render({ plain: "ok" });
    }
  }

  it("request", async () => {
    const t = new IntegrationTest();
    await t.withRouting(async (routes: RouteSet) => {
      routes.draw((r) => {
        deprecator().silence(() => {
          r.get(":action", { to: FooController as unknown as MountableApp });
        });
      });

      await t.get("/ok");

      t.assertResponse(200);
      expect(t.response.body).toBe("ok");
      expect(t.cookies.get("key")).toBe("ok");
    });
  });
});

describe("IntegrationRequestsWithSessionSetup", () => {
  class IntegrationRequestsWithSessionSetup extends IntegrationTest {
    static {
      this.setup(function (this: IntegrationTest) {
        this.cookies.set("user_name", "david");
      });
    }
  }

  it("cookies set in setup are persisted through the session", async () => {
    const t = new IntegrationRequestsWithSessionSetup();
    t.beforeSetup();
    t.setup();
    await t.get("/foo");
    expect(t.cookies.toHash()).toEqual({ user_name: "david" });
  });
});
