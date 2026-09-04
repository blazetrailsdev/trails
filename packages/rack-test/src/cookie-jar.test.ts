import { assertEmpty } from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";
import { Cookie, CookieJar } from "./cookie-jar.js";

describe("Rack::Test::CookieJar", () => {
  const cookieValue = "foo;abc";
  const cookieName = "a_cookie_name";

  const dup = (jar: CookieJar): CookieJar =>
    (Object.create(CookieJar.prototype) as CookieJar).initializeCopy(jar);

  it("copies should not share a cookie jar", () => {
    const jar = new CookieJar();
    const jarDup = dup(jar);
    const jarClone = dup(jar);

    jar.set("a", "b");
    expect(jar.toHash()).toEqual({ a: "b" });
    assertEmpty(jarDup.toHash());
    assertEmpty(jarClone.toHash());
  });

  it("ignores leading dot in domain", () => {
    const jar = new CookieJar();
    jar.push(new Cookie("a=c; domain=.lithostech.com", new URL("https://lithostech.com")));
    expect(jar.getCookie("a")!.domain()).toBe("lithostech.com");
  });

  it("#[] and []= should get and set cookie values", () => {
    const jar = new CookieJar();
    expect(jar.get(cookieName)).toBeUndefined();
    jar.set(cookieName, cookieValue);
    expect(jar.get(cookieName)).toBe(cookieValue);
    expect(jar.get(`${cookieName}a`)).toBeUndefined();
  });

  it("#get_cookie with a populated jar returns full cookie objects", () => {
    const jar = new CookieJar();
    expect(jar.getCookie(cookieName)).toBeUndefined();
    jar.set(cookieName, cookieValue);
    expect(jar.getCookie(cookieName)).toBeInstanceOf(Cookie);
    expect(jar.getCookie(`${cookieName}a`)).toBeUndefined();
  });

  it("#for returns the cookie header string delimited by semicolon and a space", () => {
    const jar = new CookieJar();
    jar.set("a", "b");
    jar.set("c", "d");

    expect(jar.for(null)).toBe("a=b; c=d");
  });

  it("#to_hash returns a hash of cookies", () => {
    const jar = new CookieJar();
    jar.set("a", "b");
    jar.set("c", "d");
    expect(jar.toHash()).toEqual({ a: "b", c: "d" });
  });

  it("#merge merges valid raw cookie strings", () => {
    const jar = new CookieJar();
    jar.set("a", "b");
    jar.merge("c=d");
    expect(jar.toHash()).toEqual({ a: "b", c: "d" });
  });

  it("#merge does not merge invalid raw cookie strings", () => {
    const jar = new CookieJar();
    jar.set("a", "b");
    jar.merge("c=d; domain=example.org; secure", new URL("/", "http://example.org/"));
    expect(jar.toHash()).toEqual({ a: "b" });
  });

  it("#merge ignores empty cookies in cookie strings", () => {
    const jar = new CookieJar();
    jar.merge("", new URL("/", "http://example.org/"));
    jar.merge("\nc=d");
    expect(jar.toHash()).toEqual({ c: "d" });
  });

  it("#merge ignores empty cookies in cookie arrays", () => {
    const jar = new CookieJar();
    jar.merge(["", "c=d"], new URL("/", "http://example.org/"));
    expect(jar.toHash()).toEqual({ c: "d" });
  });
});
