import { describe, it, expect } from "vitest";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Response } from "@blazetrails/rack";
import { CookieJar } from "../cookies.js";
import { cookiesSameSiteProtection, type RequestCookieMethodsHost } from "../middleware/cookies.js";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { MessagePack } from "@blazetrails/activesupport/message-pack";
import {
  assertEqual,
  assertMatch,
  assertNil,
  assertNotEqual,
  assertNotNil,
  assertRaise,
} from "@blazetrails/activesupport";
import { ArgumentError, JSON } from "@blazetrails/ruby-compat";
import { unescape } from "@blazetrails/rack";

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
  const e = cookieEnv(env);
  return {
    env: e,
    host,
    cookiesSameSiteProtection,
    getHeader: (name: string) => e[name],
    hasHeader: (name: string) => Object.hasOwn(e, name),
    fetchHeader: (name: string, block: (name: string) => unknown) =>
      Object.hasOwn(e, name) ? e[name] : block(name),
    setHeader: (name: string, value: unknown) => (e[name] = value),
    cookies: {},
  } as RequestCookieMethodsHost;
}

function setCookieHeaders(jar: CookieJar): string[] {
  const response = new Response();
  jar.write(response);
  const header = response.headers["set-cookie"];
  if (header === undefined || header === null) return [];
  return Array.isArray(header) ? header : [header];
}

function responseCookies(jar: CookieJar): Record<string, string> {
  return Object.fromEntries(
    setCookieHeaders(jar).map((header) => {
      const [name, value] = header.split(";")[0].split("=");
      return [name, unescape(value)];
    }),
  );
}

function signedSecret(request: RequestCookieMethodsHost): ReturnType<KeyGenerator["generateKey"]> {
  const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
  return keyGenerator.generateKey(request.env["action_dispatch.signed_cookie_salt"] as string);
}

function aeadSecret(request: RequestCookieMethodsHost): Buffer {
  const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
  return keyGenerator.generateKey(
    request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
    MessageEncryptor.keyLen("aes-256-gcm"),
  ) as Buffer;
}

function cbcSecret(request: RequestCookieMethodsHost): Buffer {
  const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
  return keyGenerator.generateKey(
    request.env["action_dispatch.encrypted_cookie_salt"] as string,
    MessageEncryptor.keyLen("aes-256-cbc"),
  ) as Buffer;
}

function signSecret(request: RequestCookieMethodsHost): Buffer {
  const keyGenerator = request.env["action_dispatch.key_generator"] as KeyGenerator;
  return keyGenerator.generateKey(
    request.env["action_dispatch.encrypted_signed_cookie_salt"] as string,
  ) as Buffer;
}

class JSONWrapper {
  constructor(private obj: unknown) {}

  asJson(): string {
    return `wrapped: ${this.obj}`;
  }
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
    assertEqual(["user_name=david; path=/; samesite=none"], setCookieHeaders(jar));
  });

  it("setting cookie with secure on onion address", () => {
    const jar = new CookieJar(cookieRequest({}, "fake.onion"));
    jar.set("user_name", { value: "david", secure: true });
    assertEqual(["user_name=david; path=/; secure; samesite=lax"], setCookieHeaders(jar));
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
      assertEqual(["user_name=david; path=/; secure; samesite=lax"], setCookieHeaders(jar));
      assertEqual({ user_name: "david" }, responseCookies(jar));
    } finally {
      jar.alwaysWriteCookie = oldCookie;
    }
  });

  it("signed cookie using custom digest", () => {
    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    const cookies = new CookieJar(request);
    cookies.signed.set("user_id", 45);
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const verifier = new MessageVerifier(signedSecret(request), {
      serializer: "marshal",
      digest: "SHA256",
    });
    assertEqual(verifier.generate(45), cookies.get("user_id"));
  });

  it("signed cookie rotating secret and digest", () => {
    let secret: string | ReturnType<typeof signedSecret> = "b3c631c314c0bbca50c1b2843150fe33";

    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    (request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "signed",
      secret,
      { digest: "SHA1" },
    );

    const oldMessage = new MessageVerifier(secret, {
      digest: "SHA1",
      serializer: "marshal",
    }).generate(45);
    const cookies = CookieJar.build(request, { user_id: oldMessage });

    assertEqual(45, cookies.signed.get("user_id"));

    secret = signedSecret(request);
    const verifier = new MessageVerifier(secret, { digest: "SHA256", serializer: "marshal" });
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

  it.skip("wrapped signed cookie using json serializer", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const cookies = new CookieJar(cookieRequest({ "action_dispatch.cookies_serializer": ":json" }));
    cookies.signed.set("user_id", new JSONWrapper(45));
    assertNotEqual("wrapped: 45", cookies.get("user_id"));
    assertEqual("wrapped: 45", cookies.signed.get("user_id"));
  });

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
    const secret = signedSecret(request);

    const value = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    const cookies = CookieJar.build(request, { user_id: value });

    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(responseCookies(cookies)["user_id"]);
  });

  it("signed cookie using hybrid serializer can read from json dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const secret = signedSecret(request);

    const value = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    const cookies = CookieJar.build(request, { user_id: value });

    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(responseCookies(cookies)["user_id"]);
  });

  it("signed cookie using json serializer will drop marshal dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":json" });
    const secret = signedSecret(request);

    const marshalValue = new MessageVerifier(secret, { serializer: "marshal" }).generate("bar");
    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo") ?? null);
    assertNil(responseCookies(cookies)["foo"]);
  });

  it.skip("signed cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":message_pack" });
    const secret = signedSecret(request);

    const value = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    const cookies = CookieJar.build(request, { user_id: value });

    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const verifier = new MessageVerifier(secret, { serializer: MessagePack });
    assertEqual(45, verifier.verify(responseCookies(cookies)["user_id"]));
  });

  it("encrypted cookie using marshal serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":marshal" }),
    );
    cookies.encrypted.set("foo", "bar");
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo") ?? null);
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it.skip("wrapped encrypted cookie using json serializer", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const cookies = new CookieJar(cookieRequest({ "action_dispatch.cookies_serializer": ":json" }));
    cookies.encrypted.set("foo", new JSONWrapper("bar"));
    assertNotEqual("wrapped: bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo") ?? null);
    assertEqual("wrapped: bar", cookies.encrypted.get("foo"));
  });

  it("encrypted cookie using message pack serializer", () => {
    const cookies = new CookieJar(
      cookieRequest({ "action_dispatch.cookies_serializer": ":message_pack" }),
    );
    cookies.encrypted.set("foo", "bar");
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo") ?? null);
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it("encrypted cookie using hybrid serializer can migrate marshal dumped value to json", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const secret = aeadSecret(request);

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: "marshal",
    });
    const value = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: value });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const jsonEncryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    assertNotNil(responseCookies(cookies)["foo"]);
    assertEqual("bar", jsonEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it("encrypted cookie using hybrid serializer can read from json dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":hybrid" });
    const secret = aeadSecret(request);

    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    const value = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: value });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    assertNil(responseCookies(cookies)["foo"]);
  });

  it("encrypted cookie using json serializer will drop marshal dumped value", () => {
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":json" });
    const secret = aeadSecret(request);

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: "marshal",
    });
    const value = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: value });

    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.encrypted.get("foo") ?? null);
    assertNil(responseCookies(cookies)["foo"]);
  });

  it.skip("encrypted cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":message_pack" });
    const secret = aeadSecret(request);

    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    const value = encryptor.encryptAndSign("bar");
    const cookies = CookieJar.build(request, { foo: value });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const jsonEncryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: MessagePack,
    });
    assertNotNil(responseCookies(cookies)["foo"]);
    assertEqual("bar", jsonEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it("cookie jar mutated by request persists on future requests", () => {
    const request = cookieRequest();
    const cookieJar = new CookieJar(request);
    cookieJar.set("user_name", "david");
    cookieJar.signed.set("user_id", 123);
    assertEqual(["user_name", "user_id"], Object.keys(Object.fromEntries(cookieJar)));
    cookieJar.signed.get("user_id");
    assertEqual(["user_name", "user_id"], Object.keys(Object.fromEntries(cookieJar)));
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

  it("use authenticated cookie encryption uses legacy hmac aes cbc encryption when not enabled", () => {
    const request = cookieRequest({ "action_dispatch.use_authenticated_cookie_encryption": null });
    const encryptor = new MessageEncryptor(cbcSecret(request), signSecret(request), {
      cipher: "aes-256-cbc",
      digest: "SHA1",
      serializer: "marshal",
    });

    const cookies = new CookieJar(request);
    cookies.encrypted.set("foo", "bar");

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
    assertEqual("bar", encryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("rotating signed cookies digest", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.signed_cookie_digest": "SHA256" });
    (request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate("signed", {
      digest: "SHA1",
    });

    const oldSecret = signedSecret(request);
    const oldValue = new MessageVerifier(oldSecret).generate(45);

    const cookies = CookieJar.build(request, { user_id: oldValue });

    assertEqual(45, cookies.signed.get("user_id"));

    const secret = signedSecret(request);
    const verifier = new MessageVerifier(secret, { digest: "SHA256" });
    assertEqual(45, verifier.verify(responseCookies(cookies)["user_id"]));
  });

  it.skip("legacy hmac aes cbc marshal mode falls back to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.use_authenticated_cookie_encryption": null });
    const aeadEncryptor = new MessageEncryptor(aeadSecret(request), {
      cipher: "aes-256-gcm",
      serializer: "marshal",
    });
    const marshalValue = aeadEncryptor.encryptAndSign("bar");

    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const hmacCbcEncryptor = new MessageEncryptor(cbcSecret(request), signSecret(request), {
      cipher: "aes-256-cbc",
      serializer: "marshal",
    });

    assertEqual("bar", hmacCbcEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("legacy hmac aes cbc json mode falls back to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({
      "action_dispatch.use_authenticated_cookie_encryption": null,
      "action_dispatch.cookies_serializer": ":json",
    });
    const aeadEncryptor = new MessageEncryptor(aeadSecret(request), {
      cipher: "aes-256-gcm",
      serializer: JSON,
    });
    const marshalValue = aeadEncryptor.encryptAndSign("bar");

    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const hmacCbcEncryptor = new MessageEncryptor(cbcSecret(request), signSecret(request), {
      cipher: "aes-256-cbc",
      serializer: JSON,
    });

    assertEqual("bar", hmacCbcEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it("encrypted cookie rotating secret", () => {
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
      serializer: "marshal",
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
      serializer: "marshal",
    });
    assertEqual(45, encryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("legacy hmac aes cbc encrypted marshal cookie is upgraded to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest();
    const marshalValue = new MessageEncryptor(cbcSecret(request), signSecret(request), {
      cipher: "aes-256-cbc",
      serializer: "marshal",
    }).encryptAndSign("bar");

    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const aeadEncryptor = new MessageEncryptor(aeadSecret(request), {
      cipher: "aes-256-gcm",
      serializer: "marshal",
    });

    assertEqual("bar", aeadEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });

  it.skip("legacy hmac aes cbc encrypted json cookie is upgraded to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    const request = cookieRequest({ "action_dispatch.cookies_serializer": ":json" });
    const marshalValue = new MessageEncryptor(cbcSecret(request), signSecret(request), {
      cipher: "aes-256-cbc",
      serializer: JSON,
    }).encryptAndSign("bar");

    const cookies = CookieJar.build(request, { foo: marshalValue });

    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const aeadEncryptor = new MessageEncryptor(aeadSecret(request), {
      cipher: "aes-256-gcm",
      serializer: JSON,
    });

    assertEqual("bar", aeadEncryptor.decryptAndVerify(responseCookies(cookies)["foo"]));
  });
});
