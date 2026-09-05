import { Time } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { Cookie, CookieJar } from "./cookie-jar.js";

describe("Rack::Test::Session", () => {
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
});
