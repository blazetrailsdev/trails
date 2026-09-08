import { describe, expect, it } from "vitest";
import { bodyFromString, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  ChainedCookieJars,
  type CookieSerializer,
  type SerializedCookieJarsHost,
  CookieJar,
  Cookies,
  COOKIES_KEY,
  CookieOverflow,
  checkForOverflowBang,
  commit,
  isReserialize,
  type RequestCookieMethodsHost,
  serializer,
  keyGenerator,
  signedCookieSalt,
  authenticatedEncryptedCookieSalt,
} from "./cookies.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { MessageEncryptor, NullSerializer } from "@blazetrails/activesupport/message-encryptor";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { SerializerWithFallback } from "@blazetrails/activesupport/messages/serializer-with-fallback";
import "../http/request.js";

const SECRET_KEY_BASE = "b3c631c314c0bbca50c1b2843150fe33";

function cookieEnv(env: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "action_dispatch.key_generator": new KeyGenerator(SECRET_KEY_BASE, { iterations: 2 }),
    "action_dispatch.signed_cookie_salt": "signed cookie",
    "action_dispatch.encrypted_cookie_salt": "encrypted cookie",
    "action_dispatch.encrypted_signed_cookie_salt": "signed encrypted cookie",
    "action_dispatch.cookies_rotations": new RotationConfiguration(),
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
      const jar = new CookieJar(cookieRequest());
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
      const jar = new CookieJar(cookieRequest());
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
      const jar = new CookieJar(cookieRequest());
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
      const jar = new CookieJar(cookieRequest());
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
      const jar = new CookieJar(cookieRequest());
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

function chainedHost(env: Record<string, unknown>): ChainedCookieJars {
  return new CookieJar({
    env,
    getHeader: (k: string) => env[k],
    hasHeader: (k: string) => Object.hasOwn(env, k),
    cookies: {},
  }) as unknown as ChainedCookieJars;
}

function chainedJar(env: Record<string, unknown>): CookieJar {
  return new CookieJar(cookieRequest(env));
}

describe("ChainedCookieJars predicates", () => {
  it("signedOrEncrypted prefers encrypted when secret_key_base is present", () => {
    const host = chainedJar({ "action_dispatch.secret_key_base": "abc" });
    expect(host.signedOrEncrypted).toBe(host.encrypted);
  });

  it("signedOrEncrypted falls back to signed when secret_key_base is absent", () => {
    const host = chainedJar({});
    expect(host.signedOrEncrypted).toBe(host.signed);
  });

  it("signedOrEncrypted treats blank secret_key_base as absent", () => {
    const host = chainedJar({ "action_dispatch.secret_key_base": "" });
    expect(host.signedOrEncrypted).toBe(host.signed);
  });

  it("isUpgradeLegacyHmacAesCbcCookies requires every legacy slot to be set", () => {
    const full = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_signed_cookie_salt": "s1",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(ChainedCookieJars.prototype.isUpgradeLegacyHmacAesCbcCookies.call(full)).toBe(true);

    const missingFlag = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_signed_cookie_salt": "s1",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(ChainedCookieJars.prototype.isUpgradeLegacyHmacAesCbcCookies.call(missingFlag)).toBe(
      false,
    );

    const missingSalt = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.encrypted_cookie_salt": "s2",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(ChainedCookieJars.prototype.isUpgradeLegacyHmacAesCbcCookies.call(missingSalt)).toBe(
      false,
    );
  });

  it("isPrepareUpgradeLegacyHmacAesCbcCookies requires the encryption flag to be OFF", () => {
    const ready = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.authenticated_encrypted_cookie_salt": "aec",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(ChainedCookieJars.prototype.isPrepareUpgradeLegacyHmacAesCbcCookies.call(ready)).toBe(
      true,
    );

    const flagOn = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.authenticated_encrypted_cookie_salt": "aec",
      "action_dispatch.use_authenticated_cookie_encryption": true,
    });
    expect(ChainedCookieJars.prototype.isPrepareUpgradeLegacyHmacAesCbcCookies.call(flagOn)).toBe(
      false,
    );

    const missingSalt = chainedHost({
      "action_dispatch.secret_key_base": "abc",
      "action_dispatch.use_authenticated_cookie_encryption": false,
    });
    expect(
      ChainedCookieJars.prototype.isPrepareUpgradeLegacyHmacAesCbcCookies.call(missingSalt),
    ).toBe(false);
  });
});

function serializedHost(env: Record<string, unknown> = {}): SerializedCookieJarsHost {
  const jar = new CookieJar(cookieRequest(env));
  return { request: jar.request, set: (name, options) => jar.set(name, options as never) };
}

describe("SerializedCookieJars", () => {
  it("commit dumps via the configured serializer (marshal by default)", () => {
    const host = serializedHost();
    const options = { value: { hello: "world" } } as { value: unknown };
    commit.call(host, "session", options);
    expect(SerializerWithFallback.get("marshal").load(options.value as string)).toEqual({
      hello: "world",
    });
  });

  it("isReserialize is true when the payload was not produced by JSON", () => {
    const host = serializedHost({ "action_dispatch.cookies_serializer": "json" });
    expect(isReserialize.call(host, "not-json")).toBe(true);
    expect(isReserialize.call(host, '{"ok":true}')).toBe(false);
  });

  it("isReserialize is false for a caller-supplied serializer object", () => {
    const custom: CookieSerializer = {
      dump: (v) => `!${String(v)}!`,
      load: (s) => s.slice(1, -1),
      dumped: (_s) => false,
    };
    const host = serializedHost({ "action_dispatch.cookies_serializer": custom });
    expect(isReserialize.call(host, "anything")).toBe(false);
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
    const jar = CookieJar.build(cookieRequest({ "action_dispatch.secret_key_base": "skb" }), {});
    expect(jar.signedOrEncrypted).toBeInstanceOf((jar.encrypted as object).constructor);
  });

  it("falls back to signed when secret_key_base is absent", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    expect(jar.signedOrEncrypted).toBeInstanceOf((jar.signed as object).constructor);
  });
});

describe("SignedKeyRotatingCookieJar serialized API", () => {
  it("accepts arbitrary hash values via set and JSON-round-trips them", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    jar.signed.set("user", { value: { id: 45, name: "Aaron" } });
    expect(jar.signed.get("user")).toEqual({ id: 45, name: "Aaron" });
  });

  it("accepts a hash carrying value alongside cookie options", () => {
    const jar = CookieJar.build(cookieRequest(), {});
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
      cookieRequest({ "action_dispatch.cookies_serializer": custom }),
      {},
    );
    jar.signed.set("k", "abc");
    expect(jar.signed.get("k")).toBe("abc");
  });

  it("returns undefined when verification fails", () => {
    const seeded = CookieJar.build(cookieRequest(), { user_id: "tampered--badmac" });
    expect(seeded.signed.get("user_id")).toBeUndefined();
  });
});

describe("EncryptedKeyRotatingCookieJar serialized API", () => {
  it("accepts arbitrary hash values via set and JSON-round-trips them", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    jar.encrypted.set("session", { value: { uid: 7, role: "admin" } });
    expect(jar.encrypted.get("session")).toEqual({ uid: 7, role: "admin" });
  });

  it("returns undefined when decryption fails", () => {
    const seeded = CookieJar.build(cookieRequest(), { session: "ffff--ffff" });
    expect(seeded.encrypted.get("session")).toBeUndefined();
  });

  it("honors a custom serializer from request env for round-trip", () => {
    const custom: CookieSerializer = {
      dump: (v) => `!${String(v)}!`,
      load: (s) => s.slice(1, -1),
      dumped: (s) => s.startsWith("!") && s.endsWith("!"),
    };
    const jar = CookieJar.build(
      cookieRequest({ "action_dispatch.cookies_serializer": custom }),
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

describe("SignedKeyRotatingCookieJar#permanent", () => {
  it("signs the value and gives it the permanent jar's expiry", () => {
    const jar = CookieJar.build(cookieRequest(), {});
    jar.signed.permanent.set("session_id", { value: "42", httpOnly: true, sameSite: "lax" });
    expect(jar.signed.get("session_id")).toBe("42");
    expect(jar.get("session_id")).toMatch(/--/);
  });
});

describe("cookies_rotations", () => {
  const marshal = SerializerWithFallback.get("marshal");

  it("signed cookie rotating secret and digest", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const rotations = new RotationConfiguration();
    rotations.rotate("signed", secret, { digest: "SHA1" });

    const oldMessage = new MessageVerifier(secret, {
      digest: "SHA1",
      serializer: NullSerializer,
    }).generate(marshal.dump(45));

    const request = cookieRequest({
      "action_dispatch.signed_cookie_digest": "SHA256",
      "action_dispatch.cookies_rotations": rotations,
    });
    const jar = CookieJar.build(request, { user_id: oldMessage });

    expect(jar.signed.get("user_id")).toBe(45);

    const secretFromGenerator = keyGenerator
      .call(request)!
      .generateKey(signedCookieSalt.call(request)!) as string;
    const verifier = new MessageVerifier(secretFromGenerator, {
      digest: "SHA256",
      serializer: NullSerializer,
    });
    expect(marshal.load(verifier.verify(jar.get("user_id")!) as string)).toBe(45);
  });

  it("rotating signed cookies digest", () => {
    const rotations = new RotationConfiguration();
    rotations.rotate("signed", { digest: "SHA1" });

    const request = cookieRequest({
      "action_dispatch.signed_cookie_digest": "SHA256",
      "action_dispatch.cookies_rotations": rotations,
    });
    const oldSecret = keyGenerator
      .call(request)!
      .generateKey(signedCookieSalt.call(request)!) as string;
    const oldValue = new MessageVerifier(oldSecret, {
      digest: "SHA1",
      serializer: NullSerializer,
    }).generate(marshal.dump(45));

    const jar = CookieJar.build(request, { user_id: oldValue });
    expect(jar.signed.get("user_id")).toBe(45);

    const verifier = new MessageVerifier(oldSecret, {
      digest: "SHA256",
      serializer: NullSerializer,
    });
    expect(marshal.load(verifier.verify(jar.get("user_id")!) as string)).toBe(45);
  });

  it("encrypted cookie rotating secret", () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    const rotations = new RotationConfiguration();
    rotations.rotate("encrypted", secret, { digest: "SHA1" });

    const oldMessage = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: NullSerializer,
    }).encryptAndSign(marshal.dump(45));

    const request = cookieRequest({
      "action_dispatch.encrypted_cookie_cipher": "aes-256-gcm",
      "action_dispatch.use_authenticated_cookie_encryption": true,
      "action_dispatch.authenticated_encrypted_cookie_salt": "authenticated encrypted cookie",
      "action_dispatch.cookies_rotations": rotations,
    });
    const jar = CookieJar.build(request, { foo: oldMessage });

    expect(jar.encrypted.get("foo")).toBe(45);

    const keyLen = MessageEncryptor.keyLen("aes-256-gcm");
    const secretFromGenerator = keyGenerator
      .call(request)!
      .generateKey(authenticatedEncryptedCookieSalt.call(request)!, keyLen) as Buffer;
    const encryptor = new MessageEncryptor(secretFromGenerator, {
      cipher: "aes-256-gcm",
      serializer: NullSerializer,
    });
    expect(marshal.load(encryptor.decryptAndVerify(jar.get("foo")!) as string)).toBe(45);
  });
});
