import {
  assert,
  Assertion,
  assertEmpty,
  assertEqual,
  assertIncludes,
  assertMatch,
  assertNil,
  assertNotIncludes,
  assertNothingRaised,
  assertNotEqual,
  assertPredicate,
  assertRaise,
  assertRespondTo,
  isBlank,
  silenceWarnings,
  toQuery,
} from "@blazetrails/activesupport";
import {
  Encoding,
  File,
  rbObjClass,
  rbObjId,
  rbObjIvarGet,
  rbObjIvarSet,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { UploadedFile } from "@blazetrails/rack-test";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { TestCase } from "../test-case.js";
import { Base } from "../base.js";
import { Metal } from "../metal.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { Response } from "../../action-dispatch/http/response.js";
import { TestResponse } from "../../action-dispatch/testing/test-response.js";
import type {
  fixtureFileUpload,
  redirectToUrl,
} from "../../action-dispatch/testing/test-process.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";
import { ContentController } from "../../test-helpers/lib/controller/fake-controllers.js";

class PostsController extends Base {
  async index() {
    await this.render({ json: [{ id: 1, title: "Hello" }] });
  }

  async show() {
    const id = this.params.get("id");
    await this.render({ json: { id } });
  }

  async create() {
    const title = this.params.get("title");
    this.flash.set("notice", "Post created!");
    this.session.set("lastCreated", title);
    this.status = 201;
    await this.render({ json: { title } });
  }

  async update() {
    const id = this.params.get("id");
    await this.render({ json: { id, updated: true } });
  }

  async destroy() {
    const id = this.params.get("id");
    this.head(204);
  }

  async redirectAction() {
    this.redirectTo("/posts");
  }

  async renderPlain() {
    await this.render({ plain: "hello world" });
  }

  async renderHtml() {
    await this.render({ html: "<h1>Hello</h1>" });
  }

  async renderWithStatus() {
    await this.render({ json: { error: "not found" }, status: 404 });
  }

  async setCustomHeader() {
    this.headers.set("X-Custom", "test-value");
    await this.render({ plain: "ok" });
  }

  async forbidden() {
    this.head("forbidden");
  }

  async useSession() {
    const count = ((this.session.get("count") as number) ?? 0) + 1;
    this.session.set("count", count);
    await this.render({ json: { count } });
  }

  async flashNotice() {
    this.flash.set("notice", "Success!");
    await this.render({ plain: "ok" });
  }

  async xhrFlag() {
    await this.render({ json: { xhr: this.request.isXmlHttpRequest } });
  }

  async flashAlert() {
    this.flash.set("alert", "Danger!");
    await this.render({ plain: "ok" });
  }
}

describe("TestCaseTest", () => {
  let tc: TestCase;

  beforeEach(async () => {
    tc = new TestCase(PostsController);
    await tc.beforeSetup();
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
      await tc.get("xhrFlag", { xhr: true });
      expect(JSON.parse(tc.responseBody).xhr).toBe(true);
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
      expect(() => tc.assertResponse(404)).toThrow(
        /Expected response to be a <404: Not Found>, but was a <200: OK>/,
      );
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
      expect(() => tc.assertResponse("success")).toThrow(
        /Expected response to be a <2XX: success>, but was a <404: Not Found>/,
      );
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
      expect(() => tc.assertResponse("banana")).toThrow(/Invalid response name: banana/);
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
      expect(() => tc.assertRedirectedTo("/wrong")).toThrow(
        /Expected response to be a redirect to <http:\/\/test.host\/wrong>/,
      );
    });

    it("throws when no redirect", async () => {
      await tc.get("index");
      expect(() => tc.assertRedirectedTo("/posts")).toThrow(
        /Expected response to be a <3XX: redirect>, but was a <200: OK>/,
      );
    });

    it("accepts regex", async () => {
      await tc.get("redirectAction");
      tc.assertRedirectedTo(/\/posts/);
    });
  });

  describe("assertContentType", () => {
    it("matches JSON content type", async () => {
      await tc.get("index");
      expect(tc.response.mediaType).toBe("application/json");
    });

    it("matches plain text content type", async () => {
      await tc.get("renderPlain");
      expect(tc.response.mediaType).toBe("text/plain");
    });

    it("matches HTML content type", async () => {
      await tc.get("renderHtml");
      expect(tc.response.mediaType).toBe("text/html");
    });
  });

  describe("assertHeader", () => {
    it("checks header value", async () => {
      await tc.get("setCustomHeader");
      expect(tc.response.getHeader("x-custom")).toBe("test-value");
    });

    it("throws on missing header", async () => {
      await tc.get("index");
      expect(tc.response.getHeader("x-nonexistent")).toBeUndefined();
    });
  });

  describe("flash", () => {
    it("assertFlash passes when flash is set", async () => {
      await tc.get("flashNotice");
      expect(tc.flash.get("notice")).toBe("Success!");
    });

    it("assertFlash throws when flash is not set", async () => {
      await tc.get("index");
      expect(tc.flash.get("notice")).toBeUndefined();
    });

    it("assertNoFlash passes when flash is not set", async () => {
      await tc.get("index");
      expect(tc.flash.has("alert")).toBe(false);
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
      expect(tc.session.get("lastCreated")).toBe("My Post");
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
      const { controller, request, response } = tc;
      tc.reset();
      expect(tc.controller).not.toBe(controller);
      expect(tc.request).not.toBe(request);
      expect(tc.response).not.toBe(response);
    });
  });

  describe("Metal controller support", () => {
    it("works with Metal controllers", async () => {
      class SimpleMetal extends Metal {
        async index() {
          this.responseBody = "metal response";
          this.contentType = "text/plain";
          this.markPerformed();
        }
      }

      const mtc = new TestCase(SimpleMetal);
      await mtc.beforeSetup();
      await mtc.get("index");
      expect(mtc.responseBody).toBe("metal response");
    });
  });

  describe("process helpers", () => {
    it("build_response returns a new Response", () => {
      const resp = tc.buildResponse(TestResponse);
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

class TestController extends Base {
  declare counter: number | undefined;

  async noOp() {
    await this.render({ plain: "dummy" });
  }

  async setFlash() {
    const prev = this.flash.get("test") ?? "";
    this.flash.set("test", `>${prev}<`);
    await this.render({ plain: "ignore me" });
  }

  async deleteFlash() {
    this.flash.delete("test");
    await this.render({ plain: "ignore me" });
  }

  async setFlashNow() {
    this.flash.now("test_now", `>${this.flash.get("test_now") ?? ""}<`);
    await this.render({ plain: "ignore me" });
  }

  async setSession() {
    this.session.set("string", "A wonder");
    this.session.set("symbol", "it works");
    await this.render({ plain: "Success" });
  }

  async resetTheSession() {
    this.resetSession();
    await this.render({ plain: "ignore me" });
  }

  async renderRawPost() {
    if (isBlank(this.request.rawPost)) throw new Assertion("#raw_post is blank");
    await this.render({ plain: this.request.rawPost });
  }

  async renderBody() {
    await this.render({ plain: this.request.body });
  }

  async testParams() {
    await this.render({ plain: JSON.stringify(this.params.toUnsafeH()) });
  }

  async testQueryParameters() {
    await this.render({ plain: JSON.stringify(this.request.queryParameters) });
  }

  async testQueryString() {
    await this.render({ plain: this.request.queryString });
  }

  async testUri() {
    await this.render({ plain: this.request.fullpath });
  }

  async testFormat() {
    await this.render({ plain: String(this.request.format) });
  }

  async testProtocol() {
    await this.render({ plain: this.request.protocol });
  }

  async testOnlyOneParam() {
    const hasLeft = this.params.get("left") != null;
    const hasRight = this.params.get("right") != null;
    await this.render({ plain: hasLeft && hasRight ? "EEP, Both here!" : "OK" });
  }

  async testRemoteAddr() {
    await this.render({
      plain: (this.request.env["REMOTE_ADDR"] as string | undefined) ?? "127.0.0.1",
    });
  }

  async testFileUpload() {
    await this.render({ plain: (this.params.get("file") as UploadedFile).size() });
  }

  async renderCookie() {
    await this.render({ plain: this.cookies().get("foo") });
  }

  async deleteCookie() {
    this.cookies().delete("foo");
    await this.render({ plain: "ok" });
  }

  async renderJson() {
    await this.render({ json: this.request.rawPost });
  }

  async boom() {
    throw new RuntimeError("boom!");
  }

  async incrementCount() {
    this.counter ??= 0;
    this.counter += 1;
    await this.render({ plain: this.counter });
  }

  async originalFullpath() {
    this.request.setHeader("PATH_INFO", "/new");
    await this.render({ plain: this.request.originalFullpath });
  }

  async create() {
    this.head(201, { location: "/resource" });
  }
}
Object.defineProperty(TestController, "name", { value: "TestCaseTest::TestController" });

class DefaultUrlOptionsCachingController extends Base {
  declare _dynamicOpt: string | undefined;

  static {
    this.beforeAction(function (this: DefaultUrlOptionsCachingController) {
      this._dynamicOpt = "opt";
    });
  }

  async testUrlOptionsReset() {
    await this.render({ plain: this.urlFor() });
  }
}
const defaultUrlOptions = Object.getOwnPropertyDescriptor(Base.prototype, "defaultUrlOptions")!;
Object.defineProperty(DefaultUrlOptionsCachingController.prototype, "defaultUrlOptions", {
  get(this: DefaultUrlOptionsCachingController) {
    if (this._dynamicOpt !== undefined) {
      return { ...defaultUrlOptions.get!.call(this), dynamic_opt: this._dynamicOpt };
    } else {
      return defaultUrlOptions.get!.call(this);
    }
  },
});
Object.defineProperty(DefaultUrlOptionsCachingController, "name", {
  value: "TestCaseTest::DefaultUrlOptionsCachingController",
});

class TestCaseTest extends TestCase {
  declare fixtureFileUpload: OmitThisParameter<typeof fixtureFileUpload>;
  declare redirectToUrl: OmitThisParameter<typeof redirectToUrl>;

  static fixturePaths(): string[] {
    return [];
  }

  static {
    this.fileFixturePath = `${FIXTURE_LOAD_PATH}/multipart`;
  }

  override setup(): void {
    super.setup();
    this.controller = new TestController();
    this.request.deleteHeader("PATH_INFO");
    this.routes = new RouteSet();
    this.routes.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });
  }
}

describe("TestCaseTest", () => {
  const FILES_DIR = `${FIXTURE_LOAD_PATH}/multipart`;
  const controllerInfo = { controller: "test_case_test/test", action: "testParams" };
  let tc: TestCaseTest;

  beforeEach(async () => {
    tc = new TestCaseTest(TestController);
    await tc.beforeSetup();
    tc.setup();
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("assert select without body", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("assert select with body", () => {});

  it("url options reset", async () => {
    tc.controller = new DefaultUrlOptionsCachingController();
    await tc.get("testUrlOptionsReset");
    assertNil(tc.request.params["dynamic_opt"]);
    assertMatch(/dynamic_opt=opt/, tc.response.body);
  });

  it("raw post handling", async () => {
    const params = { page: { name: "page name" }, "some key": 123 };
    await tc.post("renderRawPost", { params: { ...params } });

    assertEqual(toQuery(params), tc.response.body);
  });

  it("params round trip", async () => {
    const params = {
      foo: {
        contents: [
          { name: "gorby", id: "123" },
          { name: "puff", d: "true" },
        ],
      },
    };
    await tc.post("testParams", { params: { ...params } });

    assertEqual({ ...params, ...controllerInfo }, JSON.parse(tc.response.body));
  });

  it("handle to params", async () => {
    const klass = class {
      toParam() {
        return "bar";
      }
    };

    await tc.post("testParams", { params: { foo: new klass() } });

    assertEqual("bar", JSON.parse(tc.response.body)["foo"]);
  });

  it("body stream", async () => {
    const params = { page: { name: "page name" }, "some key": 123 };

    await tc.post("renderBody", { params: { ...params } });

    assertEqual(toQuery(params), tc.response.body);
  });

  // BLOCKED: request-body-is-a-string-not-an-io
  it.skip("body stream is binary", () => {});

  it("document body and params with post", async () => {
    await tc.post("testParams", { params: { id: 1 } });
    assertEqual({ id: "1", ...controllerInfo }, JSON.parse(tc.response.body));
  });

  it("document body with post", async () => {
    await tc.post("renderBody", { body: "document body" });
    assertEqual("document body", tc.response.body);
  });

  it("document body with put", async () => {
    await tc.put("renderBody", { body: "document body" });
    assertEqual("document body", tc.response.body);
  });

  it("head", async () => {
    await tc.head("testParams");
    assertEqual(200, tc.response.status);
  });

  it("process without flash", async () => {
    await tc.process("setFlash");
    assertEqual("><", tc.flash.get("test"));
  });

  it("process with flash", async () => {
    await tc.process("setFlash", { method: "GET", flash: { test: "value" } });
    assertEqual(">value<", tc.flash.get("test"));
  });

  it("process with flash now", async () => {
    await tc.process("setFlashNow", { method: "GET", flash: { test_now: "value_now" } });
    assertEqual(">value_now<", tc.flash.get("test_now"));
  });

  it("process delete flash", async () => {
    await tc.process("setFlash");
    await tc.process("deleteFlash");
    assertEmpty(tc.flash);
    assertEmpty(tc.session);
  });

  it("process with session", async () => {
    await tc.process("setSession");
    expect(tc.session.get("string")).toBe("A wonder");
    expect(tc.session.get("symbol")).toBe("it works");
  });

  it("process with session kwarg", async () => {
    await tc.process("noOp", { method: "GET", session: { string: "value1", symbol: "value2" } });
    assertEqual("value1", tc.session.get("string"));
    assertEqual("value1", tc.session.get("string"));
    assertEqual("value2", tc.session.get("symbol"));
    assertEqual("value2", tc.session.get("symbol"));
  });

  it("process merges session arg", async () => {
    tc.session.set("foo", "bar");
    await tc.get("noOp", { session: { bar: "baz" } });
    assertEqual("bar", tc.session.get("foo"));
    assertEqual("baz", tc.session.get("bar"));
  });

  it("merged session arg is retained across requests", async () => {
    await tc.get("noOp", { session: { foo: "bar" } });
    assertEqual("bar", tc.session.get("foo"));
    await tc.get("noOp");
    assertEqual("bar", tc.session.get("foo"));
  });

  it("process overwrites existing session arg", async () => {
    tc.session.set("foo", "bar");
    await tc.get("noOp", { session: { foo: "baz" } });
    assertEqual("baz", tc.session.get("foo"));
  });

  it("session is cleared from controller after reset session", async () => {
    await tc.process("setSession");
    await tc.process("resetTheSession");
    assertEqual({}, tc.controller.session.toHash());
  });

  it("session is cleared from request after reset session", async () => {
    await tc.process("setSession");
    await tc.process("resetTheSession");
    assertEqual({}, tc.request.session.toHash());
  });

  it("response and request have nice accessors", async () => {
    await tc.process("noOp");
    assertEqual(tc.response, tc.response);
    assertEqual(tc.request, tc.request);
  });

  it("process with request uri with no params", async () => {
    await tc.process("testUri");
    assertEqual("/test_case_test/test/testUri", tc.response.body);
  });

  it("process with symbol method", async () => {
    await tc.process("testUri", { method: "get" });
    assertEqual("/test_case_test/test/testUri", tc.response.body);
  });

  it("process with request uri with params", async () => {
    await tc.process("testUri", { method: "GET", params: { id: 7 } });

    assertEqual("/test_case_test/test/testUri/7", tc.response.body);
  });

  it("process with request uri with params with explicit uri", async () => {
    tc.request.env["PATH_INFO"] = "/explicit/uri";
    await tc.process("testUri", { method: "GET", params: { id: 7 } });
    assertEqual("/explicit/uri", tc.response.body);
  });

  it("process with query string", async () => {
    await tc.process("testQueryString", { method: "GET", params: { q: "test" } });
    assertEqual("q=test", tc.response.body);
  });

  it("process with query string with explicit uri", async () => {
    tc.request.env["PATH_INFO"] = "/explicit/uri";
    tc.request.env["QUERY_STRING"] = "q=test?extra=question";
    await tc.process("testQueryString");
    assertEqual("q=test?extra=question", tc.response.body);
  });

  it("multiple calls", async () => {
    await tc.process("testOnlyOneParam", { method: "GET", params: { left: true } });
    assertEqual("OK", tc.response.body);
    await tc.process("testOnlyOneParam", { method: "GET", params: { right: true } });
    assertEqual("OK", tc.response.body);
  });

  it("with routing places routes back", () => {
    assert(tc.routes);
    const routesId = rbObjId(tc.routes!);

    try {
      tc.withRouting(() => {
        throw new Error("fail");
      });
      throw new Error("Should not be here.");
    } catch (e) {
      if (!(e instanceof Error) || e instanceof Assertion) throw e;
    }

    assert(tc.routes);
    assertEqual(routesId, rbObjId(tc.routes!));
  });

  it("remote addr", async () => {
    await tc.get("testRemoteAddr");
    expect(tc.responseBody).toBe("0.0.0.0");

    tc.request.remoteAddr = "192.0.0.1";
    await tc.get("testRemoteAddr");
    expect(tc.responseBody).toBe("192.0.0.1");
  });

  it("header properly reset after remote http request", async () => {
    await tc.get("testParams", { xhr: true });
    expect(tc.request.env["HTTP_X_REQUESTED_WITH"]).toBeUndefined();
    expect(tc.request.env["HTTP_ACCEPT"]).toBeUndefined();
  });

  it("xhr with params", async () => {
    await tc.get("testParams", { params: { id: 1 }, xhr: true });

    assertEqual({ id: "1", ...controllerInfo }, JSON.parse(tc.response.body));
  });

  it("xhr with session", async () => {
    await tc.get("setSession", { xhr: true });

    assertEqual(
      "A wonder",
      tc.session.get("string"),
      "A value stored in the session should be available by string key",
    );
    assertEqual(
      "A wonder",
      tc.session.get("string"),
      "Test session hash should allow indifferent access",
    );
    assertEqual(
      "it works",
      tc.session.get("symbol"),
      "Test session hash should allow indifferent access",
    );
    assertEqual(
      "it works",
      tc.session.get("symbol"),
      "Test session hash should allow indifferent access",
    );
  });

  it("params reset between post requests", async () => {
    await tc.post("noOp", { params: { foo: "bar" } });
    assertEqual("bar", tc.request.params["foo"]);

    await tc.post("noOp");
    assertPredicate(tc.request.params["foo"], isBlank);
  });

  it("filtered parameters reset between requests", async () => {
    await tc.get("noOp", { params: { foo: "bar" } });
    assertEqual("bar", tc.request.filteredParameters()["foo"]);

    await tc.get("noOp", { params: { foo: "baz" } });
    assertEqual("baz", tc.request.filteredParameters()["foo"]);
  });

  it("raw post reset between post requests", async () => {
    await tc.post("noOp", { params: { foo: "bar" } });
    assertEqual("foo=bar", tc.request.rawPost);

    await tc.post("noOp", { params: { foo: "baz" } });
    assertEqual("foo=baz", tc.request.rawPost);
  });

  it("content length reset after post request", async () => {
    await tc.post("noOp", { params: { foo: "bar" } });
    assertNotEqual(0, tc.request.contentLength);

    await tc.get("noOp");
    assertEqual(0, tc.request.contentLength);
  });

  it("path is kept after the request", async () => {
    await tc.get("testParams", { params: { id: "foo" } });
    assertEqual("/test_case_test/test/testParams/foo", tc.request.path);
  });

  it("path params reset between request", async () => {
    await tc.get("testParams", { params: { id: "foo" } });
    assertEqual("foo", tc.request.pathParameters["id"]);

    await tc.get("testParams");
    assertNil(tc.request.pathParameters["id"]);
  });

  it("request protocol is reset after request", async () => {
    await tc.get("testProtocol");
    assertEqual("http://", tc.response.body);

    tc.request.env["HTTPS"] = "on";
    await tc.get("testProtocol");
    assertEqual("https://", tc.response.body);

    delete tc.request.env["HTTPS"];
    await tc.get("testProtocol");
    assertEqual("http://", tc.response.body);
  });

  it("request format", async () => {
    await tc.get("testFormat", { params: { format: "html" } });
    assertEqual("text/html", tc.response.body);

    await tc.get("testFormat", { params: { format: "json" } });
    assertEqual("application/json", tc.response.body);

    await tc.get("testFormat", { params: { format: "xml" } });
    assertEqual("application/xml", tc.response.body);

    await tc.get("testFormat");
    assertEqual("text/html", tc.response.body);
  });

  it("request format kwarg", async () => {
    await tc.get("testFormat", { format: "html" });
    assertEqual("text/html", tc.response.body);

    await tc.get("testFormat", { format: "json" });
    assertEqual("application/json", tc.response.body);

    await tc.get("testFormat", { format: "xml" });
    assertEqual("application/xml", tc.response.body);

    await tc.get("testFormat");
    assertEqual("text/html", tc.response.body);
  });

  it("request format kwarg overrides params", async () => {
    await tc.get("testFormat", { format: "json", params: { format: "html" } });
    assertEqual("application/json", tc.response.body);
  });

  it("request format kwarg doesnt mutate params", async () => {
    const params = Object.freeze({ foo: "bar" });

    await assertNothingRaised(async () => {
      await tc.get("testFormat", { format: "json", params });
    });
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
    await tc.post("testParams", { params: { id: "12345" }, as: "json" });
    expect(tc.request.pathParameters["id"]).toBe("12345");
  });

  it("should have knowledge of client side cookie state even if they are not set", async () => {
    tc.cookies.set("foo", "bar");
    await tc.get("noOp");
    assertEqual("bar", tc.cookies.get("foo"));
  });

  it("cookies should be escaped properly", async () => {
    tc.cookies.set("foo", "+");
    await tc.get("renderCookie");
    assertEqual("+", tc.response.body);
  });

  it("should detect if cookie is deleted", async () => {
    tc.cookies.set("foo", "bar");
    await tc.get("deleteCookie");
    assertNil(tc.cookies.get("foo"));
  });

  it("multiple mixed method process should scrub rack input", async () => {
    await tc.post("testParams", { params: { id: 1, foo: "an foo" } });
    assertEqual({ id: "1", foo: "an foo", ...controllerInfo }, JSON.parse(tc.response.body));

    await tc.get("testParams", { params: { bar: "an bar" } });
    assertEqual({ bar: "an bar", ...controllerInfo }, JSON.parse(tc.response.body));
  });

  for (const variable of ["controller", "response", "request"] as const) {
    for (const method of ["get", "post", "put", "delete", "head", "process"] as const) {
      it(`${variable} missing for ${method} raises error`, async () => {
        delete (tc as Partial<TestCaseTest>)[variable];
        try {
          await tc[method]("testRemoteAddr");
          assert(false, "expected RuntimeError, got nothing");
        } catch (error) {
          if (error instanceof RuntimeError) {
            assertMatch(new RegExp(`@${variable} is nil`), error.message);
          } else if (error instanceof Assertion) {
            throw error;
          } else {
            assert(false, `expected RuntimeError, got ${rbObjClass(error as object)}`);
          }
        }
      });
    }
  }

  const READ_BINARY = "rb:binary";
  const READ_PLAIN = "r:binary";

  it("test uploaded file", () => {
    const filename = "ruby_on_rails.jpg";
    const path = `${FILES_DIR}/${filename}`;
    const contentType = "image/png";
    const expected = File.read(path, { encoding: Encoding.BINARY });

    const file = new UploadedFile(path, contentType);
    assertEqual(filename, file.originalFilename);
    assertEqual(contentType, file.contentType);
    assertEqual(file.path, file.localPath);
    assertEqual(expected, file.read());

    const newContentType = "new content_type";
    file.contentType = newContentType;
    assertEqual(newContentType, file.contentType);
  });

  it("test uploaded file with binary", () => {
    const filename = "ruby_on_rails.jpg";
    const path = `${FILES_DIR}/${filename}`;
    const contentType = "image/png";

    const binaryUploadedFile = new UploadedFile(path, contentType, true);
    assertEqual(File.open(path, READ_BINARY).read(), binaryUploadedFile.read());

    const plainUploadedFile = new UploadedFile(path, contentType);
    assertEqual(File.open(path, READ_PLAIN).read(), plainUploadedFile.read());
  });

  it("fixture file upload with binary", () => {
    const filename = "ruby_on_rails.jpg";
    const path = `${FILES_DIR}/${filename}`;
    const contentType = "image/jpeg";

    const binaryFileUpload = tc.fixtureFileUpload(path, contentType, true);
    assertEqual(File.open(path, READ_BINARY).read(), binaryFileUpload.read());

    const plainFileUpload = tc.fixtureFileUpload(path, contentType);
    assertEqual(File.open(path, READ_PLAIN).read(), plainFileUpload.read());
  });

  it("fixture file upload should be able access to tempfile", () => {
    const file = tc.fixtureFileUpload(FILES_DIR + "/ruby_on_rails.jpg", "image/jpeg");
    assertRespondTo(file, "tempfile");
  });

  it("fixture file upload", async () => {
    await tc.post("testFileUpload", {
      params: {
        file: tc.fixtureFileUpload(FILES_DIR + "/ruby_on_rails.jpg", "image/jpeg"),
      },
    });
    assertEqual("45142", tc.response.body);
  });

  it("fixture file upload ignores fixture paths given full path", () => {
    const fixturePaths = vi
      .spyOn(TestCaseTest, "fixturePaths")
      .mockReturnValue([import.meta.dirname]);
    try {
      const uploadedFile = tc.fixtureFileUpload(`${FILES_DIR}/ruby_on_rails.jpg`, "image/jpeg");
      assertEqual(
        File.open(`${FILES_DIR}/ruby_on_rails.jpg`, READ_PLAIN).read(),
        uploadedFile.read(),
      );
    } finally {
      fixturePaths.mockRestore();
    }
  });

  it("fixture file upload ignores empty fixture paths", () => {
    const uploadedFile = tc.fixtureFileUpload(`${FILES_DIR}/ruby_on_rails.jpg`, "image/jpeg");
    assertEqual(
      File.open(`${FILES_DIR}/ruby_on_rails.jpg`, READ_PLAIN).read(),
      uploadedFile.read(),
    );
  });

  it("action dispatch uploaded file upload", async () => {
    const filename = "ruby_on_rails.jpg";
    const path = `${FILES_DIR}/${filename}`;
    await tc.post("testFileUpload", {
      params: { file: new UploadedFile(path, "image/jpeg", true) },
    });
    assertEqual("45142", tc.response.body);
  });

  it("test uploaded file exception when file doesnt exist", async () => {
    await assertRaise([RuntimeError], {}, () => {
      new UploadedFile("non_existent_file");
    });
  });

  it("redirect url only cares about location header", async () => {
    await tc.get("create");
    tc.assertResponse("created");

    assertEqual("/resource", tc.response.redirectUrl);
    assertEqual(tc.response.redirectUrl, tc.redirectToUrl());

    await assertRaise([Assertion], {}, () => {
      tc.assertRedirectedTo("/resource");
    });
  });

  it("exception in action reaches test", async () => {
    await assertRaise([RuntimeError], {}, async () => {
      await tc.process("boom", { method: "GET" });
    });
  });

  it("request state is cleared after exception", async () => {
    await assertRaise([RuntimeError], {}, async () => {
      await tc.process("boom", { method: "GET", params: { q: "test1" } });
    });

    await tc.process("testQueryString", { method: "GET", params: { q: "test2" } });

    assertEqual("q=test2", tc.response.body);
  });

  it("parsed body without as option", async () => {
    await tc.post("renderJson", { body: { foo: "heyo" } });
    assertEqual({ foo: "heyo" }, (tc.response as TestResponse).parsedBody);
  });

  it("parsed body with as option", async () => {
    await tc.post("renderJson", { body: JSON.stringify({ foo: "heyo" }), as: "json" });
    assertEqual({ foo: "heyo" }, (tc.response as TestResponse).parsedBody);
  });

  it("reset instance variables after each request", async () => {
    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);

    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);
  });

  it("can read instance variables before and after request", async () => {
    silenceWarnings(() => {
      assertNil(rbObjIvarGet(tc.controller, "@counter"));
    });

    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);
    assertEqual(1, rbObjIvarGet(tc.controller, "@counter"));

    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);
    assertEqual(1, rbObjIvarGet(tc.controller, "@counter"));
  });

  it("ivars are not reset if they are given a value before any requests", async () => {
    rbObjIvarSet(tc.controller, "@counter", 3);

    await tc.get("incrementCount");
    assertEqual("4", tc.response.body);
    assertEqual(4, rbObjIvarGet(tc.controller, "@counter"));

    await tc.get("incrementCount");
    assertEqual("5", tc.response.body);
    assertEqual(5, rbObjIvarGet(tc.controller, "@counter"));

    await tc.get("incrementCount");
    assertEqual("6", tc.response.body);
    assertEqual(6, rbObjIvarGet(tc.controller, "@counter"));
  });

  it("ivars are reset if they are given a value after some requests", async () => {
    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);
    assertEqual(1, rbObjIvarGet(tc.controller, "@counter"));

    rbObjIvarSet(tc.controller, "@counter", 3);

    await tc.get("incrementCount");
    assertEqual("1", tc.response.body);
    assertEqual(1, rbObjIvarGet(tc.controller, "@counter"));
  });

  it("original fullpath doesnt change when path is changed", async () => {
    await tc.get("originalFullpath");
    assertEqual("/test_case_test/test/originalFullpath", tc.response.body);
  });
});

class ResponseDefaultHeadersTestController extends Base {
  async removeHeader() {
    this.headers.delete(this.params.get("header") as string);
    this.head("ok", { C: "3" });
  }

  async leaveAlone() {
    this.head("ok");
  }
}
Object.defineProperty(ResponseDefaultHeadersTestController, "name", {
  value: "ResponseDefaultHeadersTest::TestController",
});

class ResponseDefaultHeadersTest extends TestCase {
  original: typeof Response.defaultHeaders;
  defaults!: Record<string, string>;

  override beforeSetup(): unknown {
    this.original = Response.defaultHeaders;
    this.defaults = { A: "1", B: "2" };
    Response.defaultHeaders = this.defaults;
    return super.beforeSetup();
  }

  static {
    this.teardown(function (this: ResponseDefaultHeadersTest) {
      Response.defaultHeaders = this.original;
    });
  }

  override setup(): void {
    super.setup();
    this.controller = new ResponseDefaultHeadersTestController();
    this.request.env["PATH_INFO"] = null;
    this.routes = new RouteSet();
    this.routes.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });
  }
}

describe("ResponseDefaultHeadersTest", () => {
  let tc: ResponseDefaultHeadersTest;

  beforeEach(async () => {
    tc = new ResponseDefaultHeadersTest();
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    tc.afterTeardown({ failures: [] });
  });

  it("response contains default headers", async () => {
    await tc.get("leaveAlone");

    const expectedHeaders = { ...tc.defaults, "Content-Type": "text/html" };

    for (const [key, value] of Object.entries(expectedHeaders)) {
      assertEqual(value, tc.response.headers.get(key));
    }
  });

  it("response deletes a default header", async () => {
    await tc.get("removeHeader", { params: { header: "A" } });
    tc.assertResponse("ok");

    assertNotIncludes(tc.response.headers, "A");
    assertIncludes(tc.response.headers, "B");
    assertIncludes(tc.response.headers, "C");
  });
});

describe("BarControllerTest", () => {
  // BLOCKED: actionpack-tests-cannot-load-rails-engine
  it.skip("engine controller route", () => {});
});

describe("BarControllerTestWithExplicitRouteSet", () => {
  // BLOCKED: actionpack-tests-cannot-load-rails-engine
  it.skip("engine controller route", () => {});
});

describe("InferringClassNameTest", () => {
  const determineClass = (name: string) => TestCase.determineDefaultControllerClass(name);

  it("determine controller class", () => {
    assertEqual(ContentController, determineClass("ContentControllerTest"));
  });

  it("determine controller class with nonsense name", () => {
    assertNil(determineClass("HelloGoodBye"));
  });

  it("determine controller class with sensible name where no controller exists", () => {
    assertNil(determineClass("NoControllerWithThisNameTest"));
  });
});

class ManuallySetNameTest extends TestCase {
  static {
    this.tests(ContentController);
  }
}

describe("ManuallySetNameTest", () => {
  it("controller class can be set manually not just inferred", () => {
    assertEqual(ContentController, ManuallySetNameTest.controllerClass);
  });
});

class ManuallySetSymbolNameTest extends TestCase {
  static {
    this.tests("content");
  }
}

describe("ManuallySetSymbolNameTest", () => {
  it("set controller class using symbol", () => {
    assertEqual(ContentController, ManuallySetSymbolNameTest.controllerClass);
  });
});

class ManuallySetStringNameTest extends TestCase {
  static {
    this.tests("content");
  }
}

describe("ManuallySetStringNameTest", () => {
  it("set controller class using string", () => {
    assertEqual(ContentController, ManuallySetStringNameTest.controllerClass);
  });
});

describe("NamedRoutesControllerTest", () => {
  // BLOCKED: routing-assertions-method-missing-delegates-to-controller
  it.skip("should be able to use named routes before a request is done", () => {});
});

class AnonymousControllerTest extends TestCase {
  override setup(): void {
    this.controller = new (class extends Base {
      async index() {
        await this.render({ plain: this.params.get("controller") as string });
      }
    })();

    this.routes = new RouteSet();
    this.routes.draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))");
      });
    });
  }
}

describe("AnonymousControllerTest", () => {
  it("controller name", async () => {
    const tc = new AnonymousControllerTest();
    await tc.beforeSetup();
    tc.setup();

    await tc.get("index");
    assertEqual("anonymous", tc.response.body);
  });
});

class RoutingDefaultsTest extends TestCase {
  override setup(): void {
    this.controller = new (class extends Base {
      async post() {
        await this.render({ plain: this.request.fullpath });
      }

      async project() {
        await this.render({ plain: this.request.fullpath });
      }
    })();

    this.routes = new RouteSet();
    this.routes.draw(function () {
      this.get("/posts/:id", { to: "anonymous#post", bucket_type: "post" });
      this.get("/projects/:id", { to: "anonymous#project", defaults: { bucket_type: "project" } });
    });
  }
}

describe("RoutingDefaultsTest", () => {
  let tc: RoutingDefaultsTest;

  beforeEach(async () => {
    tc = new RoutingDefaultsTest();
    await tc.beforeSetup();
    tc.setup();
  });

  it("route option can be passed via process", async () => {
    await tc.get("post", { params: { id: 1, bucket_type: "post" } });
    assertEqual("/posts/1", tc.response.body);
  });

  it("route default is not required for building request uri", async () => {
    await tc.get("project", { params: { id: 2 } });
    assertEqual("/projects/2", tc.response.body);
  });
});
