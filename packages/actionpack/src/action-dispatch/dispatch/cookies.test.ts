import { describe, it, expect } from "vitest";
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
  for (const [name, attributes] of CookieAssertions.parseSetCookiesHeaders(setCookieHeaders(jar))) {
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

  it.skip("cookie jar mutated by request persists on future requests", () => {});

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

  it("cookie with all domain option", () => {
    const cookies = new CookieJar(cookieRequest({}));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using a non standard tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "two.subdomains.nextangle.local"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using australian style tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "nextangle.com.au"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.com.au; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using australian style tld and two subdomains", () => {
    const cookies = new CookieJar(cookieRequest({}, "x.nextangle.com.au"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.com.au; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using uk style tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "nextangle.co.uk"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.co.uk; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using two letter one level tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "hawth.ca"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader("user_name=rizwanreza; domain=hawth.ca; path=/; SameSite=Lax", cookies);
  });

  it("cookie with all domain option using two letter one level tld and subdomain", () => {
    const cookies = new CookieJar(cookieRequest({}, "x.hawth.ca"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader("user_name=rizwanreza; domain=hawth.ca; path=/; SameSite=Lax", cookies);
  });

  it("cookie with all domain option using uk style tld and two subdomains", () => {
    const cookies = new CookieJar(cookieRequest({}, "x.nextangle.co.uk"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.co.uk; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using host with port", () => {
    const cookies = new CookieJar(cookieRequest({}, "nextangle.local:3000"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using localhost", () => {
    const cookies = new CookieJar(cookieRequest({}, "localhost"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("cookie with all domain option using ipv4 address", () => {
    const cookies = new CookieJar(cookieRequest({}, "192.168.1.1"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("cookie with all domain option using ipv6 address", () => {
    const cookies = new CookieJar(cookieRequest({}, "2001:0db8:85a3:0000:0000:8a2e:0370:7334"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all" });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("deleting cookie with all domain option", () => {
    const cookies = CookieJar.build(cookieRequest({}), { user_name: "Joe" });
    cookies.delete("user_name", { domain: ":all" });
    assertSetCookieHeader(
      "user_name=; domain=nextangle.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option and tld length", () => {
    const cookies = new CookieJar(cookieRequest({}));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 2 });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using a non standard tld and tld length", () => {
    const cookies = new CookieJar(cookieRequest({}, "two.subdomains.nextangle.local"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 2 });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using a non standard 2 letter tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "admin.lvh.me"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 2 });
    assertSetCookieHeader("user_name=rizwanreza; domain=lvh.me; path=/; SameSite=Lax", cookies);
  });

  it("cookie with all domain option using host with port and tld length", () => {
    const cookies = new CookieJar(cookieRequest({}, "nextangle.local:3000"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 2 });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=nextangle.local; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with all domain option using longer tld length", () => {
    const cookies = new CookieJar(cookieRequest({}, "x.y.z.t.com"));
    cookies.set("user_name", { value: "rizwanreza", domain: ":all", tldLength: 4 });
    assertSetCookieHeader("user_name=rizwanreza; domain=y.z.t.com; path=/; SameSite=Lax", cookies);
  });

  it("deleting cookie with all domain option and tld length", () => {
    const cookies = CookieJar.build(cookieRequest({}), { user_name: "Joe" });
    cookies.delete("user_name", { domain: ":all", tldLength: 2 });
    assertSetCookieHeader(
      "user_name=; domain=nextangle.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with several preset domains using one of these domains", () => {
    const cookies = new CookieJar(cookieRequest({}, "example1.com"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=example1.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with several preset domains using subdomain", () => {
    const cookies = new CookieJar(cookieRequest({}, "subdomain.example1.com"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=example1.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with several preset domains using similar tld", () => {
    const cookies = new CookieJar(cookieRequest({}, "example1.com.au"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("cookie with several preset domains using similar domain", () => {
    const cookies = new CookieJar(cookieRequest({}, "myexample1.com"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("cookie with several preset domains using other domain", () => {
    const cookies = new CookieJar(cookieRequest({}, "other-domain.com"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader("user_name=rizwanreza; path=/; SameSite=Lax", cookies);
  });

  it("cookie with several preset domains using shared domain", () => {
    const cookies = new CookieJar(cookieRequest({}, "example3.com"));
    cookies.set("user_name", {
      value: "rizwanreza",
      domain: ["example1.com", "example2.com", ".example3.com"],
    });
    assertSetCookieHeader(
      "user_name=rizwanreza; domain=.example3.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with domain proc", () => {
    const cookies = new CookieJar(cookieRequest({}));
    cookies.set("user_name", { value: "braindeaf", domain: () => ".sub.www.nextangle.com" });
    assertSetCookieHeader(
      "user_name=braindeaf; domain=.sub.www.nextangle.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("cookie with domain proc with request", () => {
    const cookies = new CookieJar(cookieRequest({}));
    cookies.set("user_name", {
      value: "braindeaf",
      domain: (req) => `.sub.${(req as { host: string }).host}`,
    });
    assertSetCookieHeader(
      "user_name=braindeaf; domain=.sub.www.nextangle.com; path=/; SameSite=Lax",
      cookies,
    );
  });

  it("deleting cookie with several preset domains using one of these domains", () => {
    const cookies = CookieJar.build(cookieRequest({}, "example2.com"), { user_name: "Joe" });
    cookies.delete("user_name", { domain: ["example1.com", "example2.com", ".example3.com"] });
    assertSetCookieHeader(
      "user_name=; domain=example2.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      cookies,
    );
  });

  it("deleting cookie with several preset domains using other domain", () => {
    const cookies = CookieJar.build(cookieRequest({}, "other-domain.com"), { user_name: "Joe" });
    cookies.delete("user_name", { domain: ["example1.com", "example2.com", ".example3.com"] });
    assertSetCookieHeader(
      "user_name=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      cookies,
    );
  });
});
