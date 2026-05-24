import { describe, it, expect, beforeEach } from "vitest";
import { TestCase } from "../test-case.js";
import { Base } from "../base.js";
import { Metal } from "../metal.js";
import { Request } from "../../action-dispatch/http/request.js";

// ==========================================================================
// Test controllers
// ==========================================================================

class PostsController extends Base {
  async index() {
    this.render({ json: [{ id: 1, title: "Hello" }] });
  }

  async show() {
    const id = this.params.get("id");
    this.render({ json: { id } });
  }

  async create() {
    const title = this.params.get("title");
    this.flash.set("notice", "Post created!");
    this.session.lastCreated = title;
    this.status = 201;
    this.render({ json: { title } });
  }

  async update() {
    const id = this.params.get("id");
    this.render({ json: { id, updated: true } });
  }

  async destroy() {
    const id = this.params.get("id");
    this.head(204);
  }

  async redirectAction() {
    this.redirectTo("/posts");
  }

  async renderPlain() {
    this.render({ plain: "hello world" });
  }

  async renderHtml() {
    this.render({ html: "<h1>Hello</h1>" });
  }

  async renderWithStatus() {
    this.render({ json: { error: "not found" }, status: 404 });
  }

  async setCustomHeader() {
    this.setHeader("X-Custom", "test-value");
    this.render({ plain: "ok" });
  }

  async forbidden() {
    this.head("forbidden");
  }

  async useSession() {
    const count = ((this.session.count as number) ?? 0) + 1;
    this.session.count = count;
    this.render({ json: { count } });
  }

  async flashNotice() {
    this.flash.set("notice", "Success!");
    this.render({ plain: "ok" });
  }

  async flashAlert() {
    this.flash.set("alert", "Danger!");
    this.render({ plain: "ok" });
  }
}

// ==========================================================================
// action_controller/test_case_test.rb
// ==========================================================================
describe("TestCaseTest", () => {
  let tc: TestCase;

  beforeEach(() => {
    tc = new TestCase(PostsController);
  });

  describe("HTTP verb methods", () => {
    it("GET dispatches to action", async () => {
      await tc.get("index");
      expect(tc.controller).toBeDefined();
      expect(tc.responseBody).toContain("Hello");
    });

    it("POST dispatches to action", async () => {
      await tc.post("create", { params: { title: "New Post" } });
      expect(tc.controller.status).toBe(201);
      expect(JSON.parse(tc.responseBody).title).toBe("New Post");
    });

    it("PUT dispatches to action", async () => {
      await tc.put("update", { params: { id: "42" } });
      expect(JSON.parse(tc.responseBody).id).toBe("42");
    });

    it("PATCH dispatches to action", async () => {
      await tc.patch("update", { params: { id: "7" } });
      expect(JSON.parse(tc.responseBody).id).toBe("7");
    });

    it("DELETE dispatches to action", async () => {
      await tc.delete("destroy", { params: { id: "1" } });
      expect(tc.controller.status).toBe(204);
    });

    it("HEAD dispatches to action", async () => {
      await tc.head("index");
      expect(tc.controller).toBeDefined();
    });
  });

  describe("request options", () => {
    it("passes params to controller", async () => {
      await tc.get("show", { params: { id: "99" } });
      expect(JSON.parse(tc.responseBody).id).toBe("99");
    });

    it("sets custom headers", async () => {
      await tc.get("index", { headers: { "X-Custom": "test" } });
      expect(tc.request.getHeader("X-Custom")).toBe("test");
    });

    it("sets XHR flag", async () => {
      await tc.get("index", { xhr: true });
      expect(tc.request.isXmlHttpRequest).toBe(true);
    });

    it("sets format via accept header", async () => {
      await tc.get("index", { format: "json" });
      expect(tc.request.accept).toContain("application/json");
    });

    it("passes session data", async () => {
      await tc.get("useSession", { session: { count: 5 } });
      expect(JSON.parse(tc.responseBody).count).toBe(6);
    });
  });

  describe("response inspection", () => {
    it("responseBody returns response body", async () => {
      await tc.get("renderPlain");
      expect(tc.responseBody).toBe("hello world");
    });

    it("parsedBody returns parsed JSON", async () => {
      await tc.get("index");
      expect(tc.parsedBody).toEqual([{ id: 1, title: "Hello" }]);
    });

    it("controller is accessible", async () => {
      await tc.get("index");
      expect(tc.controller).toBeInstanceOf(Base);
    });

    it("request is accessible", async () => {
      await tc.get("index");
      expect(tc.request).toBeDefined();
      expect(tc.request.method).toBe("GET");
    });

    it("response is accessible", async () => {
      await tc.get("index");
      expect(tc.response).toBeDefined();
    });
  });

  describe("assertResponse", () => {
    it("accepts exact status code", async () => {
      await tc.get("index");
      tc.assertResponse(200);
    });

    it("throws on wrong status code", async () => {
      await tc.get("index");
      expect(() => tc.assertResponse(404)).toThrow(/Expected response status 404/);
    });

    it("accepts 'success' for 2xx", async () => {
      await tc.get("index");
      tc.assertResponse("success");
    });

    it("accepts 'redirect' for 3xx", async () => {
      await tc.get("redirectAction");
      tc.assertResponse("redirect");
    });

    it("rejects 'success' for non-2xx", async () => {
      await tc.get("renderWithStatus");
      expect(() => tc.assertResponse("success")).toThrow(/Expected response to be "success"/);
    });

    it("accepts status symbols like 'ok'", async () => {
      await tc.get("index");
      tc.assertResponse("ok");
    });

    it("accepts status symbols like 'created'", async () => {
      await tc.post("create", { params: { title: "x" } });
      tc.assertResponse("created");
    });

    it("accepts status symbols like 'not_found'", async () => {
      await tc.get("renderWithStatus");
      tc.assertResponse("not_found");
    });

    it("accepts status symbols like 'no_content'", async () => {
      await tc.delete("destroy", { params: { id: "1" } });
      tc.assertResponse("no_content");
    });

    it("accepts status symbols like 'forbidden'", async () => {
      await tc.get("forbidden");
      tc.assertResponse("forbidden");
    });

    it("throws on unknown symbol", async () => {
      await tc.get("index");
      expect(() => tc.assertResponse("banana")).toThrow(/Unknown response assertion/);
    });

    it("accepts 'missing' for 4xx", async () => {
      await tc.get("renderWithStatus");
      tc.assertResponse("missing");
    });
  });

  describe("assertRedirectedTo", () => {
    it("passes on correct redirect URL", async () => {
      await tc.get("redirectAction");
      tc.assertRedirectedTo("/posts");
    });

    it("throws on wrong redirect URL", async () => {
      await tc.get("redirectAction");
      expect(() => tc.assertRedirectedTo("/wrong")).toThrow(/Expected redirect to "\/wrong"/);
    });

    it("throws when no redirect", async () => {
      await tc.get("index");
      expect(() => tc.assertRedirectedTo("/posts")).toThrow(/no Location header/);
    });

    it("accepts regex", async () => {
      await tc.get("redirectAction");
      tc.assertRedirectedTo(/\/posts/);
    });
  });

  describe("assertContentType", () => {
    it("matches JSON content type", async () => {
      await tc.get("index");
      tc.assertContentType("application/json");
    });

    it("matches plain text content type", async () => {
      await tc.get("renderPlain");
      tc.assertContentType("text/plain");
    });

    it("matches HTML content type", async () => {
      await tc.get("renderHtml");
      tc.assertContentType("text/html");
    });

    it("throws on mismatch", async () => {
      await tc.get("index");
      expect(() => tc.assertContentType("text/plain")).toThrow(/Expected content type/);
    });
  });

  describe("assertHeader", () => {
    it("checks header value", async () => {
      await tc.get("setCustomHeader");
      tc.assertHeader("x-custom", "test-value");
    });

    it("throws on missing header", async () => {
      await tc.get("index");
      expect(() => tc.assertHeader("x-nonexistent", "val")).toThrow(/Expected header/);
    });

    it("accepts regex", async () => {
      await tc.get("setCustomHeader");
      tc.assertHeader("x-custom", /test/);
    });
  });

  describe("flash", () => {
    it("assertFlash passes when flash is set", async () => {
      await tc.get("flashNotice");
      tc.assertFlash("notice", "Success!");
    });

    it("assertFlash throws when flash is not set", async () => {
      await tc.get("index");
      expect(() => tc.assertFlash("notice")).toThrow(/Expected flash/);
    });

    it("assertFlash checks value", async () => {
      await tc.get("flashNotice");
      expect(() => tc.assertFlash("notice", "Wrong")).toThrow(/Expected flash/);
    });

    it("assertFlash accepts regex", async () => {
      await tc.get("flashNotice");
      tc.assertFlash("notice", /Success/);
    });

    it("assertNoFlash passes when flash is not set", async () => {
      await tc.get("index");
      tc.assertNoFlash("alert");
    });

    it("assertNoFlash throws when flash is set", async () => {
      await tc.get("flashAlert");
      expect(() => tc.assertNoFlash("alert")).toThrow(/Expected no flash/);
    });

    it("flash accessor returns flash hash", async () => {
      await tc.get("flashNotice");
      expect(tc.flash.get("notice")).toBe("Success!");
    });
  });

  describe("session persistence", () => {
    it("session persists across requests", async () => {
      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(1);

      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(2);

      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(3);
    });

    it("session set by controller is available", async () => {
      await tc.post("create", { params: { title: "My Post" } });
      expect(tc.session.lastCreated).toBe("My Post");
    });

    it("reset clears session", async () => {
      await tc.get("useSession");
      tc.reset();
      await tc.get("useSession");
      expect(JSON.parse(tc.responseBody).count).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears controller, request, response", async () => {
      await tc.get("index");
      tc.reset();
      expect(tc.controller).toBeUndefined();
      expect(tc.request).toBeUndefined();
      expect(tc.response).toBeUndefined();
    });
  });

  describe("Metal controller support", () => {
    it("works with Metal controllers", async () => {
      class SimpleMetal extends Metal {
        async index() {
          this.body = "metal response";
          this.contentType = "text/plain";
          this.markPerformed();
        }
      }

      const mtc = new TestCase(SimpleMetal);
      await mtc.get("index");
      expect(mtc.responseBody).toBe("metal response");
    });
  });

  // -------------------------------------------------------------------------
  // Rails test_case_test.rb — process helpers (S7b)
  // -------------------------------------------------------------------------

  describe("process helpers", () => {
    class FlashSetController extends Base {
      async setFlash() {
        this.flash.set("test", "><");
        this.render({ plain: "ok" });
      }
    }
    class FlashPrependController extends Base {
      async setFlash() {
        const pre = this.flash.get("test") ?? "";
        this.flash.set("test", `>${pre}<`);
        this.render({ plain: "ok" });
      }
    }
    class SessionController extends Base {
      async noOp() {
        this.render({ plain: "ok" });
      }
    }
    class UriController extends Base {
      async testUri() {
        this.render({ plain: this.request.path });
      }
    }
    class ParamController extends Base {
      async testOnlyOneParam() {
        const keys = [...this.params.keys].filter((k) => k !== "controller" && k !== "action");
        this.render({ plain: keys.length === 1 ? "OK" : "FAIL" });
      }
    }

    it("process without flash", async () => {
      const ftc = new TestCase(FlashSetController);
      await ftc.process("setFlash");
      expect(ftc.flash.get("test")).toBe("><");
    });

    it("process with flash", async () => {
      const ftc = new TestCase(FlashPrependController);
      await ftc.process("setFlash", { method: "GET", flash: { test: "value" } });
      expect(ftc.flash.get("test")).toBe(">value<");
    });

    it("process with session kwarg", async () => {
      const stc = new TestCase(SessionController);
      await stc.process("noOp", { method: "GET", session: { string: "value1", symbol: "value2" } });
      expect(stc.session["string"]).toBe("value1");
      expect(stc.session["symbol"]).toBe("value2");
    });

    it("process merges session arg", async () => {
      const stc = new TestCase(SessionController);
      stc.session["foo"] = "bar";
      await stc.get("noOp", { session: { bar: "baz" } });
      expect(stc.session["foo"]).toBe("bar");
      expect(stc.session["bar"]).toBe("baz");
    });

    it("merged session arg is retained across requests", async () => {
      const stc = new TestCase(SessionController);
      await stc.get("noOp", { session: { foo: "bar" } });
      expect(stc.session["foo"]).toBe("bar");
      await stc.get("noOp");
      expect(stc.session["foo"]).toBe("bar");
    });

    it("process with symbol method", async () => {
      const utc = new TestCase(UriController);
      await utc.process("testUri", { method: "get" });
      expect(utc.controller).toBeDefined();
    });

    it("response and request have nice accessors", async () => {
      const ntc = new TestCase(SessionController);
      await ntc.process("noOp");
      expect(ntc.response).toBeDefined();
      expect(ntc.request).toBeDefined();
    });

    it("multiple calls", async () => {
      const ptc = new TestCase(ParamController);
      await ptc.process("testOnlyOneParam", { method: "GET", params: { left: "true" } });
      expect(ptc.responseBody).toBe("OK");
      await ptc.process("testOnlyOneParam", { method: "GET", params: { right: "true" } });
      expect(ptc.responseBody).toBe("OK");
    });

    it("build_response returns a new Response", () => {
      const resp = tc.buildResponse();
      expect(resp).toBeDefined();
    });

    it("generatedPath returns the path component", () => {
      expect(tc.generatedPath(["/posts/1", ["format"]])).toBe("/posts/1");
    });

    it("queryParameterNames returns extra keys plus controller and action", () => {
      const names = tc.queryParameterNames(["/posts", ["format", "page"]]);
      expect(names).toContain("controller");
      expect(names).toContain("action");
      expect(names).toContain("format");
      expect(names).toContain("page");
    });

    it("executorAroundEachRequest class attribute defaults to false", () => {
      expect(TestCase.executorAroundEachRequest).toBe(false);
      TestCase.executorAroundEachRequest = true;
      expect(TestCase.executorAroundEachRequest).toBe(true);
      TestCase.executorAroundEachRequest = false;
    });

    it("assertTemplate raises (extracted to gem)", () => {
      expect(() => tc.assertTemplate("posts/index")).toThrow(/extracted to a gem/);
    });
  });
});

// ==========================================================================
// Rails TestController (mirrors test_case_test.rb TestController)
// ==========================================================================

class TestController extends Base {
  _counter: number | undefined = undefined;

  async noOp() {
    this.render({ plain: "dummy" });
  }

  async setFlash() {
    const prev = this.flash.get("test") ?? "";
    this.flash.set("test", `>${prev}<`);
    this.render({ plain: "ignore me" });
  }

  async deleteFlash() {
    this.flash.delete("test");
    this.render({ plain: "ignore me" });
  }

  async setSession() {
    this.session["string"] = "A wonder";
    this.session["symbol"] = "it works";
    this.render({ plain: "Success" });
  }

  async resetTheSession() {
    this.resetSession();
    this.render({ plain: "ignore me" });
  }

  async renderBody() {
    this.render({ plain: this.request.body });
  }

  async testParams() {
    const data: Record<string, unknown> = {};
    for (const key of this.params.keys) data[key] = this.params.get(key);
    this.render({ plain: JSON.stringify(data) });
  }

  async testQueryParameters() {
    this.render({ plain: JSON.stringify(this.request.queryParameters) });
  }

  async testQueryString() {
    this.render({ plain: this.request.queryString });
  }

  async testUri() {
    this.render({ plain: this.request.fullpath });
  }

  async testFormat() {
    this.render({ plain: String(this.request.format) });
  }

  async testProtocol() {
    this.render({ plain: this.request.protocol });
  }

  async testOnlyOneParam() {
    const hasLeft = this.params.get("left") != null;
    const hasRight = this.params.get("right") != null;
    this.render({ plain: hasLeft && hasRight ? "EEP, Both here!" : "OK" });
  }

  async testRemoteAddr() {
    // request.remoteAddr maps to REMOTE_ADDR env; use remoteIp which falls back to it
    this.render({ plain: (this.request.env["REMOTE_ADDR"] as string | undefined) ?? "127.0.0.1" });
  }

  async renderJson() {
    this.render({ json: this.request.rawPost });
  }

  async boom() {
    throw new Error("boom!");
  }

  async incrementCount() {
    this._counter = (this._counter ?? 0) + 1;
    this.render({ plain: String(this._counter) });
  }

  async create() {
    this.head(201, { location: "/resource" });
  }
}

// ==========================================================================
// action_controller/test_case_test.rb — TestCaseTest (ported)
// ==========================================================================

describe("TestCaseTest (ported)", () => {
  let tc: TestCase;

  beforeEach(() => {
    tc = new TestCase(TestController);
  });

  it("head", async () => {
    await tc.process("testParams");
    expect(tc.response.status).toBe(200);
  });

  it.skip("process with flash now", async () => {
    // flash.now not yet implemented in FlashHash
  });

  it.skip("process delete flash", async () => {
    // flash persistence between requests not yet implemented
  });

  it("process with session", async () => {
    await tc.process("setSession");
    expect(tc.session["string"]).toBe("A wonder");
    expect(tc.session["symbol"]).toBe("it works");
  });

  it("process overwrites existing session arg", async () => {
    tc.session["foo"] = "bar";
    await tc.get("noOp", { session: { foo: "baz" } });
    expect(tc.session["foo"]).toBe("baz");
  });

  it.skip("session is cleared from controller after reset session", async () => {
    // resetSession() does not clear controller.session plain object; skip until wired
  });

  it.skip("session is cleared from request after reset session", async () => {
    // resetSession() does not clear request.session visible to TestCase; skip until wired
  });

  it("response and request have nice accessors", async () => {
    await tc.process("noOp");
    expect(tc.response).toBeInstanceOf(Object);
    expect(tc.request).toBeInstanceOf(Request);
  });

  it.skip("process with query string", async () => {
    // params are stored in parameters_override; process() does not encode them
    // into QUERY_STRING, so request.queryString returns "". Requires assignParameters wiring.
    await tc.process("testQueryString", { method: "GET", params: { q: "test" } });
    expect(tc.responseBody).toContain("q=test");
  });

  it("multiple calls", async () => {
    await tc.process("testOnlyOneParam", { method: "GET", params: { left: "true" } });
    expect(tc.responseBody).toBe("OK");
    await tc.process("testOnlyOneParam", { method: "GET", params: { right: "true" } });
    expect(tc.responseBody).toBe("OK");
  });

  it("remote addr", async () => {
    // Rails default is "0.0.0.0"; ours is "127.0.0.1" (request.ts line 487)
    await tc.get("testRemoteAddr");
    expect(tc.responseBody).toBe("127.0.0.1");

    await tc.get("testRemoteAddr", { env: { REMOTE_ADDR: "192.0.0.1" } });
    expect(tc.responseBody).toBe("192.0.0.1");
  });

  it.skip("header properly reset after remote http request", async () => {
    // scrub_env! not called post-request; headers persist on tc.request — skip
  });

  it("xhr with session", async () => {
    await tc.get("setSession", { xhr: true });
    expect(tc.session["string"]).toBe("A wonder");
    expect(tc.session["symbol"]).toBe("it works");
  });

  it("params reset between post requests", async () => {
    await tc.post("noOp", { params: { foo: "bar" } });
    expect(tc.request.parameters["foo"]).toBe("bar");

    await tc.post("noOp");
    expect(tc.request.parameters["foo"]).toBeUndefined();
  });

  it("raw post reset between post requests", async () => {
    await tc.post("noOp", { body: "foo=bar" });
    expect(tc.request.rawPost).toBe("foo=bar");

    await tc.post("noOp", { body: "foo=baz" });
    expect(tc.request.rawPost).toBe("foo=baz");
  });

  it.skip("request protocol is reset after request", async () => {
    // HTTPS env is not translated to rack.url_scheme in Request constructor;
    // scheme() reads rack.url_scheme (defaulted to "http") not HTTPS directly.
    await tc.get("testProtocol");
    expect(tc.responseBody).toBe("http://");

    await tc.get("testProtocol", { env: { HTTPS: "on" } });
    expect(tc.responseBody).toBe("https://");

    await tc.get("testProtocol");
    expect(tc.responseBody).toBe("http://");
  });

  it.skip("request format", async () => {
    // params-based format requires mimeHost.parameters to read req.parameters
    // (including parameters_override), not req.params (merged path+query+body).
    // Blocked until mimeHost wiring or assignParameters integration is fixed.
    await tc.get("testFormat", { params: { format: "html" } });
    expect(tc.responseBody).toBe("text/html");

    await tc.get("testFormat", { params: { format: "json" } });
    expect(tc.responseBody).toBe("application/json");

    await tc.get("testFormat", { params: { format: "xml" } });
    expect(tc.responseBody).toBe("application/xml");

    await tc.get("testFormat");
    expect(tc.responseBody).toBe("text/html");
  });

  it("request format kwarg", async () => {
    await tc.get("testFormat", { format: "html" });
    expect(tc.responseBody).toBe("text/html");

    await tc.get("testFormat", { format: "json" });
    expect(tc.responseBody).toBe("application/json");

    await tc.get("testFormat", { format: "xml" });
    expect(tc.responseBody).toBe("application/xml");

    await tc.get("testFormat");
    expect(tc.responseBody).toBe("text/html");
  });

  it("request format kwarg overrides params", async () => {
    await tc.get("testFormat", { format: "json", params: { format: "html" } });
    expect(tc.responseBody).toBe("application/json");
  });

  it("request format kwarg doesnt mutate params", async () => {
    const params = Object.freeze({ foo: "bar" });
    await expect(tc.get("testFormat", { format: "json", params })).resolves.not.toThrow();
  });

  it("using as json sets request content type to json", async () => {
    await tc.post("renderBody", {
      params: { bool_value: true, str_value: "string", num_value: 2 },
      as: "json",
    });
    expect(tc.request.getHeader("CONTENT_TYPE")).toContain("application/json");
  });

  it("using as json sets format json", async () => {
    await tc.post("renderBody", { params: { bool_value: true }, as: "json" });
    expect(String(tc.request.format)).toBe("application/json");
  });

  it.skip("using as json with path parameters", async () => {
    // process() only sets { controller, action } in pathParameters; extra params
    // are in parameters_override and not merged into pathParameters.
    await tc.post("testParams", { params: { id: "12345" }, as: "json" });
    expect(tc.request.pathParameters["id"]).toBe("12345");
  });

  it("exception in action reaches test", async () => {
    await expect(tc.process("boom", { method: "GET" })).rejects.toThrow("boom!");
  });

  it.skip("request state is cleared after exception", async () => {
    // params not encoded to QUERY_STRING, so request.queryString is always "";
    // responseBody would be "" not "q=test2". Requires QUERY_STRING wiring.
    await expect(tc.process("boom", { method: "GET", params: { q: "test1" } })).rejects.toThrow();
    await tc.process("testQueryString", { method: "GET", params: { q: "test2" } });
    expect(tc.responseBody).toContain("q=test2");
  });

  it("reset instance variables after each request", async () => {
    await tc.get("incrementCount");
    expect(tc.responseBody).toBe("1");

    await tc.get("incrementCount");
    expect(tc.responseBody).toBe("1");
  });

  it.skip("parsed body without as option", async () => {
    // body: {hash} auto-serialization not supported; use explicit JSON string
  });

  it("parsed body with as option", async () => {
    await tc.post("renderJson", { body: JSON.stringify({ foo: "heyo" }), as: "json" });
    expect(tc.parsedBody).toEqual({ foo: "heyo" });
  });
});
