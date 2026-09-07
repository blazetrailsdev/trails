import { describe, expect, it } from "vitest";
import { bodyFromString, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  type ChainedCookieJarsHost,
  type CookieSerializer,
  type SerializedCookieJarsHost,
  CookieJar,
  Cookies,
  COOKIES_KEY,
  CookieOverflow,
  checkForOverflowBang,
  commit,
  isPrepareUpgradeLegacyHmacAesCbcCookies,
  isReserialize,
  isUpgradeLegacyHmacAesCbcCookies,
  serializer,
  signedOrEncrypted,
} from "./cookies.js";
import "../http/request.js";

function emptyResponse(): RackResponse {
  return [200, {}, bodyFromString("")];
}

describe("Cookies middleware", () => {
  it("leaves headers untouched when downstream never builds a jar", async () => {
    const cookies = new Cookies(async () => [200, { "x-foo": "bar" }, bodyFromString("ok")]);
    const env: RackEnv = {};
    const [status, headers] = await cookies.call(env);
    expect(status).toBe(200);
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["x-foo"]).toBe("bar");
  });

  it("flushes set/delete operations into a newline-joined set-cookie header", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("session", "abc");
      jar.set("stale", "old");
      jar.delete("stale");
      env[COOKIES_KEY] = jar;
      return emptyResponse();
    });
    const env: RackEnv = {};
    const [, headers] = await cookies.call(env);
    const setCookie = headers["set-cookie"] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie[0]).toContain("session=abc");
    expect(setCookie[1]).toContain("stale=old");
    expect(setCookie[2]).toContain("stale=");
    expect(setCookie).toHaveLength(3);
  });

  it("does not double-flush a jar that was already committed", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("a", "1");
      jar.commitBang();
      env[COOKIES_KEY] = jar;
      return emptyResponse();
    });
    const env: RackEnv = {};
    const [, headers] = await cookies.call(env);
    expect(headers["set-cookie"]).toBeUndefined();
  });

  it("merges with an existing string set-cookie from the downstream app", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("b", "2");
      env[COOKIES_KEY] = jar;
      return [200, { "set-cookie": "a=1; path=/" }, bodyFromString("")];
    });
    const [, headers] = await cookies.call({});
    const lines = headers["set-cookie"] as string[];
    expect(lines[0]).toBe("a=1; path=/");
    expect(lines[1]).toContain("b=2");
  });

  it("merges with an existing array set-cookie without comma-stringifying", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("c", "3");
      env[COOKIES_KEY] = jar;
      return [
        200,
        { "set-cookie": ["a=1; path=/", "b=2; path=/"] as unknown as string },
        bodyFromString(""),
      ];
    });
    const [, headers] = await cookies.call({});
    const setCookie = headers["set-cookie"] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toEqual(["a=1; path=/", "b=2; path=/", expect.stringContaining("c=3")]);
  });

  it("merges with an existing Set-Cookie that uses non-lowercase casing", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("b", "2");
      env[COOKIES_KEY] = jar;
      return [200, { "Set-Cookie": "a=1; path=/" }, bodyFromString("")];
    });
    const [, headers] = await cookies.call({});
    expect(headers["Set-Cookie"]).toBeUndefined();
    const lines = headers["set-cookie"] as string[];
    expect(lines[0]).toBe("a=1; path=/");
    expect(lines[1]).toContain("b=2");
  });
});

function chainedHost(env: Record<string, unknown>): ChainedCookieJarsHost {
  const jar = new CookieJar({ secret: "secret-key-base-for-tests" });
  return {
    request: {
      env,
      getHeader: (k: string) => env[k],
      hasHeader: (k: string) => Object.hasOwn(env, k),
      cookies: {},
    },
    signed: jar.signed,
    encrypted: jar.encrypted,
  };
}

describe("ChainedCookieJars predicates", () => {
  it("signedOrEncrypted prefers encrypted when secret_key_base is present", () => {
    const host = chainedHost({ "action_dispatch.secret_key_base": "abc" });
    expect(signedOrEncrypted.call(host)).toBe(host.encrypted);
  });

  it("signedOrEncrypted falls back to signed when secret_key_base is absent", () => {
    const host = chainedHost({});
    expect(signedOrEncrypted.call(host)).toBe(host.signed);
  });

  it("signedOrEncrypted treats blank secret_key_base as absent", () => {
    const host = chainedHost({ "action_dispatch.secret_key_base": "" });
    expect(signedOrEncrypted.call(host)).toBe(host.signed);
  });

  it("isUpgradeLegacyHmacAesCbcCookies requires every legacy slot to be set", () => {
    const full = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_signed_cookie_salt": "s1",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(isUpgradeLegacyHmacAesCbcCookies.call(full)).toBe(true);

    const missingFlag = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_signed_cookie_salt": "s1",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(isUpgradeLegacyHmacAesCbcCookies.call(missingFlag)).toBe(false);

    const missingSalt = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(isUpgradeLegacyHmacAesCbcCookies.call(missingSalt)).toBe(false);
  });

  it("isPrepareUpgradeLegacyHmacAesCbcCookies requires the encryption flag to be OFF", () => {
    const ready = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.authenticated_encrypted_cookie_salt": "aec",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(isPrepareUpgradeLegacyHmacAesCbcCookies.call(ready)).toBe(true);

    const flagOn = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.authenticated_encrypted_cookie_salt": "aec",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(isPrepareUpgradeLegacyHmacAesCbcCookies.call(flagOn)).toBe(false);

    const missingSalt = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(isPrepareUpgradeLegacyHmacAesCbcCookies.call(missingSalt)).toBe(false);
  });
});

function serializedHost(env: Record<string, unknown> = {}): SerializedCookieJarsHost {
  return {
    request: {
      env,
      getHeader: (k: string) => env[k],
      hasHeader: (k: string) => Object.hasOwn(env, k),
      cookies: {},
    },
  };
}

describe("SerializedCookieJars", () => {
  it("commit dumps via the configured serializer (JSON by default)", () => {
    const host = serializedHost();
    const options = { value: { hello: "world" } } as { value: unknown };
    commit.call(host, "session", options);
    expect(options.value).toBe('{"hello":"world"}');
  });

  it("isReserialize is true when the payload was not produced by JSON", () => {
    const host = serializedHost();
    expect(isReserialize.call(host, "not-json")).toBe(true);
    expect(isReserialize.call(host, '{"ok":true}')).toBe(false);
  });

  it("commit raises TypeError for unserializable values instead of silently dropping", () => {
    const host = serializedHost();
    const options = { value: undefined as unknown };
    expect(() => commit.call(host, "session", options as { value: unknown })).toThrow(TypeError);
  });

  it("serializer honors a caller-supplied custom serializer object", () => {
    const custom: CookieSerializer = {
      dump: (v) => `!${String(v)}!`,
      load: (s) => s.slice(1, -1),
      dumped: (s) => s.startsWith("!") && s.endsWith("!"),
    };
    const host = serializedHost({ "action_dispatch.cookies_serializer": custom });
    expect(serializer.call(host)).toBe(custom);
    const options = { value: "abc" } as { value: unknown };
    commit.call(host, "k", options);
    expect(options.value).toBe("!abc!");
  });

  it("serializer falls back to JSON for symbol-style config values", () => {
    const host = serializedHost({ "action_dispatch.cookies_serializer": "json" });
    expect(serializer.call(host).dump("x")).toBe('"x"');
  });
});

describe("CookieJar.signedOrEncrypted", () => {
  it("prefers encrypted when secret_key_base is present on the request", () => {
    const jar = CookieJar.build(
      {
        env: { "action_dispatch.secret_key_base": "skb" },
        cookies: {},
        cookiesAppOptions: { secret: "s" },
      },
      {},
    );
    expect(jar.signedOrEncrypted).toBeInstanceOf((jar.encrypted as object).constructor);
  });

  it("falls back to signed when secret_key_base is absent", () => {
    const jar = CookieJar.build({ env: {}, cookies: {}, cookiesAppOptions: { secret: "s" } }, {});
    expect(jar.signedOrEncrypted).toBeInstanceOf((jar.signed as object).constructor);
  });
});

describe("SignedCookieJar serialized API", () => {
  it("accepts arbitrary hash values via set and JSON-round-trips them", () => {
    const jar = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      {},
    );
    jar.signed.set("user", { id: 45, name: "Aaron" });
    expect(jar.signed.get("user")).toEqual({ id: 45, name: "Aaron" });
  });

  it("accepts a hash carrying value alongside cookie options", () => {
    const jar = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      {},
    );
    jar.signed.set("user_id", { value: 45, httpOnly: true });
    expect(jar.signed.get("user_id")).toBe(45);
  });

  it("honors a custom serializer from request env for round-trip", () => {
    const custom: CookieSerializer = {
      dump: (v) => `!${String(v)}!`,
      load: (s) => s.slice(1, -1),
      dumped: (s) => s.startsWith("!") && s.endsWith("!"),
    };
    const jar = CookieJar.build(
      {
        env: { "action_dispatch.cookies_serializer": custom },
        cookies: {},
        cookiesAppOptions: { secret: "x".repeat(32) },
      },
      {},
    );
    jar.signed.set("k", "abc");
    expect(jar.signed.get("k")).toBe("abc");
  });

  it("returns undefined when verification fails", () => {
    const seeded = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      { user_id: "tampered--badmac" },
    );
    expect(seeded.signed.get("user_id")).toBeUndefined();
  });
});

describe("EncryptedCookieJar serialized API", () => {
  it("accepts arbitrary hash values via set and JSON-round-trips them", () => {
    const jar = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      {},
    );
    jar.encrypted.set("session", { uid: 7, role: "admin" });
    expect(jar.encrypted.get("session")).toEqual({ uid: 7, role: "admin" });
  });

  it("returns undefined when decryption fails", () => {
    const seeded = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      { session: "ffff--ffff" },
    );
    expect(seeded.encrypted.get("session")).toBeUndefined();
  });

  it("honors a custom serializer from request env for round-trip", () => {
    const custom: CookieSerializer = {
      dump: (v) => `!${String(v)}!`,
      load: (s) => s.slice(1, -1),
      dumped: (s) => s.startsWith("!") && s.endsWith("!"),
    };
    const jar = CookieJar.build(
      {
        env: { "action_dispatch.cookies_serializer": custom },
        cookies: {},
        cookiesAppOptions: { secret: "x".repeat(32) },
      },
      {},
    );
    jar.encrypted.set("k", "abc");
    expect(jar.encrypted.get("k")).toBe("abc");
  });
});

describe("checkForOverflowBang", () => {
  it("raises CookieOverflow once a value exceeds 4096 bytes", () => {
    const big = "x".repeat(4097);
    expect(() => checkForOverflowBang("session", { value: big })).toThrow(CookieOverflow);
  });

  it("passes values at the boundary", () => {
    expect(() => checkForOverflowBang("session", { value: "x".repeat(4096) })).not.toThrow();
  });
});

describe("SignedCookieJar#permanent", () => {
  it("signs the value and gives it the permanent jar's expiry", () => {
    const jar = CookieJar.build(
      { env: {}, cookies: {}, cookiesAppOptions: { secret: "x".repeat(32) } },
      {},
    );
    jar.signed.permanent.set("session_id", { value: "42", httpOnly: true, sameSite: "lax" });
    expect(jar.signed.get("session_id")).toBe("42");
    expect(jar.get("session_id")).toMatch(/--/);
  });
});
