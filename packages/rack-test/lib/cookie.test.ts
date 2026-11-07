import { Time } from "@blazetrails/date";
import { include, type Included } from "@blazetrails/activesupport";
import type { MockResponse, RackApp, Request } from "@blazetrails/rack";
import { beforeEach, describe, expect, it } from "vitest";
import { Cookie, CookieJar } from "./cookie-jar.js";
import { FAKE_APP } from "./fixtures/fake-app.js";
import { Methods, type MethodsHost, Session } from "./index.js";

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Methods`; the class/interface merge is how a mixin surfaces on the type side. */
interface Spec extends Included<typeof Methods> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class Spec implements MethodsHost {
  app: RackApp = FAKE_APP;

  declare _rackTestCurrentSession: Session | undefined;
}
include(Spec, Methods);

let spec: Spec;

beforeEach(() => {
  spec = new Spec();
});

const get = (uri: string, params?: unknown, env?: Record<string, unknown>): Promise<MockResponse> =>
  spec.get(uri, params, env);
const post = (uri: string, params?: unknown): Promise<MockResponse> => spec.post(uri, params);
const request = (uri: string, env?: Record<string, unknown>): Promise<MockResponse> =>
  spec.request(uri, env);
const lastRequest = (): Request => spec.lastRequest();
const rackMockSession = (): Session => spec.rackMockSession();
const clearCookies = (): void => spec.clearCookies();
const setCookie = (cookie: unknown): void => spec.setCookie(cookie);
const followRedirectBang = (): Promise<MockResponse> => spec.followRedirectBang();

describe("Rack::Test::Session", () => {
  it("keeps a cookie jar", async () => {
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({});

    await get("/cookies/set", { value: "1" });
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "1" });
  });

  it("doesn't send expired cookies", async () => {
    await get("/cookies/set", { value: "1" });
    const cookie = (rackMockSession().cookieJar as unknown as { _cookies: Cookie[] })._cookies[0];
    cookie.isExpired = () => true;
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("cookie path defaults to the directory of the document that was requested", async () => {
    await post("/cookies/default-path", { value: "cookie" });
    await get("/cookies/default-path");
    expect(lastRequest().cookies).toEqual({ simple: "cookie" });
    await get("/cookies/default-path/sub");
    expect(lastRequest().cookies).toEqual({ simple: "cookie" });
    await get("/");
    expect(lastRequest().cookies).toEqual({});
    await get("/COOKIES/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it('uses the first "path" when multiple paths are defined', () => {
    const cookieString = [
      "/",
      "csrf_id=ABC123",
      "path=/, _github_ses=ABC123",
      "path=/",
      "expires=Wed, 01 Jan 2020 08:00:00 GMT",
      "HttpOnly",
    ].join(CookieJar.DELIMITER);
    const cookie = new Cookie(cookieString);
    expect(cookie.path()).toBe("/");
  });

  it('uses the single "path" when only one path is defined', () => {
    const cookieString = ["/", "csrf_id=ABC123", "path=/cookie", "HttpOnly"].join(
      CookieJar.DELIMITER,
    );
    const cookie = new Cookie(cookieString);
    expect(cookie.path()).toBe("/cookie");
  });

  it("attribute names are case-insensitive", () => {
    const cookieString = [
      "/",
      "csrf_id=ABC123",
      "Path=/cookie",
      "Expires=Wed, 01 Jan 2020 08:00:00 GMT",
      "HttpOnly",
      "Secure",
    ].join(CookieJar.DELIMITER);
    const cookie = new Cookie(cookieString);

    expect(cookie.path()).toBe("/cookie");
    expect(cookie.isSecure()).toBe(true);
    expect(cookie.isHttpOnly()).toBe(true);
    expect(cookie.expires()!.toI()).toBe(Time.parse("Wed, 01 Jan 2020 08:00:00 GMT").toI());
  });

  it("escapes cookie values", () => {
    const jar = new CookieJar();
    jar.set("value", "foo;abc");
    expect(jar.get("value")).toBe("foo;abc");
  });

  it("deletes cookies directly from the CookieJar", () => {
    const jar = new CookieJar();
    jar.set("abcd", "1234");
    expect(jar.get("abcd")).toBe("1234");
    jar.delete("abcd");
    expect(jar.get("abcd")).toBeUndefined();
  });

  it("allow symbol access", () => {
    const jar = new CookieJar();
    jar.set("value", "foo;abc");
    expect(jar.get({ toString: () => "value" })).toBe("foo;abc");
  });

  it("doesn't send cookies with the wrong domain", async () => {
    await get("http://www.example.com/cookies/set", { value: "1" });
    await get("http://www.other.example/cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("doesn't send cookies with the wrong path", async () => {
    await get("/cookies/set", { value: "1" });
    await get("/not-cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("persists cookies across requests that don't return any cookie headers", async () => {
    await get("/cookies/set", { value: "1" });
    await get("/void");
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "1" });
  });

  it("deletes cookies", async () => {
    await get("/cookies/set", { value: "1" });
    await get("/cookies/delete");
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("respects cookie domains when no domain is explicitly set", async () => {
    expect((await request("http://example.org/cookies/count")).body).toBe("1");
    expect((await request("http://www.example.org/cookies/count")).body).toBe("1");
    expect((await request("http://example.org/cookies/count")).body).toBe("2");
    expect((await request("http://www.example.org/cookies/count")).body).toBe("2");
  });

  it("treats domains case insensitively", async () => {
    await get("http://example.com/cookies/set", { value: "1" });
    await get("http://EXAMPLE.COM/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "1" });
  });

  it("treats paths case sensitively", async () => {
    await get("/cookies/set", { value: "1" });
    await get("/COOKIES/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("prefers more specific cookies", async () => {
    await get("http://example.com/cookies/set", { value: "domain" });
    await get("http://sub.example.com/cookies/set", { value: "sub" });

    await get("http://sub.example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "sub" });

    await get("http://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "domain" });
  });

  it("treats cookie names case insensitively", async () => {
    await get("/cookies/set", { value: "lowercase" });
    await get("/cookies/set-uppercase", { value: "UPPERCASE" });
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ VALUE: "UPPERCASE" });
  });

  it("defaults the domain to the request domain", async () => {
    await get("http://example.com/cookies/set-simple", { value: "cookie" });
    await get("http://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ simple: "cookie" });

    await get("http://other.example/cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("defaults the domain to the request path up to the last slash", async () => {
    await get("/cookies/set-simple", { value: "1" });
    await get("/not-cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("supports secure cookies", async () => {
    await get("https://example.com/cookies/set-secure", { value: "set" });
    await get("http://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({});

    await get("https://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ "secure-cookie": "set" });
    expect(rackMockSession().cookieJar.get("secure-cookie")).toBe("set");
  });

  it("supports secure cookies when enabling SSL via env", async () => {
    await get("//example.com/cookies/set-secure", { value: "set" }, { HTTPS: "on" });
    await get("//example.com/cookies/show", null, { HTTPS: "off" });
    expect(lastRequest().cookies).toEqual({});

    await get("//example.com/cookies/show", null, { HTTPS: "on" });
    expect(lastRequest().cookies).toEqual({ "secure-cookie": "set" });
    expect(rackMockSession().cookieJar.get("secure-cookie")).toBe("set");
  });

  it("keeps separate cookie jars for different domains", async () => {
    await get("http://example.com/cookies/set", { value: "example" });
    await get("http://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "example" });

    await get("http://other.example/cookies/set", { value: "other" });
    await get("http://other.example/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "other" });

    await get("http://example.com/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "example" });
  });

  it("keeps one cookie jar for domain and its subdomains", async () => {
    await get("http://example.org/cookies/subdomain");
    await get("http://example.org/cookies/subdomain");
    expect(lastRequest().cookies).toEqual({ count: "1" });

    await get("http://foo.example.org/cookies/subdomain");
    expect(lastRequest().cookies).toEqual({ count: "2" });
  });

  it("allows cookies to be cleared", async () => {
    await get("/cookies/set", { value: "1" });
    clearCookies();
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({});
  });

  it("allow cookies to be set", async () => {
    setCookie("value=10");
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "10" });
  });

  it("allows an array of cookies to be set", async () => {
    setCookie(["value=10", "foo=bar"]);
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "10", foo: "bar" });
  });

  it("skips emtpy string cookies", async () => {
    setCookie("value=10\n\nfoo=bar");
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "10", foo: "bar" });
  });

  it("parses multiple cookies properly", async () => {
    await get("/cookies/set-multiple");
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ key1: "value1", key2: "value2" });
  });

  it("supports multiple sessions", async () => {
    await spec.withSession(":first", async () => {
      await get("/cookies/set", { value: "1" });
      await get("/cookies/show");
      expect(lastRequest().cookies).toEqual({ value: "1" });
    });

    await spec.withSession(":second", async () => {
      await get("/cookies/show");
      expect(lastRequest().cookies).toEqual({});
    });
  });

  it("uses :default as the default session name", async () => {
    await get("/cookies/set", { value: "1" });
    await get("/cookies/show");
    expect(lastRequest().cookies).toEqual({ value: "1" });

    await spec.withSession(":default", async () => {
      await get("/cookies/show");
      expect(lastRequest().cookies).toEqual({ value: "1" });
    });
  });

  it("accepts explicitly provided cookies", async () => {
    await request("/cookies/show", { ":cookie": "value=1" });
    expect(lastRequest().cookies).toEqual({ value: "1" });
  });

  it("sets and subsequently sends cookies when redirecting to the path of the cookie", async () => {
    await get("/redirect-with-cookie");
    await followRedirectBang();
    expect(lastRequest().cookies).toEqual({ value: "1" });
  });
});
