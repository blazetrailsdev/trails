import { beforeEach, describe, it, expect, vi } from "vitest";
import { BigDecimal, include, isModuleIncluded, TopLevel } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import {
  b,
  registerConstant,
  setVerbose,
  stderr,
  StringIO,
  unregisterConstant,
  verbose,
} from "@blazetrails/ruby-compat";
import { SessionId } from "@blazetrails/rack-session";
import { UploadedFile } from "@blazetrails/rack-test";
import {
  Behavior,
  LiveTestResponse,
  TestCase,
  TestRequest,
  TestSession,
  newControllerThread,
} from "./test-case.js";
import {
  Buffer as LiveBuffer,
  Live,
  cleanUpThreadLocals as liveCleanUpThreadLocals,
  newControllerThread as liveNewControllerThread,
} from "./metal/live.js";
import { Base } from "./base.js";
import { Metal } from "./metal.js";
import { TestResponse } from "../action-dispatch/testing/test-response.js";
import { UploadedFile as HttpUploadedFile } from "../action-dispatch/http/upload.js";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import "../test-helpers/abstract-unit.js";

describe("TestRequest#assignParameters Content-Type case", () => {
  it("raises on a Content-Type no Mime::Type is registered for", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "Application/Vnd.Custom+Json; charset=utf-8");
    expect(() => req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"])).toThrow(
      "Unknown Content-Type: Application/Vnd.Custom+Json; charset=utf-8",
    );
  });

  it("encodes an :xml body with to_xml", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/xml");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    expect(req.getHeader("rack.input").string()).toContain("<x>1</x>");
  });

  it("encodes a :json body with ActiveSupport::JSON.encode", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/json");
    const price = new BigDecimal("1.50");
    req.assignParameters(null, "api", "create", { price, name: "<b>" }, "/api", ["price", "name"]);
    expect(req.getHeader("rack.input").string()).toBe(`{"price":"1.5","name":"\\u003cb\\u003e"}`);
  });
});

describe("ActionController::TestSession", () => {
  it("registers its Ruby constant path for Session#inspect's not-yet-loaded arm", () => {
    expect(TestSession.name).toBe("ActionController::TestSession");
  });
});

describe("TestRequest#assignParameters multipart body", () => {
  it("parses non-ASCII file bytes and text parts back out of the encoded body", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    const file = new UploadedFile(new StringIO(b("héllo")), "text/plain", false, {
      originalFilename: "h.txt",
    });
    req.assignParameters(null, "u", "create", { upload: file, t: "café" }, "/u", ["upload", "t"]);
    const body = req.getHeader("rack.input").string();
    expect(req.getHeader("CONTENT_LENGTH")).toBe(String(body.length));
    expect((req.requestParameters["upload"] as HttpUploadedFile).read()).toBe(b("héllo"));
    expect(req.requestParameters["t"]).toBe("café");
  });
});

describe("TestSession#inspect", () => {
  it("renders the not-yet-loaded arm with the Ruby constant path", () => {
    const session = Object.create(TestSession.prototype) as TestSession;
    expect(session.inspect()).toMatch(
      /^#<ActionController::TestSession:0x[0-9a-f]+ not yet loaded>$/,
    );
  });
});

describe("TestCase._controllerClass", () => {
  it("is a class_attribute, so a subclass inherits the parent's controller class", () => {
    class PostsController extends Base {}
    class Base1 extends TestCase {}
    class Sub1 extends Base1 {}
    Base1.tests(PostsController);
    expect(Sub1.controllerClass).toBe(PostsController);
    expect(Sub1.is_controllerClass).toBe(true);
  });
});

describe("ActionController::Live under test_case.rb", () => {
  it("keeps the originals and runs the controller thread block inline", async () => {
    class LiveController extends Base {}
    include(LiveController, Live);
    const live = LiveController.prototype as unknown as Record<string, unknown>;
    expect(live.originalNewControllerThread).toBe(liveNewControllerThread);
    expect(live.originalCleanUpThreadLocals).toBe(liveCleanUpThreadLocals);
    expect(live.newControllerThread).toBe(newControllerThread);
    expect(LiveBuffer.queueSize).toBeNull();

    const order: string[] = [];
    const p = newControllerThread.call({} as never, () => {
      order.push("inside");
    });
    order.push("after-call");
    await p;
    expect(order).toEqual(["inside", "after-call"]);
  });

  it("builds a LiveTestResponse for a controller that includes Live", async ({ task }) => {
    class LiveController extends Base {}
    include(LiveController, Live);
    class LiveControllerTest extends TestCase {}
    LiveControllerTest.tests(LiveController);
    const tc = new LiveControllerTest(task.name);
    expect(tc.response).toBeUndefined();
    await tc.beforeSetup();
    expect(tc.response).toBeInstanceOf(LiveTestResponse);
  });
});

describe("TestCase::Behavior", () => {
  it("is the module TestCase includes", () => {
    expect(isModuleIncluded(TestCase, Behavior)).toBe(true);
    expect(Object.hasOwn(TestCase.prototype, "process")).toBe(false);
  });

  it("is includable into a test class that is not an ActionController::TestCase", async () => {
    class PlainController extends Base {}
    class PlainTest extends ActiveSupportTestCase {}
    include(PlainTest, Behavior);
    const klass = PlainTest as unknown as typeof TestCase;
    klass.tests(PlainController);
    expect(klass.controllerClass).toBe(PlainController);
    const tc = new klass("test_plain");
    await tc.beforeSetup();
    expect(tc.controller).toBeInstanceOf(PlainController);
  });
});

describe("TestCase#wrap_execution", () => {
  class HeadController extends Base {
    async index() {
      this.head("ok");
    }
  }

  async function request(name: string): Promise<TestCase> {
    const tc = new TestCase(name);
    tc.controller = new HeadController();
    await tc.beforeSetup();
    expect(await tc.get("index")).toBe(tc.response);
    return tc;
  }

  it("wraps the dispatch in the application executor when executor_around_each_request is set", async ({
    task,
  }) => {
    const trails = TopLevel.Trails;
    let wrapped = 0;
    const executor = {
      wrap<T>(block: () => T): T {
        wrapped += 1;
        return block();
      },
    };
    TopLevel.Trails = { application: { executor } } as unknown as typeof trails;
    try {
      await request(task.name);
      expect(wrapped).toBe(0);
      TestCase.executorAroundEachRequest = true;
      await request(task.name);
      expect(wrapped).toBe(1);
    } finally {
      TestCase.executorAroundEachRequest = null;
      TopLevel.Trails = trails;
    }
  });
});

describe("TestCase#setup_controller_request_and_response", () => {
  class UnconstructibleController extends Base {
    constructor() {
      super();
      throw new Error("boom");
    }
  }

  it("warns under $VERBOSE when the controller cannot be constructed", async ({ task }) => {
    class UnconstructibleTest extends TestCase {}
    UnconstructibleTest.tests(UnconstructibleController);
    const written: string[] = [];
    const write = vi.spyOn(stderr, "write").mockImplementation((s: string) => {
      written.push(s);
      return true;
    });
    const was = verbose();
    try {
      await new UnconstructibleTest(task.name).beforeSetup();
      expect(written).toEqual([]);
      setVerbose(true);
      const tc = new UnconstructibleTest(task.name);
      await tc.beforeSetup();
      expect(tc.controller).toBeNull();
      expect(written).toEqual(["could not construct controller UnconstructibleController\n"]);
    } finally {
      setVerbose(was);
      write.mockRestore();
    }
  });

  it("builds the request with no controller class when the controller cannot be constructed", async ({
    task,
  }) => {
    class UnconstructibleTest extends TestCase {}
    UnconstructibleTest.tests(UnconstructibleController);
    const tc = new UnconstructibleTest(task.name);
    await tc.beforeSetup();
    expect(tc.controller).toBeNull();
    expect(tc.request.controllerClass()).toBeNull();
  });

  it("builds the request from the class of the controller it holds", async ({ task }) => {
    class PostsController extends Base {}
    class PostsTest extends TestCase {}
    PostsTest.tests(PostsController);
    const tc = new PostsTest(task.name);
    await tc.beforeSetup();
    expect(tc.request.controllerClass()).toBe(PostsController);
  });
});

describe("TestCase#check_required_ivars", () => {
  it("names the unset ivar when a request is made with no routes", async ({ task }) => {
    await expect(new TestCase(task.name).get("index")).rejects.toThrow(
      "@routes is nil: make sure you set it in your test's setup method.",
    );
  });
});

describe("TestCase#document_root_element", () => {
  class XmlController extends Base {
    async index() {
      await this.render({ xml: "<root><child/></root>" });
    }
  }

  it("parses the response as XML and resets it on the next request", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new XmlController();
    await tc.beforeSetup();
    await tc.get("index");
    const first = tc.htmlDocument;
    expect(tc["documentRootElement"].name).toBe("root");
    await tc.get("index");
    expect(tc.htmlDocument).not.toBe(first);
  });
});

describe("TestCase over a PostsController", () => {
  class PostsController extends Base {
    async index() {
      await this.render({ json: [{ id: 1, title: "Hello" }] });
    }

    async update() {
      const id = this.params.get("id");
      await this.render({ json: { id, updated: true } });
    }

    async destroy() {
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
  }
  class PostsControllerTest extends TestCase {}
  PostsControllerTest.tests(PostsController);
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new PostsControllerTest(task.name);
    await tc.beforeSetup();
  });

  describe("HTTP verb methods", () => {
    it("PATCH dispatches to action", async () => {
      await tc.patch("update", { params: { id: "7" } });
      expect(JSON.parse(tc.response.body).id).toBe("7");
    });

    it("DELETE dispatches to action", async () => {
      await tc.delete("destroy", { params: { id: "1" } });
      expect(tc.controller.status).toBe(204);
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
      await tc.get("redirect_action");
      tc.assertResponse("redirect");
    });

    it("rejects 'success' for non-2xx", async () => {
      await tc.get("render_with_status");
      expect(() => tc.assertResponse("success")).toThrow(
        /Expected response to be a <2XX: success>, but was a <404: Not Found>/,
      );
    });

    it("accepts status symbols like 'not_found'", async () => {
      await tc.get("render_with_status");
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
      await tc.get("render_with_status");
      tc.assertResponse("missing");
    });
  });

  describe("assertRedirectedTo", () => {
    it("passes on correct redirect URL", async () => {
      await tc.get("redirect_action");
      tc.assertRedirectedTo("/posts");
    });

    it("throws on wrong redirect URL", async () => {
      await tc.get("redirect_action");
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
      await tc.get("redirect_action");
      tc.assertRedirectedTo(/\/posts/);
    });
  });

  describe("assertContentType", () => {
    it("matches JSON content type", async () => {
      await tc.get("index");
      expect(tc.response.mediaType).toBe("application/json");
    });

    it("matches plain text content type", async () => {
      await tc.get("render_plain");
      expect(tc.response.mediaType).toBe("text/plain");
    });

    it("matches HTML content type", async () => {
      await tc.get("render_html");
      expect(tc.response.mediaType).toBe("text/html");
    });
  });

  describe("assertHeader", () => {
    it("checks header value", async () => {
      await tc.get("set_custom_header");
      expect(tc.response.getHeader("x-custom")).toBe("test-value");
    });

    it("throws on missing header", async () => {
      await tc.get("index");
      expect(tc.response.getHeader("x-nonexistent")).toBeUndefined();
    });
  });

  describe("Metal controller support", () => {
    it("works with Metal controllers", async ({ task }) => {
      class SimpleMetal extends Metal {
        async index() {
          this.responseBody = "metal response";
          this.contentType = "text/plain";
        }
      }

      const mtc = new TestCase(task.name);
      mtc.controller = new SimpleMetal();
      await mtc.beforeSetup();
      await mtc.get("index");
      expect(mtc.response.body).toBe("metal response");
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
      expect(TestCase.executorAroundEachRequest).toBeFalsy();
      TestCase.executorAroundEachRequest = true;
      expect(TestCase.executorAroundEachRequest).toBe(true);
      TestCase.executorAroundEachRequest = null;
    });

    it("assertTemplate raises (extracted to gem)", () => {
      expect(() => tc.assertTemplate()).toThrow(/extracted to a gem/);
    });
  });
});

describe("TestSession Rails-mirroring API", () => {
  it("isExists / isEnabled are always true (Rails: exists?/enabled?)", () => {
    const s = new TestSession();
    expect(s.isExists()).toBe(true);
    expect(s.isEnabled()).toBe(true);
  });

  it("keys / values reflect stored data", () => {
    const s = new TestSession({ a: 1, b: 2 });
    expect(s.keys()).toEqual(["a", "b"]);
    expect(s.values()).toEqual([1, 2]);
  });

  it("destroy clears stored data", () => {
    const s = new TestSession({ a: 1 });
    s.destroy();
    expect(s.keys()).toEqual([]);
  });

  it("dig stringifies the first key (mirrors Rails)", () => {
    const s = new TestSession({ user: { name: "Ada" } });
    expect(s.dig("user", "name")).toBe("Ada");
    expect(s.dig("missing")).toBeUndefined();
  });

  it("fetch returns the value, the fallback, or throws", () => {
    const s = new TestSession({ a: 1 });
    expect(s.fetch("a")).toBe(1);
    expect(s.fetch("b", 99)).toBe(99);
    expect(s.fetch("c", undefined, () => "lazy")).toBe("lazy");
    expect(s.fetch("d", undefined, (k: string) => `missing:${k}`)).toBe("missing:d");
    expect(() => s.fetch("missing")).toThrow();
  });

  it("idWas / loadBang return the constructor-frozen id", () => {
    const id = new SessionId("abc123");
    const s = new TestSession({}, id);
    expect(s.idWas()).toBe(id);
    expect(s.loadBang()).toBe(id);
  });
});

describe("TestCase class helpers", () => {
  class PostsController extends Base {}

  it("tests(string) resolves <Name>Controller via globalThis", () => {
    class WidgetController extends Base {}
    registerConstant("WidgetController", WidgetController);
    try {
      class Sub extends TestCase {}
      Sub.tests("widget");
      expect(Sub.controllerClass).toBe(WidgetController);
    } finally {
      unregisterConstant("WidgetController", WidgetController);
    }
  });

  it("tests(string) raises NameError-style when no matching constant exists", () => {
    class Sub extends TestCase {}
    expect(() => Sub.tests("nonexistent_blarg")).toThrow(
      /uninitialized constant NonexistentBlargController/,
    );
  });

  it("controllerClassName returns the controller's path", ({ task }) => {
    class Sub extends TestCase {}
    Sub.tests(PostsController);
    const tc = new Sub(task.name);
    tc.setupControllerRequestAndResponse();
    expect(tc.controllerClassName()).toBe("posts");
  });

  it("determineDefaultControllerClass strips trailing Test and looks up", () => {
    registerConstant("BooksController", PostsController);
    try {
      expect(TestCase.determineDefaultControllerClass("BooksControllerTest")).toBe(PostsController);
      expect(TestCase.determineDefaultControllerClass("MissingTest")).toBeNull();
    } finally {
      unregisterConstant("BooksController", PostsController);
    }
  });
});

describe("ActionController::TestRequest helpers", () => {
  it("queryString= sets QUERY_STRING header", () => {
    const req = TestRequest.create(null);
    req.queryString = "foo=bar&baz=1";
    expect(req.getHeader("QUERY_STRING")).toBe("foo=bar&baz=1");
  });

  it("contentType= sets CONTENT_TYPE header", () => {
    const req = TestRequest.create(null);
    req.contentType = "application/json";
    expect(req.getHeader("CONTENT_TYPE")).toBe("application/json");
  });

  it("newSession returns a TestSession", () => {
    const session = TestRequest.newSession();
    expect(session).toBeInstanceOf(TestSession);
    expect(session.isExists()).toBe(true);
  });

  it("create returns a TestRequest with default env", () => {
    const req = TestRequest.create(null);
    expect(req).toBeInstanceOf(TestRequest);
    expect(req.getHeader("HTTP_HOST")).toBe("test.host");
  });

  it("defaultEnv omits PATH_INFO (Rails: DEFAULT_ENV.delete)", () => {
    const env = TestRequest.defaultEnv();
    expect("PATH_INFO" in env).toBe(false);
    expect(env["HTTP_HOST"]).toBe("test.host");
  });

  it("assignParameters wires path + query params for GET", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "GET");
    req.assignParameters(null, "posts", "index", { id: "42", format: "json" }, "/posts/42", [
      "format",
    ]);
    expect(req.pathParameters["controller"]).toBe("posts");
    expect(req.pathParameters["action"]).toBe("index");
    expect(req.pathParameters["id"]).toBe("42");
    const qs = req.getHeader("QUERY_STRING") ?? "";
    expect(qs).toContain("format=json");
  });

  it("assignParameters leaves a present-but-empty PATH_INFO alone (Rails: fetch_header)", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "GET");
    req.setHeader("PATH_INFO", "");
    req.assignParameters(null, "posts", "index", {}, "/posts", []);
    expect(req.getHeader("PATH_INFO")).toBe("");
  });

  it("assignParameters encodes body for POST url-encoded", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/x-www-form-urlencoded");
    req.assignParameters(null, "posts", "create", { title: "Hello" }, "/posts", ["title"]);
    const body = req.getHeader("rack.input").string();
    expect(body).toContain("title=Hello");
    expect(req.requestParameters).toMatchObject({ title: "Hello" });
  });

  it("assignParameters builds real multipart body when params include an UploadedFile", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    const file = new UploadedFile(new StringIO("hi"), "text/plain", false, {
      originalFilename: "hello.txt",
    });
    req.assignParameters(null, "uploads", "create", { upload: file }, "/uploads", ["upload"]);
    const ct = req.getHeader("CONTENT_TYPE") ?? "";
    expect(ct).toContain("multipart/form-data");
    expect(ct).toContain("boundary=");
    const body = req.getHeader("rack.input").string();
    expect(body).toContain(`name="upload"; filename="hello.txt"`);
    const upload = req.requestParameters["upload"] as HttpUploadedFile;
    expect(upload).toBeInstanceOf(HttpUploadedFile);
    expect(upload).not.toBe(file);
    expect(upload.originalFilename).toBe("hello.txt");
    expect(upload.contentType).toBe("text/plain");
    expect(upload.read()).toBe("hi");
  });

  it("assignParameters registers custom parser for unknown content types, wired into requestParameters", () => {
    const req = TestRequest.create(null);
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/vnd.custom+json");
    MimeType.register("application/vnd.custom+json", ":custom");
    try {
      req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
      const parsed = req.requestParameters;
      expect(parsed).toMatchObject({ x: "1" });
    } finally {
      MimeType.unregister(":custom");
    }
  });

  it("paramsParsers returns the custom parsers map", () => {
    const req = TestRequest.create(null);
    const parsers = req.paramsParsers();
    expect(typeof parsers).toBe("object");
    expect(parsers).toHaveProperty([":xml"]);
  });
});

describe("ActionController::LiveTestResponse predicates", () => {
  it("isSuccess is true for 2xx responses", () => {
    const r = new LiveTestResponse(200);
    expect(r.isSuccess).toBe(true);
    const r4 = new LiveTestResponse(404);
    expect(r4.isSuccess).toBe(false);
  });

  it("isMissing is true only for 404", () => {
    expect(new LiveTestResponse(404).isMissing).toBe(true);
    expect(new LiveTestResponse(403).isMissing).toBe(false);
  });

  it("isError is true for 5xx responses", () => {
    expect(new LiveTestResponse(500).isError).toBe(true);
    expect(new LiveTestResponse(200).isError).toBe(false);
  });
});
