import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Response } from "@blazetrails/rack";
import { CookieJar } from "../cookies.js";
import { cookiesSameSiteProtection, type RequestCookieMethodsHost } from "../middleware/cookies.js";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import "@blazetrails/activesupport/message-pack";
import {
  assertEqual,
  assertNotIncludes,
  assertMatch,
  assertNil,
  assertNotEqual,
  assertNotNil,
  assertRaise,
} from "@blazetrails/activesupport";
import { ArgumentError, JSON, Marshal } from "@blazetrails/ruby-compat";
import { unescape } from "@blazetrails/rack";
import { CookieAssertions } from "../../test-helpers/abstract-unit.js";
import { TestRequest } from "../testing/test-request.js";
import { Base } from "../../action-controller/base.js";
import { TestCase } from "../../action-controller/test-case.js";
import { Duration, include, isPresent } from "@blazetrails/activesupport";
import { afterTeardown, travel, travelTo } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";

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

function cookieJarCookies(jar: CookieJar): Map<string, string> {
  return (jar as unknown as { _cookies: Map<string, string> })._cookies;
}

const SECRET_KEY_BASE = "b3c631c314c0bbca50c1b2843150fe33";

function cookieEnv(env: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "action_dispatch.key_generator": new KeyGenerator(SECRET_KEY_BASE, { iterations: 2 }),
    "action_dispatch.cookies_rotations": new RotationConfiguration(),
    "action_dispatch.secret_key_base": SECRET_KEY_BASE,
    "action_dispatch.signed_cookie_salt": "signed cookie",
    "action_dispatch.encrypted_cookie_salt": "encrypted cookie",
    "action_dispatch.encrypted_signed_cookie_salt": "signed encrypted cookie",
    "action_dispatch.authenticated_encrypted_cookie_salt": "authenticated encrypted cookie",
    "action_dispatch.use_authenticated_cookie_encryption": true,
    "action_dispatch.cookies_same_site_protection": () => ":lax",
    ...env,
  };
}

function cookieRequest(
  env: Record<string, unknown> = {},
  host = "www.nextangle.com",
): RequestCookieMethodsHost {
  const request = TestRequest.create(cookieEnv(env));
  request.host = host;
  return request as unknown as RequestCookieMethodsHost;
}

function setCookieHeaders(jar: CookieJar): string[] {
  const response = new Response();
  jar.write(response);
  const header = response.headers["set-cookie"];
  if (header === undefined || header === null) return [];
  return Array.isArray(header) ? header : [header];
}

function responseCookies(jar: CookieJar): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const [name, attributes] of Object.entries(
    CookieAssertions.parseSetCookiesHeaders(setCookieHeaders(jar)),
  )) {
    cookies[name] = unescape(attributes["value"] as string);
  }
  return cookies;
}

function assertSetCookieHeader(expected: string, jar: CookieJar): void {
  CookieAssertions.assertSetCookieHeader.call(
    CookieAssertions as never,
    expected,
    setCookieHeaders(jar),
  );
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
    const jar = new CookieJar(cookieRequest());
    expect(jar.isKey("foo")).toBe(false);
    expect(jar.hasKey("foo")).toBe(false);

    jar.set("foo", "bar");
    expect(jar.isKey("foo")).toBe(true);
    expect(jar.hasKey("foo")).toBe(true);
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
    jar.set("foo", { value: "bar", sameSite: ":strict" });
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
    const jar = jarWithSameSiteProtection(() => ":lax");
    jar.set("foo", { value: "bar", sameSite: ":strict" });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("samesite=strict");
  });

  it("setting cookie with specific same site nil", () => {
    const jar = jarWithSameSiteProtection(() => ":lax");
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
    expect([...jar].length).toBe(1);
  });

  it("setting the same value to permanent cookie", () => {
    const jar = new CookieJar(cookieRequest());
    jar.permanent.set("user_name", "david");
    jar.permanent.set("user_name", "david");
    expect([...jar].length).toBe(1);
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
    expect(jar.isKey("nonexistent")).toBe(false);
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
    const jar = jarWithSameSiteProtection(() => ":none");
    jar.set("user_name", "david");
    assertSetCookieHeader("user_name=david; path=/; SameSite=None", jar);
    assertEqual({ user_name: "david" }, responseCookies(jar));
  });

  it("setting cookie with secure on onion address", () => {
    const jar = new CookieJar(cookieRequest({}, "fake.onion"));
    jar.set("user_name", { value: "david", secure: true });
    assertSetCookieHeader("user_name=david; path=/; secure; SameSite=Lax", jar);
    assertEqual({ user_name: "david" }, responseCookies(jar));
  });

  it("setting cookie with same site protection proc normal user agent", () => {
    const jar = jarWithSameSiteProtection((request) =>
      request.userAgent === "spooky browser" ? undefined : ":strict",
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
      env: cookieEnv({ "action_dispatch.cookies_serializer": ":json" }),
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
      env: cookieEnv({ "action_dispatch.cookies_serializer": ":json" }),
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
      cookieRequest({ "action_dispatch.cookies_serializer": ":marshal" }),
    );
    marshalJar.signed.set("user_id", 45);
    const marshalValue = marshalJar.get("user_id")!;

    const jar = CookieJar.build(
      cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" }),
      {
        user_id: marshalValue,
      },
    );

    expect(jar.get("user_id")).not.toBe(45);
    expect(jar.signed.get("user_id")).toBe(45);

    const jsonJar = CookieJar.build(
      cookieRequest({ "action_dispatch.cookies_serializer": ":json" }),
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
      (request) => (request.userAgent === "spooky browser" ? undefined : ":strict"),
      "spooky browser",
    );
    jar.set("user_name", "david");
    const headers = setCookieHeaders(jar);
    expect(headers[0]).not.toContain("samesite");
  });

  it("setting cookie with misspelled same site protection raises", async () => {
    const jar = jarWithSameSiteProtection(() => ":funky");
    jar.set("user_name", "david");
    const error = await assertRaise([ArgumentError], {}, () => setCookieHeaders(jar));
    assertMatch(/Invalid :?Same_?Site value: :funky/i, error.message);
  });

  it("setting cookie with secure when always write cookie is true", () => {
    const jar = new CookieJar(cookieRequest());
    const oldCookie = jar.alwaysWriteCookie;
    jar.alwaysWriteCookie = true;
    try {
      jar.set("user_name", { value: "david", secure: true });
      assertSetCookieHeader("user_name=david; path=/; secure; SameSite=Lax", jar);
      assertEqual({ user_name: "david" }, responseCookies(jar));
    } finally {
      jar.alwaysWriteCookie = oldCookie;
    }
  });

  it.skip("signed cookie using custom digest", () => {
    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    const cookies = new CookieJar(request);
    cookies.signed.set("user_id", 45);
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const verifier = new MessageVerifier(secret, {
      serializer: Marshal,
      digest: "SHA256",
    });
    assertEqual(verifier.generate(45), cookies.get("user_id"));
  });

  it.skip("signed cookie rotating secret and digest", () => {
    let secret: string | ReturnType<KeyGenerator["generateKey"]> =
      "b3c631c314c0bbca50c1b2843150fe33";

    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    (request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "signed",
      secret,
      { digest: "SHA1" },
    );

    const oldMessage = new MessageVerifier(secret, {
      digest: "SHA1",
      serializer: Marshal,
    }).generate(45);
    const cookies = CookieJar.build(request, { user_id: oldMessage });

    assertEqual(45, cookies.signed.get("user_id"));

    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    secret = keyGenerator.generateKey(request.env["action_dispatch.signed_cookie_salt"] as string);
    const verifier = new MessageVerifier(secret, { digest: "SHA256", serializer: Marshal });
    assertEqual(45, verifier.verify(responseCookies(cookies)["user_id"]));
  });

  it("signed cookie using marshal serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":marshal" }),
    );
    cookies.signed.set("user_id", 45);
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it.skip("wrapped signed cookie using json serializer", () => {});

  it("signed cookie using message pack serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":message_pack" }),
    );
    cookies.signed.set("user_id", 45);
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it("signed cookie using marshal serializer can read from json dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":marshal" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const jsonValue = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    const cookies = CookieJar.build(request, { user_id: jsonValue });

    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(responseCookies(cookies)["user_id"]);
  });

  it("signed cookie using hybrid serializer can read from json dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const jsonValue = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    const cookies = CookieJar.build(request, { user_id: jsonValue });

    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(responseCookies(cookies)["user_id"]);
  });

  it("signed cookie using json serializer will drop marshal dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":json" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const marshalValue = new MessageVerifier(secret, { serializer: Marshal }).generate("bar");
    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertNil(responseCookies(cookies)["foo"]);
  });

  it.skip("signed cookie using message pack serializer can migrate json dumped value to message pack", () => {});

  it("encrypted cookie using marshal serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":marshal" }),
    );
    cookies.encrypted.set("foo", "bar");
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it.skip("wrapped encrypted cookie using json serializer", () => {});

  it("encrypted cookie using message pack serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":message_pack" }),
    );
    cookies.encrypted.set("foo", "bar");
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it.skip("encrypted cookie using hybrid serializer can migrate marshal dumped value to json", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    const marshalValue = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const jsonEncryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    assertNotNil(responseCookies(cookies)["foo"]);
    assertEqual("bar", jsonEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it("encrypted cookie using hybrid serializer can read from json dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    const jsonValue = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: jsonValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    assertNil(responseCookies(cookies)["foo"]);
  });

  it("encrypted cookie using json serializer will drop marshal dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":json" });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    const marshalValue = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.encrypted.get("foo"));
    assertNil(responseCookies(cookies)["foo"]);
  });

  it.skip("encrypted cookie using message pack serializer can migrate json dumped value to message pack", () => {});

  it("cookie jar mutated by request persists on future requests", async () => {
    await tc.get("authenticate");
    const cookieJar = tc.request.cookieJar();
    cookieJar.signed.set("user_id", 123);
    assertEqual(["user_name", "user_id"], [...cookieJarCookies(tc.request.cookieJar()).keys()]);
    await tc.get("getSignedCookie");
    assertEqual(["user_name", "user_id"], [...cookieJarCookies(tc.request.cookieJar()).keys()]);
  });

  it("permanent signed cookie", () => {
    const cookies = new CookieJar(cookieRequest());
    cookies.permanent.signed.set("remember_me", 100);
    assertMatch(
      new RegExp(`${new Date().getUTCFullYear() + 20}`),
      setCookieHeaders(cookies).join("\n"),
    );
    assertEqual(100, cookies.signed.get("remember_me"));
  });

  it.skip("use authenticated cookie encryption uses legacy hmac aes cbc encryption when not enabled", () => {
    const request = cookieRequest({ "action_dispatch.use_authenticated_cookie_encryption": null });
    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const encryptedCookieSalt = request.env["action_dispatch.encrypted_cookie_salt"] as string;
    const encryptedSignedCookieSalt = request.env[
      "action_dispatch.encrypted_signed_cookie_salt"
    ] as string;
    const secret = keyGenerator.generateKey(
      encryptedCookieSalt,
      MessageEncryptor.keyLen("aes-256-cbc"),
    ) as Buffer;
    const signSecret = keyGenerator.generateKey(encryptedSignedCookieSalt) as Buffer;
    const encryptor = new MessageEncryptor(secret, signSecret, {
      cipher: "aes-256-cbc",
      digest: "SHA1",
      serializer: Marshal,
    });

    const cookies = new CookieJar(request);
    cookies.encrypted.set("foo", "bar");

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
    assertEqual("bar", encryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("rotating signed cookies digest", () => {});

  it.skip("legacy hmac aes cbc marshal mode falls back to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc json mode falls back to authenticated encrypted cookie", () => {});

  it.skip("encrypted cookie rotating secret", () => {
    let secret: string | Buffer = "b3c631c314c0bbca50c1b2843150fe33";

    const request = cookieRequest({ "action_dispatch.encrypted_cookie_cipher": "aes-256-gcm" });
    (request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "encrypted",
      secret,
      { digest: "SHA1" },
    );

    const keyLen = MessageEncryptor.keyLen("aes-256-gcm");

    const oldMessage = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    }).encryptAndSign(45);

    const cookies = CookieJar.build(request, { foo: oldMessage });
    assertEqual(45, cookies.encrypted.get("foo"));

    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    secret = keyGenerator.generateKey(
      request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      keyLen,
    ) as Buffer;
    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    assertEqual(45, encryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("legacy hmac aes cbc encrypted marshal cookie is upgraded to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc encrypted json cookie is upgraded to authenticated encrypted cookie", () => {});

  it.skip("legacy hmac aes cbc encrypted cookie using 64 byte key is upgraded to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const message = Buffer.from(
      "566d4e75536d686e633246564e6b493062557079626c566d51574d30515430394c53315665564a694e4563786555744f57537454576b396a5a31566a626e52525054303d2d2d34663234333330623130623261306163363562316266323335396164666364613564643134623131",
      "hex",
    ).toString("latin1");
    const request = cookieRequest({
      "action_dispatch.secret_key_base": "c3b95688f35581fad38df788add315ff",
      "action_dispatch.encrypted_cookie_salt": "b3c631c314c0bbca50c1b2843150fe33",
      "action_dispatch.encrypted_signed_cookie_salt": "b3c631c314c0bbca50c1b2843150fe33",
    });
    const cookies = CookieJar.build(request, { foo: message });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const salt = request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string;
    const secret = (request.env["action_dispatch.key_generator"] as KeyGenerator).generateKey(
      salt,
      MessageEncryptor.keyLen("aes-256-gcm"),
    ) as Buffer;
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: Marshal });

    assertEqual("bar", encryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("cookie with hash value not modified by rotation", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    (request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate("signed", {
      digest: "SHA1",
    });

    const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
    const oldSecret = keyGenerator.generateKey(
      request.env["action_dispatch.signed_cookie_salt"] as string,
    );
    const oldValue = new MessageVerifier(oldSecret).generate({ bar: "baz" });

    const cookies = CookieJar.build(request, { foo: oldValue });
    assertEqual({ bar: "baz" }, cookies.signed.get("foo"));
  });

  const DOMAINS = ["example1.com", "example2.com", ".example3.com"];

  class TestController extends Base {
    async authenticate(): Promise<void> {
      this.cookies().set("user_name", "david");
      await this.head("ok");
    }

    async setCookieIfNotPresent(): Promise<void> {
      if (!isPresent(this.cookies().get("user_name"))) this.cookies().set("user_name", "alice");
      await this.head("ok");
    }

    async getSignedCookie(): Promise<void> {
      this.cookies().signed.get("user_id");
      await this.head("ok");
    }

    async setCookieWithDomain(): Promise<void> {
      this.cookies().set("user_name", { value: "rizwanreza", domain: ":all" });
      await this.head("ok");
    }

    async setCookieWithDomainProc(): Promise<void> {
      this.cookies().set("user_name", {
        value: "braindeaf",
        domain: () => ".sub.www.nextangle.com",
      });
      await this.head("ok");
    }

    async setCookieWithDomainProcWithRequest(): Promise<void> {
      this.cookies().set("user_name", {
        value: "braindeaf",
        domain: (req) => `.sub.${(req as { host: string }).host}`,
      });
      await this.head("ok");
    }

    async deleteCookieWithDomain(): Promise<void> {
      this.cookies().delete("user_name", { domain: ":all" });
      await this.head("ok");
    }

    async setCookieWithDomainAndTld(): Promise<void> {
      this.cookies().set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 2 });
      await this.head("ok");
    }

    async setCookieWithDomainAndLongerTld(): Promise<void> {
      this.cookies().set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 4 });
      await this.head("ok");
    }

    async deleteCookieWithDomainAndTld(): Promise<void> {
      this.cookies().delete("user_name", { domain: ":all", tldLength: 2 });
      await this.head("ok");
    }

    async setCookieWithDomains(): Promise<void> {
      this.cookies().set("user_name", { value: "rizwanreza", domain: DOMAINS });
      await this.head("ok");
    }

    async deleteCookieWithDomains(): Promise<void> {
      this.cookies().delete("user_name", { domain: DOMAINS });
      await this.head("ok");
    }

    async symbolKey(): Promise<void> {
      this.cookies().set("user_name", "david");
      await this.head("ok");
    }

    async stringKey(): Promise<void> {
      this.cookies().set("user_name", "dhh");
      await this.head("ok");
    }

    async symbolKeyMock(): Promise<void> {
      if (this.cookies().get("user_name") === "andrew") this.cookies().set("user_name", "david");
      await this.head("ok");
    }

    async stringKeyMock(): Promise<void> {
      if (this.cookies().get("user_name") === "andrew") this.cookies().set("user_name", "david");
      await this.head("ok");
    }

    async noop(): Promise<void> {
      await this.head("ok");
    }

    encryptedCookie(): unknown {
      return this.cookies().encrypted.get("foo");
    }

    async cookieExpiresInTwoHours(): Promise<void> {
      this.cookies().set("user_name", { value: "assain", expires: Duration.hours(2) });
      await this.head("ok");
    }

    async encryptedDiscountAndUserIdCookie(): Promise<void> {
      this.cookies().encrypted.set("user_id", { value: 50, expires: Duration.hours(1) });
      this.cookies().encrypted.set("discount_percentage", 10);

      await this.head("ok");
    }

    async signedDiscountAndUserIdCookie(): Promise<void> {
      this.cookies().signed.set("user_id", { value: 50, expires: Duration.hours(1) });
      this.cookies().signed.set("discount_percentage", 10);

      await this.head("ok");
    }

    async rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOn(): Promise<void> {
      this.cookies().set(
        "favorite",
        "KvH5lIHvX5vPQkLIK63r/NuIMwzWky8M0Zwk8SZ6DwUv8+srf36geR4nWq5KmhsZIYXA8NRdCZYIfxMKJsOFlz77Gf+Fq8vBBCWJTp95rx39A28TCUTJEyMhCNJO5eie7Skef76Qt5Jo/SCnIADAhzyGQkGBopKRcA==--qXZZFWGbCy6N8AGy--WswoH+xHrNh9MzSXDpB2fA==",
      );

      await this.head("ok");
    }

    async rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOff(): Promise<void> {
      this.cookies().set(
        "favorite",
        "rTG4zs5UufEFAr+ppKwh+MDMymKyAUMOSaWyYa3uUVmD8sMQqyiyQBxgYeAncDHVZIlo4y+kDVSzp66u1/7BNYpnmFe8ES/YT2m8ckNA23jBDmnRZ9CTNfMIRXjFtfxO9YxEOzzhn0ZiA0/zFtr5wkluXtxplOz959Q7MgLOyvTze2h9p8A=--QHOS3rAEGq/HCxXs--xQNra8dk24Idc2qBtpMLpg==",
      );

      await this.head("ok");
    }

    async rails52StableSignedCookieWithAuthenticatedEncryptionFlagOn(): Promise<void> {
      this.cookies().set(
        "favorite",
        "eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaEpJaUUxTFRJdFUzUmhZbXhsSUVOb2IyTnZJRU5vYVhBZ1EyOXZhMmxsQmpvR1JWUT0iLCJleHAiOiIzMDE4LTA3LTExVDE2OjExOjI2Ljc1M1oiLCJwdXIiOm51bGx9fQ==--7df5d885b78b70a501d6e82140ae91b24060ac00",
      );

      await this.head("ok");
    }

    async rails52StableSignedCookieWithAuthenticatedEncryptionFlagOff(): Promise<void> {
      this.cookies().set(
        "favorite",
        "BAhJIiE1LTItU3RhYmxlIENob2NvIENoaXAgQ29va2llBjoGRVQ=--50bbdbf8d64f5a3ec3e54878f54d4f55b6cb3aff",
      );

      await this.head("ok");
    }
  }

  class CookiesTestCase extends TestCase {
    declare assertSetCookieHeader: (expected: string) => void;

    static {
      this.tests(TestController);
      include(this, CookieAssertions);
    }
  }

  let tc: CookiesTestCase;

  beforeEach(async ({ task }) => {
    tc = new CookiesTestCase(task.name);
    await tc.beforeSetup();
    tc.setup();
    Object.assign(tc.request.env, cookieEnv());
    tc.request.host = "www.nextangle.com";
  });

  afterEach(() => afterTeardown());

  it("cookie with all domain option", async () => {
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.com; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using a non standard tld", async () => {
    tc.request.host = "two.subdomains.nextangle.local";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using australian style tld", async () => {
    tc.request.host = "nextangle.com.au";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.com.au; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using australian style tld and two subdomains", async () => {
    tc.request.host = "x.nextangle.com.au";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.com.au; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using uk style tld", async () => {
    tc.request.host = "nextangle.co.uk";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.co.uk; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using two letter one level tld", async () => {
    tc.request.host = "hawth.ca";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=hawth.ca; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using two letter one level tld and subdomain", async () => {
    tc.request.host = "x.hawth.ca";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=hawth.ca; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using uk style tld and two subdomains", async () => {
    tc.request.host = "x.nextangle.co.uk";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.co.uk; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using host with port", async () => {
    tc.request.host = "nextangle.local:3000";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using localhost", async () => {
    tc.request.host = "localhost";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using ipv4 address", async () => {
    tc.request.host = "192.168.1.1";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using ipv6 address", async () => {
    tc.request.host = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
    await tc.get("setCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("deleting cookie with all domain option", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteCookieWithDomain");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=; domain=nextangle.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
  });

  it("cookie with all domain option and tld length", async () => {
    await tc.get("setCookieWithDomainAndTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.com; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using a non standard tld and tld length", async () => {
    tc.request.host = "two.subdomains.nextangle.local";
    await tc.get("setCookieWithDomainAndTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using a non standard 2 letter tld", async () => {
    tc.request.host = "admin.lvh.me";
    await tc.get("setCookieWithDomainAndTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=lvh.me; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using host with port and tld length", async () => {
    tc.request.host = "nextangle.local:3000";
    await tc.get("setCookieWithDomainAndTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax");
  });

  it("cookie with all domain option using longer tld length", async () => {
    tc.request.host = "x.y.z.t.com";
    await tc.get("setCookieWithDomainAndLongerTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=y.z.t.com; path=/; SameSite=Lax");
  });

  it("deleting cookie with all domain option and tld length", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteCookieWithDomainAndTld");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=; domain=nextangle.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
  });

  it("cookie with several preset domains using one of these domains", async () => {
    tc.request.host = "example1.com";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=example1.com; path=/; SameSite=Lax");
  });

  it("cookie with several preset domains using subdomain", async () => {
    tc.request.host = "subdomain.example1.com";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=example1.com; path=/; SameSite=Lax");
  });

  it("cookie with several preset domains using similar tld", async () => {
    tc.request.host = "example1.com.au";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("cookie with several preset domains using similar domain", async () => {
    tc.request.host = "myexample1.com";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("cookie with several preset domains using other domain", async () => {
    tc.request.host = "other-domain.com";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax");
  });

  it("cookie with several preset domains using shared domain", async () => {
    tc.request.host = "example3.com";
    await tc.get("setCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader("user_name=rizwanreza; domain=.example3.com; path=/; SameSite=Lax");
  });

  it("cookie with domain proc", async () => {
    await tc.get("setCookieWithDomainProc");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=braindeaf; domain=.sub.www.nextangle.com; path=/; SameSite=Lax",
    );
  });

  it("cookie with domain proc with request", async () => {
    await tc.get("setCookieWithDomainProcWithRequest");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=braindeaf; domain=.sub.www.nextangle.com; path=/; SameSite=Lax",
    );
  });

  it("deleting cookie with several preset domains using one of these domains", async () => {
    tc.request.host = "example2.com";
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=; domain=example2.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
  });

  it("deleting cookie with several preset domains using other domain", async () => {
    tc.request.host = "other-domain.com";
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteCookieWithDomains");
    tc.assertResponse("success");
    tc.assertSetCookieHeader(
      "user_name=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
  });

  it("cookies hash is indifferent access", async () => {
    await tc.get("symbolKey");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));
    await tc.get("stringKey");
    assertEqual("dhh", tc.cookies().get("user_name"));
    assertEqual("dhh", tc.cookies().get("user_name"));
  });

  it("setting request cookies is indifferent access", async () => {
    tc.cookies().clear();
    tc.cookies().set("user_name", "andrew");
    await tc.get("stringKeyMock");
    assertEqual("david", tc.cookies().get("user_name"));

    tc.cookies().clear();
    tc.cookies().set("user_name", "andrew");
    await tc.get("symbolKeyMock");
    assertEqual("david", tc.cookies().get("user_name"));
  });

  it("cookies retained across requests", async () => {
    await tc.get("symbolKey");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Lax");
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertNotIncludes(tc.response.headers, "Set-Cookie");
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertNotIncludes(tc.response.headers, "Set-Cookie");
    assertEqual("david", tc.cookies().get("user_name"));
  });

  it("cookies can be cleared", async () => {
    await tc.get("symbolKey");
    assertEqual("david", tc.cookies().get("user_name"));

    tc.cookies().clear();
    await tc.get("noop");
    assertNil(tc.cookies().get("user_name"));

    await tc.get("symbolKey");
    assertEqual("david", tc.cookies().get("user_name"));
  });

  it("can set http cookie header", async () => {
    tc.request.env["HTTP_COOKIE"] = "user_name=david";
    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    tc.request.env["HTTP_COOKIE"] = "user_name=andrew";
    await tc.get("noop");
    assertEqual("andrew", tc.cookies().get("user_name"));
    assertEqual("andrew", tc.cookies().get("user_name"));
  });

  it("can set request cookies", async () => {
    tc.request.cookies["user_name"] = "david";
    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    tc.request.cookies["user_name"] = "andrew";
    await tc.get("noop");
    assertEqual("andrew", tc.cookies().get("user_name"));
    assertEqual("andrew", tc.cookies().get("user_name"));
  });

  it("cookies precedence over http cookie", async () => {
    tc.request.env["HTTP_COOKIE"] = "user_name=andrew";
    await tc.get("authenticate");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));
  });

  it("cookies precedence over request cookies", async () => {
    tc.request.cookies["user_name"] = "andrew";
    await tc.get("authenticate");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));

    await tc.get("noop");
    assertEqual("david", tc.cookies().get("user_name"));
    assertEqual("david", tc.cookies().get("user_name"));
  });

  it("cookies are not cleared", async () => {
    tc.cookies().encrypted.set("foo", "bar");
    await tc.get("noop");
    assertEqual("bar", (tc.controller as TestController).encryptedCookie());
  });

  it("cookie override", async () => {
    await tc.get("setCookieIfNotPresent");
    assertEqual("alice", tc.cookies().get("user_name"));
    tc.cookies().set("user_name", "bob");
    await tc.get("setCookieIfNotPresent");
    assertEqual("bob", tc.cookies().get("user_name"));
  });

  it("signed cookie with expires set relatively", () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    tc.cookies().signed.set("user_name", { value: "assain", expires: Duration.hours(2) });

    travel(Duration.hours(1));
    assertEqual("assain", tc.cookies().signed.get("user_name"));

    travel(Duration.hours(2));
    assertNil(tc.cookies().signed.get("user_name"));
  });

  it("encrypted cookie with expires set relatively", () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    tc.cookies().encrypted.set("user_name", { value: "assain", expires: Duration.hours(2) });

    travel(Duration.hours(1));
    assertEqual("assain", tc.cookies().encrypted.get("user_name"));

    travel(Duration.hours(2));
    assertNil(tc.cookies().encrypted.get("user_name"));
  });

  it("vanilla cookie with expires set relatively", async () => {
    await travelTo(Time.utc(2017, 8, 15), {}, async () => {
      await tc.get("cookieExpiresInTwoHours");
      tc.assertSetCookieHeader(
        "user_name=assain; path=/; expires=Tue, 15 Aug 2017 02:00:00 GMT; SameSite=Lax",
      );
    });
  });

  it("signed cookie with false value and metadata", () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    tc.cookies().signed.set("foo", false);
    assertEqual(false, tc.cookies().signed.get("foo"));
  });

  it("encrypted cookie with false value and metadata", () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    tc.cookies().encrypted.set("foo", false);
    assertEqual(false, tc.cookies().encrypted.get("foo"));
  });

  it("purpose metadata for encrypted cookies", async () => {
    await tc.get("encryptedDiscountAndUserIdCookie");

    tc.cookies().set("discount_percentage", tc.cookies().get("user_id")!);
    assertEqual(50, tc.cookies().encrypted.get("discount_percentage"));

    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    await tc.get("encryptedDiscountAndUserIdCookie");

    tc.cookies().set("discount_percentage", tc.cookies().get("user_id")!);
    assertNil(tc.cookies().encrypted.get("discount_percentage"));
  });

  it("purpose metadata for signed cookies", async () => {
    await tc.get("signedDiscountAndUserIdCookie");

    tc.cookies().set("discount_percentage", tc.cookies().get("user_id")!);
    assertEqual(50, tc.cookies().signed.get("discount_percentage"));

    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    await tc.get("signedDiscountAndUserIdCookie");

    tc.cookies().set("discount_percentage", tc.cookies().get("user_id")!);
    assertNil(tc.cookies().signed.get("discount_percentage"));
  });

  it("switch off metadata for encrypted cookies if config is false", async () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("encryptedDiscountAndUserIdCookie");

    travel(Duration.hours(2));
    assertNil(tc.cookies().signed.get("user_id"));
  });

  it("switch off metadata for signed cookies if config is false", async () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("signedDiscountAndUserIdCookie");

    travel(Duration.hours(2));

    assertNil(tc.cookies().signed.get("user_id"));
  });

  it.skip("read rails 5 2 stable encrypted cookies if config is false", async () => {
    // BLOCKED: messages-marshal-with-fallback-uses-real-marshal
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().encrypted.get("favorite"));
    });

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));
  });

  it.skip("read rails 5 2 stable signed cookies if config is false", async () => {
    // BLOCKED: messages-marshal-with-fallback-uses-real-marshal
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().signed.get("favorite"));
    });

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));
  });

  it.skip("read rails 5 2 stable encrypted cookies if use metadata config is true", async () => {
    // BLOCKED: messages-marshal-with-fallback-uses-real-marshal
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().encrypted.get("favorite"));
    });

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));
  });

  it.skip("read rails 5 2 stable signed cookies if use metadata config is true", async () => {
    // BLOCKED: messages-marshal-with-fallback-uses-real-marshal
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().signed.get("favorite"));
    });

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));
  });
});
