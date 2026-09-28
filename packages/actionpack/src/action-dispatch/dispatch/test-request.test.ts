import { describe, expect, it } from "vitest";
import { Lint } from "@blazetrails/rack";
import { StringIO } from "@blazetrails/ruby-compat";
import type { CookieJar } from "../middleware/cookies.js";
import { TestRequest } from "../testing/test-request.js";

function assertCookies(expected: Record<string, string | null>, cookieJar: CookieJar): void {
  expect(
    Object.fromEntries((cookieJar as unknown as { _cookies: Map<string, string> })._cookies),
  ).toEqual(expected);
}

describe("TestRequestTest", () => {
  it("reasonable defaults", () => {
    const env = TestRequest.create().env;

    expect(env["REQUEST_METHOD"]).toBe("GET");
    expect(env["HTTPS"]).toBe("off");
    expect(env["rack.url_scheme"]).toBe("http");
    expect(env["SERVER_NAME"]).toBe("example.org");
    expect(env["SERVER_PORT"]).toBe("80");
    expect(env["PATH_INFO"]).toBe("/");
    expect(env["SCRIPT_NAME"]).toBe("");
    expect(env["QUERY_STRING"]).toBe("");

    expect(env["HTTP_HOST"]).toBe("test.host");
    expect(env["REMOTE_ADDR"]).toBe("0.0.0.0");
    expect(env["HTTP_USER_AGENT"]).toBe("Rails Testing");

    expect(env["rack.errors"]).toBeInstanceOf(StringIO);
  });

  it("cookie jar", () => {
    const req = TestRequest.create({});

    expect(req.cookies).toEqual({});
    expect(req.env["HTTP_COOKIE"]).toBeUndefined();

    req.cookieJar().set("user_name", "david");
    assertCookies({ user_name: "david" }, req.cookieJar());

    req.cookieJar().set("login", "XJ-122");
    assertCookies({ user_name: "david", login: "XJ-122" }, req.cookieJar());

    expect(() => {
      req.cookieJar().set("login", null);
      assertCookies({ user_name: "david", login: null }, req.cookieJar());
    }).not.toThrow();

    req.cookieJar().delete("login");
    assertCookies({ user_name: "david" }, req.cookieJar());

    req.cookieJar().clear();
    assertCookies({}, req.cookieJar());

    req.cookieJar().update({ user_name: "david" });
    assertCookies({ user_name: "david" }, req.cookieJar());
  });

  it("does not complain when there is no application config", () => {
    const req = TestRequest.create({});
    expect(Object.keys(req.env).length).toBeGreaterThan(0);
  });

  it("default remote address is 0.0.0.0", () => {
    const req = TestRequest.create({});
    expect(req.remoteAddr).toBe("0.0.0.0");
  });

  it("allows remote address to be overridden", () => {
    const req = TestRequest.create({ REMOTE_ADDR: "127.0.0.1" });
    expect(req.remoteAddr).toBe("127.0.0.1");
  });

  it("default host is test.host", () => {
    const req = TestRequest.create({});
    expect(req.host).toBe("test.host");
  });

  it("allows host to be overridden", () => {
    const req = TestRequest.create({ HTTP_HOST: "www.example.com" });
    expect(req.host).toBe("www.example.com");
  });

  it("default user agent is 'Rails Testing'", () => {
    const req = TestRequest.create({});
    expect(req.userAgent).toBe("Rails Testing");
  });

  it("allows user agent to be overridden", () => {
    const req = TestRequest.create({ HTTP_USER_AGENT: "GoogleBot" });
    expect(req.userAgent).toBe("GoogleBot");
  });

  it("request_method getter and setter", () => {
    const req = TestRequest.create();
    void req.requestMethod;
    req.requestMethod = "POST";
    expect(req.requestMethod).toBe("POST");
  });

  it("setter methods work and do not change Rack SPEC conformity", async () => {
    const req = TestRequest.create({});
    const get = "GET";

    req.requestMethod = get;
    req.host = get;
    req.requestUri = get;
    req.setIfModifiedSince(get);
    req.setIfNoneMatch(get);
    req.remoteAddr = get;
    req.userAgent = get;
    req.accept = get;

    req.path = "/get";
    req.port = "8080";
    req.accept = "hello goodbye";

    await new Lint(() => [200, {}, []]).call(req.env);

    expect(req.getHeader("REQUEST_METHOD")).toBe(get);
    expect(req.getHeader("HTTP_HOST")).toBe(get);
    expect(req.getHeader("SERVER_PORT")).toBe("8080");
    expect(req.getHeader("REQUEST_URI")).toBe(get);
    expect(req.getHeader("PATH_INFO")).toBe("/get");
    expect(req.getHeader("HTTP_IF_MODIFIED_SINCE")).toBe(get);
    expect(req.getHeader("HTTP_IF_NONE_MATCH")).toBe(get);
    expect(req.getHeader("REMOTE_ADDR")).toBe(get);
    expect(req.getHeader("HTTP_USER_AGENT")).toBe(get);
    expect(req.getHeader("action_dispatch.request.accepts")).toBeUndefined();
    expect(req.getHeader("HTTP_ACCEPT")).toBe("hello goodbye");
  });
});
