import { describe, it, expect } from "vitest";
import { TestCase, TestRequest, LiveTestResponse, TestSession } from "./test-case.js";
import { UploadedFile } from "../action-dispatch/http/upload.js";
import { Base } from "./base.js";

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
    expect(s.fetch("c", () => "lazy")).toBe("lazy");
    expect(s.fetch("d", (k: string) => `missing:${k}`)).toBe("missing:d");
    expect(() => s.fetch("missing")).toThrow();
  });

  it("idWas / loadBang return the constructor-frozen id", () => {
    const s = new TestSession({}, "abc123");
    expect(s.idWas()).toBe("abc123");
    expect(s.loadBang()).toBe("abc123");
  });
});

describe("TestCase class helpers", () => {
  class PostsController extends Base {}

  it("tests(class) sets controllerClass", () => {
    class Sub extends TestCase {}
    Sub.tests(PostsController);
    expect(Sub.controllerClass).toBe(PostsController);
  });

  it("tests(string) resolves <Name>Controller via globalThis", () => {
    (globalThis as Record<string, unknown>).WidgetController = PostsController;
    try {
      class Sub extends TestCase {}
      Sub.tests("widget");
      expect(Sub.controllerClass).toBe(PostsController);
    } finally {
      delete (globalThis as Record<string, unknown>).WidgetController;
    }
  });

  it("tests(string) raises NameError-style when no matching constant exists", () => {
    class Sub extends TestCase {}
    expect(() => Sub.tests("nonexistent_blarg")).toThrow(
      /uninitialized constant NonexistentBlargController/,
    );
  });

  it("controllerClass is per-class — subclasses don't inherit the base's setting", () => {
    class Base1 extends TestCase {}
    class Sub1 extends Base1 {}
    Base1.tests(PostsController);
    expect(Base1.controllerClass).toBe(PostsController);
    // Sub1 never set its own controllerClass; it should infer (returns
    // null here since no matching constant), not pick up Base1's value.
    expect(Sub1.controllerClass).toBeNull();
  });

  it("controllerClassName returns the configured class name", () => {
    class Sub extends TestCase {}
    Sub.tests(PostsController);
    const tc = new Sub(PostsController);
    expect(tc.controllerClassName()).toBe("PostsController");
  });

  it("determineDefaultControllerClass strips trailing Test and looks up", () => {
    (globalThis as Record<string, unknown>).BooksController = PostsController;
    try {
      expect(TestCase.determineDefaultControllerClass("BooksControllerTest")).toBe(PostsController);
      expect(TestCase.determineDefaultControllerClass("MissingTest")).toBeNull();
    } finally {
      delete (globalThis as Record<string, unknown>).BooksController;
    }
  });
});

describe("ActionController::TestRequest helpers", () => {
  it("queryString= sets QUERY_STRING header", () => {
    const req = TestRequest.create();
    req.queryString = "foo=bar&baz=1";
    expect(req.getHeader("QUERY_STRING")).toBe("foo=bar&baz=1");
  });

  it("contentType= sets CONTENT_TYPE header", () => {
    const req = TestRequest.create();
    req.contentType = "application/json";
    expect(req.getHeader("CONTENT_TYPE")).toBe("application/json");
  });

  it("newSession returns a TestSession", () => {
    const session = TestRequest.newSession();
    expect(session).toBeInstanceOf(TestSession);
    expect(session.isExists()).toBe(true);
  });

  it("create returns a TestRequest with default env", () => {
    const req = TestRequest.create();
    expect(req).toBeInstanceOf(TestRequest);
    expect(req.getHeader("HTTP_HOST")).toBe("test.host");
  });

  it("defaultEnv omits PATH_INFO (Rails: DEFAULT_ENV.delete)", () => {
    const env = TestRequest.defaultEnv();
    expect("PATH_INFO" in env).toBe(false);
    expect(env["HTTP_HOST"]).toBe("test.host");
  });

  it("assignParameters wires path + query params for GET", () => {
    const req = TestRequest.create();
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

  it("assignParameters encodes body for POST url-encoded", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/x-www-form-urlencoded");
    req.assignParameters(null, "posts", "create", { title: "Hello" }, "/posts", ["title"]);
    const body = req.getHeader("rack.input") ?? "";
    expect(body).toContain("title=Hello");
    expect(req.requestParameters).toMatchObject({ title: "Hello" });
  });

  it("assignParameters builds real multipart body when params include an UploadedFile", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    const file = new UploadedFile({ filename: "hello.txt", type: "text/plain", content: "hi" });
    req.assignParameters(null, "uploads", "create", { upload: file }, "/uploads", ["upload"]);
    const ct = req.getHeader("CONTENT_TYPE") ?? "";
    expect(ct).toContain("multipart/form-data");
    expect(ct).toContain("boundary=");
    const body = req.getHeader("rack.input") ?? "";
    expect(body).toContain(`name="upload"; filename="hello.txt"`);
    expect(req.requestParameters["upload"]).toBeInstanceOf(UploadedFile);
  });

  it("assignParameters registers custom parser for unknown content types, wired into requestParameters", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/vnd.custom+json");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    // Custom parser returns the non-path-parameters hash directly
    const parsed = req.requestParameters;
    expect(parsed).toMatchObject({ x: "1" });
  });

  it("paramsParsers returns the custom parsers map", () => {
    const req = TestRequest.create();
    const parsers = req.paramsParsers();
    expect(typeof parsers).toBe("object");
    expect(parsers).toHaveProperty("xml");
  });
});

describe("ActionController::LiveTestResponse predicates", () => {
  it("isSuccess is true for 2xx responses", () => {
    const r = new LiveTestResponse(200, {}, [""]);
    expect(r.isSuccess).toBe(true);
    const r4 = new LiveTestResponse(404, {}, [""]);
    expect(r4.isSuccess).toBe(false);
  });

  it("isMissing is true only for 404", () => {
    expect(new LiveTestResponse(404, {}, [""]).isMissing).toBe(true);
    expect(new LiveTestResponse(403, {}, [""]).isMissing).toBe(false);
  });

  it("isError is true for 5xx responses", () => {
    expect(new LiveTestResponse(500, {}, [""]).isError).toBe(true);
    expect(new LiveTestResponse(200, {}, [""]).isError).toBe(false);
  });
});
