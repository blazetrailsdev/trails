import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { CookieJar } from "../cookies.js";

describe("CookieJarTest", () => {
  it("fetch", () => {
    const jar = CookieJar.parse("foo=bar");
    expect(jar.fetch("foo")).toBe("bar");
  });

  it("fetch exists", () => {
    const jar = CookieJar.parse("foo=bar");
    expect(jar.fetch("foo", "default")).toBe("bar");
  });

  it("fetch block", () => {
    const jar = CookieJar.parse("");
    expect(jar.fetch("missing", "fallback")).toBe("fallback");
  });

  it("key is to s", () => {
    const jar = new CookieJar();
    jar.set("foo", "bar");
    expect(jar.get("foo")).toBe("bar");
  });

  it("to hash", () => {
    const jar = CookieJar.parse("a=1; b=2");
    expect(jar.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("fetch type error", () => {
    const jar = CookieJar.parse("");
    expect(() => jar.fetch("missing")).toThrow(/key not found/);
  });

  it("each", () => {
    const jar = CookieJar.parse("a=1; b=2");
    const entries: [string, string][] = [];
    jar.each((k, v) => entries.push([k, v]));
    expect(entries).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("enumerable", () => {
    const jar = CookieJar.parse("x=10; y=20");
    const entries = [...jar];
    expect(entries).toEqual([
      ["x", "10"],
      ["y", "20"],
    ]);
  });

  it("key methods", () => {
    const jar = CookieJar.parse("foo=bar");
    expect(jar.has("foo")).toBe(true);
    expect(jar.has("baz")).toBe(false);
    expect(jar.keys).toEqual(["foo"]);
    expect(jar.values).toEqual(["bar"]);
  });

  it("write doesnt set a nil header", () => {
    const jar = new CookieJar();
    jar.set("test", { value: null as any });
    expect(jar.has("test")).toBe(false);
  });
});

describe("CookiesMiddlewareTest", () => {
  it("sets expected cookie header", () => {
    const jar = new CookieJar();
    jar.set("user_name", "david");
    const headers = jar.getSetCookieHeaders();
    expect(headers.length).toBe(1);
    expect(headers[0]).toContain("user_name=david");
    expect(headers[0]).toContain("path=/");
  });
});

describe("CookiesTest", () => {
  it("setting cookie with same site strict", () => {
    const jar = new CookieJar();
    jar.set("foo", { value: "bar", sameSite: "strict" });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("SameSite=Strict");
  });

  it("setting cookie with same site nil", () => {
    const jar = new CookieJar();
    jar.set("foo", { value: "bar", sameSite: null });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).not.toContain("SameSite");
  });

  it("setting cookie with specific same site strict", () => {
    const jar = new CookieJar({ sameSite: "lax" });
    jar.set("foo", { value: "bar", sameSite: "strict" });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("SameSite=Strict");
  });

  it("setting cookie with specific same site nil", () => {
    const jar = new CookieJar({ sameSite: "lax" });
    jar.set("foo", { value: "bar", sameSite: null });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).not.toContain("SameSite");
  });

  it("setting cookie", () => {
    const jar = new CookieJar();
    jar.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
  });

  it("setting the same value to cookie", () => {
    const jar = new CookieJar();
    jar.set("user_name", "david");
    jar.set("user_name", "david");
    expect(jar.size).toBe(1);
  });

  it("setting the same value to permanent cookie", () => {
    const jar = new CookieJar();
    jar.permanent.set("user_name", "david");
    jar.permanent.set("user_name", "david");
    expect(jar.size).toBe(1);
  });

  it("setting cookie for fourteen days", () => {
    const jar = new CookieJar();
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    jar.set("user_name", { value: "david", expires });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("expires=");
  });

  it("setting cookie expires from a Temporal.Instant", () => {
    const jar = new CookieJar();
    // Pin to a known instant so the rendered RFC 7231 string is deterministic.
    const instant = Temporal.Instant.from("2030-04-15T12:00:00Z");
    jar.set("user_name", { value: "david", expires: instant });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("expires=Mon, 15 Apr 2030 12:00:00 GMT");
  });

  it("setting cookie for fourteen days with symbols", () => {
    const jar = new CookieJar();
    jar.set("user_name", {
      value: "david",
      expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    expect(jar.get("user_name")).toBe("david");
  });

  it("setting cookie with http only", () => {
    const jar = new CookieJar();
    jar.set("user_name", { value: "david", httpOnly: true });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("HttpOnly");
  });

  it("setting cookie with secure", () => {
    const jar = new CookieJar();
    jar.set("user_name", { value: "david", secure: true });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("secure");
  });

  it("not setting cookie with secure", () => {
    const jar = new CookieJar();
    jar.set("user_name", { value: "david", secure: false });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).not.toContain("secure");
  });

  it("multiple cookies", () => {
    const jar = new CookieJar();
    jar.set("user_name", "david");
    jar.set("login", "yes");
    expect(jar.get("user_name")).toBe("david");
    expect(jar.get("login")).toBe("yes");
    expect(jar.getSetCookieHeaders().length).toBe(2);
  });

  it("setting test cookie", () => {
    const jar = new CookieJar();
    jar.set("_test", "value");
    expect(jar.get("_test")).toBe("value");
  });

  it("expiring cookie", () => {
    const jar = CookieJar.parse("user_name=david");
    jar.delete("user_name");
    expect(jar.get("user_name")).toBeUndefined();
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("max-age=0");
  });

  it("delete cookie with path", () => {
    const jar = CookieJar.parse("user_name=david");
    jar.delete("user_name", { path: "/admin" });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("path=/admin");
  });

  it("delete cookie return value", () => {
    const jar = CookieJar.parse("user_name=david");
    const val = jar.delete("user_name");
    expect(val).toBe("david");
  });

  it("delete unexisting cookie return value", () => {
    const jar = new CookieJar();
    const val = jar.delete("nonexistent");
    expect(val).toBeUndefined();
  });

  it("delete unexisting cookie", () => {
    const jar = new CookieJar();
    jar.delete("nonexistent");
    expect(jar.has("nonexistent")).toBe(false);
  });

  it("deleted cookie predicate", () => {
    const jar = CookieJar.parse("user_name=david");
    jar.delete("user_name");
    expect(jar.isDeleted("user_name")).toBe(true);
  });

  it("deleted cookie predicate with mismatching options", () => {
    const jar = CookieJar.parse("user_name=david");
    jar.delete("user_name", { path: "/admin" });
    expect(jar.isDeleted("user_name", { path: "/" })).toBe(false);
    expect(jar.isDeleted("user_name", { path: "/admin" })).toBe(true);
  });

  it("cookies persist throughout request", () => {
    const jar = new CookieJar();
    jar.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
    jar.set("login", "yes");
    expect(jar.get("user_name")).toBe("david");
    expect(jar.get("login")).toBe("yes");
  });

  it("set permanent cookie", () => {
    const jar = new CookieJar();
    jar.permanent.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("expires=");
  });

  it("read permanent cookie", () => {
    const jar = new CookieJar();
    jar.permanent.set("user_name", "david");
    expect(jar.permanent.get("user_name")).toBe("david");
  });

  // --- Signed cookies ---

  it("signed cookie using default digest", () => {
    const jar = new CookieJar({ secret: "test_secret_key_base_1234567890" });
    jar.signed.set("user_id", "42");
    const raw = jar.get("user_id");
    expect(raw).toContain("--");
    expect(jar.signed.get("user_id")).toBe("42");
  });

  it("tampered with signed cookie", () => {
    const jar = new CookieJar({ secret: "test_secret_key_base_1234567890" });
    jar.signed.set("user_id", "42");
    // Tamper with the value
    jar.set("user_id", "99--fakesignature");
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("signed cookie round trip", () => {
    const secret = "super_secret_key_12345678901234";
    const jar1 = new CookieJar({ secret });
    jar1.signed.set("session_id", "abc123");
    const raw = jar1.get("session_id")!;

    // Parse into a new jar
    const jar2 = CookieJar.parse(`session_id=${raw}`, { secret });
    expect(jar2.signed.get("session_id")).toBe("abc123");
  });

  // --- Encrypted cookies ---

  it("encrypted cookie round trip", () => {
    const secret = "super_secret_key_12345678901234";
    const jar = new CookieJar({ secret });
    jar.encrypted.set("data", "sensitive");
    const raw = jar.get("data");
    expect(raw).not.toBe("sensitive");
    expect(raw).toContain("--");
    expect(jar.encrypted.get("data")).toBe("sensitive");
  });

  it("tampered encrypted cookie returns undefined", () => {
    const jar = new CookieJar({ secret: "test_secret_key_base_1234567890" });
    jar.encrypted.set("data", "secret");
    jar.set("data", "tampered--value");
    expect(jar.encrypted.get("data")).toBeUndefined();
  });

  // --- Cookie parsing ---

  it("parse empty cookie header", () => {
    const jar = CookieJar.parse("");
    expect(jar.empty).toBe(true);
  });

  it("parse multiple cookies", () => {
    const jar = CookieJar.parse("a=1; b=2; c=3");
    expect(jar.size).toBe(3);
    expect(jar.get("a")).toBe("1");
    expect(jar.get("b")).toBe("2");
    expect(jar.get("c")).toBe("3");
  });

  it("parse cookie with equals in value", () => {
    const jar = CookieJar.parse("token=abc=def=");
    expect(jar.get("token")).toBe("abc=def=");
  });

  // --- No same site protection ---

  it("setting cookie with no same site protection", () => {
    const jar = new CookieJar();
    jar.set("foo", { value: "bar" });
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).not.toContain("SameSite");
  });

  // --- Default options ---

  it("default secure from jar options", () => {
    const jar = new CookieJar({ secure: true });
    jar.set("foo", "bar");
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("secure");
  });

  it("default httpOnly from jar options", () => {
    const jar = new CookieJar({ httpOnly: true });
    jar.set("foo", "bar");
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("HttpOnly");
  });

  it("default sameSite from jar options", () => {
    const jar = new CookieJar({ sameSite: "lax" });
    jar.set("foo", "bar");
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("SameSite=Lax");
  });

  it("default domain from jar options", () => {
    const jar = new CookieJar({ domain: ".example.com" });
    jar.set("foo", "bar");
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("domain=.example.com");
  });

  it.skip("setting cookie with secure on onion address", () => {
    // Rails sets request.host = "fake.onion" to test that .onion hosts are
    // exempt from the HTTPS-only secure-cookie restriction; requires
    // controller/request stack not available at CookieJar unit level (S11)
  });

  it.skip("setting cookie with same site protection proc normal user agent", () => {
    // SameSite proc callback not wired (S11 handle_options)
  });

  function assertDeletedCookie(jar: CookieJar) {
    expect(jar.get("user_name")).toBeUndefined();
    const headers = jar.getSetCookieHeaders();
    expect(headers[0]).toContain("user_name=");
    expect(headers[0]).toContain("max-age=0");
    expect(headers[0]).toContain("expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }

  it("deleting cookie get", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie post", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie patch", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie put", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie delete", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie head", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("signed cookie using default serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const jar = new CookieJar({ secret });
    jar.signed.set("user_id", 45);
    expect(jar.signed.get("user_id")).toBe(45);
  });

  it("signed cookie using json serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const mockRequest = {
      env: { "action_dispatch.cookies_serializer": "json" },
      cookies: {},
      cookiesAppOptions: { secret },
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.signed.set("user_id", 45);
    expect(jar.signed.get("user_id")).toBe(45);
  });

  it("signed cookie using custom serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const customSerializer = {
      dump: (v: unknown) => `${v} was dumped`,
      load: (s: string) => `${s} and loaded`,
      dumped: (_s: string) => false,
    };
    const mockRequest = {
      env: { "action_dispatch.cookies_serializer": customSerializer },
      cookies: {},
      cookiesAppOptions: { secret },
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.signed.set("user_id", "45");
    expect(jar.signed.get("user_id")).toBe("45 was dumped and loaded");
  });

  it("accessing nonexistent signed cookie should not raise an invalid signature", () => {
    const jar = new CookieJar({ secret: "b3c631c314c0bbca50c1b2843150fe33" });
    expect(jar.signed.get("non_existent_attribute")).toBeUndefined();
  });

  it("encrypted cookie using default serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const jar = new CookieJar({ secret });
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar");
    expect(jar.signed.get("foo")).toBeUndefined();
  });

  it("encrypted cookie using json serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const mockRequest = {
      env: { "action_dispatch.cookies_serializer": "json" },
      cookies: {},
      cookiesAppOptions: { secret },
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar");
  });

  it("encrypted cookie using custom serializer", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const customSerializer = {
      dump: (v: unknown) => `${v} was dumped`,
      load: (s: string) => `${s} and loaded`,
      dumped: (_s: string) => false,
    };
    const mockRequest = {
      env: { "action_dispatch.cookies_serializer": customSerializer },
      cookies: {},
      cookiesAppOptions: { secret },
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar was dumped and loaded");
  });

  it("accessing nonexistent encrypted cookie should not raise invalid message", () => {
    const jar = new CookieJar({ secret: "b3c631c314c0bbca50c1b2843150fe33" });
    expect(jar.encrypted.get("non_existent_attribute")).toBeUndefined();
  });

  it("setting invalid encrypted cookie should return nil when accessing it", () => {
    const jar = new CookieJar({ secret: "b3c631c314c0bbca50c1b2843150fe33" });
    jar.set("foo", "invalid--9170e9a2394f1f2d5bca0f4b4309cf3f");
    expect(jar.encrypted.get("foo")).toBeUndefined();
  });

  it("delete and set cookie", () => {
    const jar = CookieJar.parse("user_name=Joe");
    jar.delete("user_name");
    jar.set("user_name", "Bob");
    expect(jar.get("user_name")).toBe("Bob");
    const headers = jar.getSetCookieHeaders();
    expect(headers.length).toBe(1);
  });

  it("raise data overflow", () => {
    const jar = new CookieJar({ secret: "b3c631c314c0bbca50c1b2843150fe33" });
    expect(() => jar.signed.set("foo", "bye!".repeat(1024))).toThrow(/overflowed/);
  });

  it("tampered cookies", () => {
    const jar = new CookieJar({ secret: "b3c631c314c0bbca50c1b2843150fe33" });
    jar.signed.set("user_id", "45");
    jar.set("user_id", "tampered--fakesig");
    expect(() => jar.signed.get("user_id")).not.toThrow();
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("legacy signed cookie is treated as nil by signed cookie jar if tampered", () => {
    const jar = CookieJar.parse("user_id=45", { secret: "b3c631c314c0bbca50c1b2843150fe33" });
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("legacy signed cookie is treated as nil by encrypted cookie jar if tampered", () => {
    const jar = CookieJar.parse("foo=baz", { secret: "b3c631c314c0bbca50c1b2843150fe33" });
    expect(jar.encrypted.get("foo")).toBeUndefined();
  });

  it.skip("setting cookie with same site protection proc special user agent", () => {
    // SameSite proc callback not wired (S11 handle_options)
  });

  it.skip("setting cookie with misspelled same site protection raises", () => {
    // SameSite proc callback not wired (S11 handle_options)
  });

  it.skip("setting cookie with secure when always write cookie is true", () => {
    // always_write_cookie not implemented (S11)
  });

  it.skip("signed cookie using custom digest", () => {
    // action_dispatch.signed_cookie_digest env key not wired into CookieJar.signed (S11)
  });

  it.skip("signed cookie rotating secret and digest", () => {
    // key rotation not implemented (S11)
  });

  it.skip("signed cookie using marshal serializer", () => {
    // Marshal serializer not portable to JS
  });

  it.skip("wrapped signed cookie using json serializer", () => {
    // JSONWrapper object serialization gap (S11)
  });

  it.skip("signed cookie using message pack serializer", () => {
    // MessagePack serializer not supported
  });

  it.skip("signed cookie using marshal serializer can read from json dumped value", () => {
    // Marshal serializer not portable to JS
  });

  it.skip("signed cookie using hybrid serializer can migrate marshal dumped value to json", () => {
    // Marshal/hybrid serializer not portable to JS
  });

  it.skip("signed cookie using hybrid serializer can read from json dumped value", () => {
    // Marshal/hybrid serializer not portable to JS
  });

  it.skip("signed cookie using json serializer will drop marshal dumped value", () => {
    // Marshal serializer not portable to JS
  });

  it.skip("signed cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // MessagePack serializer not supported
  });

  it.skip("encrypted cookie using marshal serializer", () => {
    // Marshal serializer not portable to JS
  });

  it.skip("wrapped encrypted cookie using json serializer", () => {
    // JSONWrapper object serialization gap (S11)
  });

  it.skip("encrypted cookie using message pack serializer", () => {
    // MessagePack serializer not supported
  });

  it.skip("encrypted cookie using hybrid serializer can migrate marshal dumped value to json", () => {
    // Marshal/hybrid serializer not portable to JS
  });

  it.skip("encrypted cookie using hybrid serializer can read from json dumped value", () => {
    // Marshal/hybrid serializer not portable to JS
  });

  it.skip("encrypted cookie using json serializer will drop marshal dumped value", () => {
    // Marshal serializer not portable to JS
  });

  it.skip("encrypted cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // MessagePack serializer not supported
  });

  it.skip("cookie jar mutated by request persists on future requests", () => {
    // Requires ActionController::TestCase request infrastructure
  });

  it.skip("permanent signed cookie", () => {
    // PermanentCookieJar.signed not implemented (S11)
  });

  it.skip("use authenticated cookie encryption uses legacy hmac aes cbc encryption when not enabled", () => {
    // CBC legacy mode not implemented (S11)
  });

  it.skip("rotating signed cookies digest", () => {
    // key rotation not implemented (S11)
  });

  it.skip("legacy hmac aes cbc marshal mode falls back to authenticated encrypted cookie", () => {
    // CBC legacy mode not implemented (S11)
  });

  it.skip("legacy hmac aes cbc json mode falls back to authenticated encrypted cookie", () => {
    // CBC legacy mode not implemented (S11)
  });

  it.skip("legacy hmac aes cbc encrypted marshal cookie is upgraded to authenticated encrypted cookie", () => {
    // CBC legacy mode not implemented (S11)
  });

  it.skip("legacy hmac aes cbc encrypted json cookie is upgraded to authenticated encrypted cookie", () => {
    // CBC legacy mode not implemented (S11)
  });
});
