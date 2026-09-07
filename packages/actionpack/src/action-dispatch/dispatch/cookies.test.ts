import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Response } from "@blazetrails/rack";
import { CookieJar } from "../cookies.js";
import { cookiesSameSiteProtection, type RequestCookieMethodsHost } from "../middleware/cookies.js";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";

function jarWithSameSiteProtection(
  proc: (request: { userAgent?: string }) => unknown,
  userAgent?: string,
): CookieJar {
  const env: Record<string, unknown> = {
    "action_dispatch.cookies_same_site_protection": proc,
  };
  const request = {
    env,
    getHeader: (name: string) => env[name],
    hasHeader: (name: string) => name in env,
    userAgent,
    cookies: {},
    cookiesAppOptions: {},
    cookiesSameSiteProtection,
  };
  return CookieJar.build(request as never, {});
}

const SECRET_KEY_BASE = "b3c631c314c0bbca50c1b2843150fe33";

function cookieEnv(env: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "action_dispatch.key_generator": new KeyGenerator(SECRET_KEY_BASE, { iterations: 2 }),
    "action_dispatch.signed_cookie_salt": "signed cookie",
    "action_dispatch.encrypted_cookie_salt": "encrypted cookie",
    "action_dispatch.encrypted_signed_cookie_salt": "signed encrypted cookie",
    ...env,
  };
}

function cookieRequest(env: Record<string, unknown> = {}): RequestCookieMethodsHost {
  const e = cookieEnv(env);
  return {
    env: e,
    getHeader: (name: string) => e[name],
    hasHeader: (name: string) => Object.hasOwn(e, name),
    cookies: {},
  };
}

function setCookieHeaders(jar: CookieJar): string[] {
  const response = new Response();
  jar.write(response);
  const header = response.headers["set-cookie"];
  if (header === undefined || header === null) return [];
  return Array.isArray(header) ? header : [header];
}

describe("CookieJarTest", () => {
  it("fetch", () => {
    const jar = CookieJar.build(cookieRequest(), { foo: "bar" });
    expect(jar.fetch("foo")).toBe("bar");
  });

  it("fetch exists", () => {
    const jar = CookieJar.build(cookieRequest(), { foo: "bar" });
    expect(jar.fetch("foo", "default")).toBe("bar");
  });

  it("fetch block", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    expect(jar.fetch("missing", "fallback")).toBe("fallback");
  });

  it("key is to s", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", "bar");
    expect(jar.get("foo")).toBe("bar");
  });

  it("to hash", () => {
    const jar = CookieJar.build(cookieRequest(), { a: "1", b: "2" });
    expect(jar.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("fetch type error", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    expect(() => jar.fetch("missing")).toThrow(/key not found/);
  });

  it("each", () => {
    const jar = CookieJar.build(cookieRequest(), { a: "1", b: "2" });
    const entries: [string, string][] = [];
    jar.each((k, v) => entries.push([k, v]));
    expect(entries).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("enumerable", () => {
    const jar = CookieJar.build(cookieRequest(), { x: "10", y: "20" });
    const entries = [...jar];
    expect(entries).toEqual([
      ["x", "10"],
      ["y", "20"],
    ]);
  });

  it("key methods", () => {
    const jar = CookieJar.build(cookieRequest(), { foo: "bar" });
    expect(jar.has("foo")).toBe(true);
    expect(jar.has("baz")).toBe(false);
    expect(jar.keys).toEqual(["foo"]);
    expect(jar.values).toEqual(["bar"]);
  });

  it("write doesnt set a nil header", () => {
    const jar = new CookieJar(cookieRequest());
    const response = new Response();
    jar.write(response);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});

describe("CookiesMiddlewareTest", () => {
  it("sets expected cookie header", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", "david");
    const headers = setCookieHeaders(jar);
    expect(headers.length).toBe(1);
    expect(headers[0]).toContain("user_name=david");
    expect(headers[0]).toContain("path=/");
  });
});

describe("CookiesTest", () => {
  it("setting cookie with same site strict", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", { value: "bar", sameSite: "strict" });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("samesite=strict");
  });

  it("setting cookie with same site nil", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", { value: "bar", sameSite: null });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("samesite");
  });

  it("setting cookie with specific same site strict", () => {
    const jar = jarWithSameSiteProtection(() => "lax");
    jar.set("foo", { value: "bar", sameSite: "strict" });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("samesite=strict");
  });

  it("setting cookie with specific same site nil", () => {
    const jar = jarWithSameSiteProtection(() => "lax");
    jar.set("foo", { value: "bar", sameSite: null });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("samesite");
  });

  it("setting cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
  });

  it("setting the same value to cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", "david");
    jar.set("user_name", "david");
    expect(jar.size).toBe(1);
  });

  it("setting the same value to permanent cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.permanent.set("user_name", "david");
    jar.permanent.set("user_name", "david");
    expect(jar.size).toBe(1);
  });

  it("setting cookie for fourteen days", () => {
    const jar = new CookieJar(cookieRequest());
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    jar.set("user_name", { value: "david", expires });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("expires=");
  });

  it("setting cookie expires from a Temporal.Instant", () => {
    const jar = new CookieJar(cookieRequest());
    const instant = Temporal.Instant.from("2030-04-15T12:00:00Z");
    jar.set("user_name", { value: "david", expires: instant });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("expires=Mon, 15 Apr 2030 12:00:00 GMT");
  });

  it("setting cookie for fourteen days with symbols", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", {
      value: "david",
      expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
    expect(jar.get("user_name")).toBe("david");
  });

  it("setting cookie with http only", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", { value: "david", httpOnly: true });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("httponly");
  });

  it("setting cookie with secure", () => {
    const jar = CookieJar.build({ env: { HTTPS: "on" }, ssl: true } as never, {});
    jar.set("user_name", { value: "david", secure: true });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("secure");
  });

  it("not setting cookie with secure", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", { value: "david", secure: false });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("secure");
  });

  it("multiple cookies", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", "david");
    jar.set("login", "yes");
    expect(jar.get("user_name")).toBe("david");
    expect(jar.get("login")).toBe("yes");
    expect(setCookieHeaders(jar).length).toBe(2);
  });

  it("setting test cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("_test", "value");
    expect(jar.get("_test")).toBe("value");
  });

  it("expiring cookie", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "david" });
    jar.delete("user_name");
    expect(jar.get("user_name")).toBeUndefined();
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("max-age=0");
  });

  it("delete cookie with path", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "david" });
    jar.delete("user_name", { path: "/admin" });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("path=/admin");
  });

  it("delete cookie return value", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "david" });
    const val = jar.delete("user_name");
    expect(val).toBe("david");
  });

  it("delete unexisting cookie return value", () => {
    const jar = new CookieJar(cookieRequest());
    const val = jar.delete("nonexistent");
    expect(val).toBeUndefined();
  });

  it("delete unexisting cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.delete("nonexistent");
    expect(jar.has("nonexistent")).toBe(false);
  });

  it("deleted cookie predicate", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "david" });
    jar.delete("user_name");
    expect(jar.isDeleted("user_name")).toBe(true);
  });

  it("deleted cookie predicate with mismatching options", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "david" });
    jar.delete("user_name", { path: "/admin" });
    expect(jar.isDeleted("user_name", { path: "/" })).toBe(false);
    expect(jar.isDeleted("user_name", { path: "/admin" })).toBe(true);
  });

  it("cookies persist throughout request", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
    jar.set("login", "yes");
    expect(jar.get("user_name")).toBe("david");
    expect(jar.get("login")).toBe("yes");
  });

  it("set permanent cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.permanent.set("user_name", "david");
    expect(jar.get("user_name")).toBe("david");
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("expires=");
  });

  it("read permanent cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.permanent.set("user_name", "david");
    expect(jar.permanent.get("user_name")).toBe("david");
  });

  it("signed cookie using default digest", () => {
    const jar = new CookieJar(cookieRequest());
    jar.signed.set("user_id", "42");
    const raw = jar.get("user_id");
    expect(raw).toContain("--");
    expect(jar.signed.get("user_id")).toBe("42");
  });

  it("tampered with signed cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.signed.set("user_id", "42");
    jar.set("user_id", "99--fakesignature");
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("signed cookie round trip", () => {
    const jar1 = new CookieJar(cookieRequest());
    jar1.signed.set("session_id", "abc123");
    const raw = jar1.get("session_id")!;

    const jar2 = CookieJar.build(cookieRequest(), { session_id: raw });
    expect(jar2.signed.get("session_id")).toBe("abc123");
  });

  it("encrypted cookie round trip", () => {
    const jar = new CookieJar(cookieRequest());
    jar.encrypted.set("data", "sensitive");
    const raw = jar.get("data");
    expect(raw).not.toBe("sensitive");
    expect(raw).toContain("--");
    expect(jar.encrypted.get("data")).toBe("sensitive");
  });

  it("tampered encrypted cookie returns undefined", () => {
    const jar = new CookieJar(cookieRequest());
    jar.encrypted.set("data", "secret");
    jar.set("data", "tampered--value");
    expect(jar.encrypted.get("data")).toBeUndefined();
  });

  it("setting cookie with no same site protection", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", { value: "bar" });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("samesite");
  });

  it.skip("setting cookie with secure on onion address", () => {});

  it("setting cookie with same site protection proc normal user agent", () => {
    const jar = jarWithSameSiteProtection((request) =>
      request.userAgent === "spooky browser" ? undefined : "strict",
    );
    jar.set("user_name", "david");
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("samesite=strict");
  });

  function assertDeletedCookie(jar: CookieJar) {
    expect(jar.get("user_name")).toBeUndefined();
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("user_name=");
    expect(headers[0]).toContain("max-age=0");
    expect(headers[0]).toContain("expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }

  it("deleting cookie get", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie post", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie patch", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie put", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie delete", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("deleting cookie head", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    assertDeletedCookie(jar);
  });

  it("signed cookie using default serializer", () => {
    const jar = new CookieJar(cookieRequest());
    jar.signed.set("user_id", 45);
    expect(jar.signed.get("user_id")).toBe(45);
  });

  it("signed cookie using json serializer", () => {
    const mockRequest = {
      env: cookieEnv({ "action_dispatch.cookies_serializer": "json" }),
      cookies: {},
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.signed.set("user_id", 45);
    expect(jar.signed.get("user_id")).toBe(45);
  });

  it("signed cookie using custom serializer", () => {
    const customSerializer = {
      dump: (v: unknown) => `${v} was dumped`,
      load: (s: string) => `${s} and loaded`,
      dumped: (_s: string) => false,
    };
    const mockRequest = {
      env: cookieEnv({ "action_dispatch.cookies_serializer": customSerializer }),
      cookies: {},
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.signed.set("user_id", "45");
    expect(jar.signed.get("user_id")).toBe("45 was dumped and loaded");
  });

  it("accessing nonexistent signed cookie should not raise an invalid signature", () => {
    const jar = new CookieJar(cookieRequest());
    expect(jar.signed.get("non_existent_attribute")).toBeUndefined();
  });

  it("encrypted cookie using default serializer", () => {
    const jar = new CookieJar(cookieRequest());
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar");
    expect(jar.signed.get("foo")).toBeUndefined();
  });

  it("encrypted cookie using json serializer", () => {
    const mockRequest = {
      env: cookieEnv({ "action_dispatch.cookies_serializer": "json" }),
      cookies: {},
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar");
  });

  it("encrypted cookie using custom serializer", () => {
    const customSerializer = {
      dump: (v: unknown) => `${v} was dumped`,
      load: (s: string) => `${s} and loaded`,
      dumped: (_s: string) => false,
    };
    const mockRequest = {
      env: cookieEnv({ "action_dispatch.cookies_serializer": customSerializer }),
      cookies: {},
    };
    const jar = CookieJar.build(mockRequest as any, {});
    jar.encrypted.set("foo", "bar");
    expect(jar.encrypted.get("foo")).toBe("bar was dumped and loaded");
  });

  it("signed cookie using hybrid serializer can migrate marshal dumped value to json", () => {
    const marshalJar = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": "marshal" }),
    );
    marshalJar.signed.set("user_id", 45);
    const marshalValue = marshalJar.get("user_id")!;

    const jar = CookieJar.build(cookieRequest({ "action_dispatch.cookies_serializer": "hybrid" }), {
      user_id: marshalValue,
    });

    expect(jar.get("user_id")).not.toBe(45);
    expect(jar.signed.get("user_id")).toBe(45);

    const jsonJar = CookieJar.build(
      cookieRequest({ "action_dispatch.cookies_serializer": "json" }),
      { user_id: jar.get("user_id")! },
    );
    expect(jsonJar.signed.get("user_id")).toBe(45);
  });

  it("purpose metadata for signed cookies", () => {
    const jar = new CookieJar(cookieRequest());
    jar.signed.set("discount_percentage", 50);
    jar.signed.set("user_id", 45);
    jar.set("discount_percentage", jar.get("user_id")!);
    expect(jar.signed.get("discount_percentage")).toBe(45);

    const withMetadata = new CookieJar(
      cookieRequest({ "action_dispatch.use_cookies_with_metadata": true }),
    );
    withMetadata.signed.set("discount_percentage", 50);
    withMetadata.signed.set("user_id", 45);
    withMetadata.set("discount_percentage", withMetadata.get("user_id")!);
    expect(withMetadata.signed.get("discount_percentage")).toBeUndefined();
  });

  it("purpose metadata for encrypted cookies", () => {
    const jar = new CookieJar(cookieRequest());
    jar.encrypted.set("discount_percentage", 50);
    jar.encrypted.set("user_id", 45);
    jar.set("discount_percentage", jar.get("user_id")!);
    expect(jar.encrypted.get("discount_percentage")).toBe(45);

    const withMetadata = new CookieJar(
      cookieRequest({ "action_dispatch.use_cookies_with_metadata": true }),
    );
    withMetadata.encrypted.set("discount_percentage", 50);
    withMetadata.encrypted.set("user_id", 45);
    withMetadata.set("discount_percentage", withMetadata.get("user_id")!);
    expect(withMetadata.encrypted.get("discount_percentage")).toBeUndefined();
  });

  it("accessing nonexistent encrypted cookie should not raise invalid message", () => {
    const jar = new CookieJar(cookieRequest());
    expect(jar.encrypted.get("non_existent_attribute")).toBeUndefined();
  });

  it("setting invalid encrypted cookie should return nil when accessing it", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", "invalid--9170e9a2394f1f2d5bca0f4b4309cf3f");
    expect(jar.encrypted.get("foo")).toBeUndefined();
  });

  it("delete and set cookie", () => {
    const jar = CookieJar.build(cookieRequest(), { user_name: "Joe" });
    jar.delete("user_name");
    jar.set("user_name", "Bob");
    expect(jar.get("user_name")).toBe("Bob");
    const headers = setCookieHeaders(jar);
    expect(headers.length).toBe(1);
  });

  it("raise data overflow", () => {
    const jar = new CookieJar(cookieRequest());
    expect(() => jar.signed.set("foo", "bye!".repeat(1024))).toThrow(/overflowed/);
  });

  it("tampered cookies", () => {
    const jar = new CookieJar(cookieRequest());
    jar.signed.set("user_id", "45");
    jar.set("user_id", "tampered--fakesig");
    expect(() => jar.signed.get("user_id")).not.toThrow();
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("legacy signed cookie is treated as nil by signed cookie jar if tampered", () => {
    const jar = CookieJar.build(cookieRequest(), { user_id: "45" });
    expect(jar.signed.get("user_id")).toBeUndefined();
  });

  it("legacy signed cookie is treated as nil by encrypted cookie jar if tampered", () => {
    const jar = CookieJar.build(cookieRequest(), { foo: "baz" });
    expect(jar.encrypted.get("foo")).toBeUndefined();
  });

  it("setting cookie with same site protection proc special user agent", () => {
    const jar = jarWithSameSiteProtection(
      (request) => (request.userAgent === "spooky browser" ? undefined : "strict"),
      "spooky browser",
    );
    jar.set("user_name", "david");
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("samesite");
  });

  it.skip("setting cookie with misspelled same site protection raises", () => {});

  it.skip("setting cookie with secure when always write cookie is true", () => {});

  it.skip("signed cookie using custom digest", () => {});

  it.skip("signed cookie rotating secret and digest", () => {});

  it.skip("signed cookie using marshal serializer", () => {});

  it.skip("wrapped signed cookie using json serializer", () => {});

  it.skip("signed cookie using message pack serializer", () => {});

  it.skip("signed cookie using marshal serializer can read from json dumped value", () => {});

  it.skip("signed cookie using hybrid serializer can read from json dumped value", () => {});

  it.skip("signed cookie using json serializer will drop marshal dumped value", () => {});

  it.skip("signed cookie using message pack serializer can migrate json dumped value to message pack", () => {});

  it.skip("encrypted cookie using marshal serializer", () => {});

  it.skip("wrapped encrypted cookie using json serializer", () => {});

  it.skip("encrypted cookie using message pack serializer", () => {});

  it.skip("encrypted cookie using hybrid serializer can migrate marshal dumped value to json", () => {});

  it.skip("encrypted cookie using hybrid serializer can read from json dumped value", () => {});

  it.skip("encrypted cookie using json serializer will drop marshal dumped value", () => {});

  it.skip("encrypted cookie using message pack serializer can migrate json dumped value to message pack", () => {});

  it.skip("cookie jar mutated by request persists on future requests", () => {});

  it.skip("permanent signed cookie", () => {});

  it.skip("use authenticated cookie encryption uses legacy hmac aes cbc encryption when not enabled", () => {});

  it.skip("rotating signed cookies digest", () => {});

  it.skip("legacy hmac aes cbc marshal mode falls back to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc json mode falls back to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc encrypted marshal cookie is upgraded to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc encrypted json cookie is upgraded to authenticated encrypted cookie", () => {});
});
