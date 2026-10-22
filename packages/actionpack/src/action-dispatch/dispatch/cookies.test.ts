import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Response } from "@blazetrails/rack";
import { CookieJar } from "../middleware/cookies.js";
import { CookieOverflow, type RequestCookieMethodsHost } from "../middleware/cookies.js";
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
  assert,
  assertNot,
  assertEmpty,
  assertNothingRaised,
} from "@blazetrails/activesupport";
import { ArgumentError, JSON, Marshal, block, hashDelete } from "@blazetrails/ruby-compat";
import { escape } from "@blazetrails/rack";
import { CookieAssertions } from "../../test-helpers/abstract-unit.js";
import { TestRequest } from "../testing/test-request.js";
import { Base } from "../../action-controller/base.js";
import { TestCase } from "../../action-controller/test-case.js";
import { Duration, include, isPresent } from "@blazetrails/activesupport";
import { afterTeardown, travel, travelTo } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";

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
  const header = response.headers["set-cookie"] as string | string[] | undefined;
  if (header === undefined || header === null) return [];
  return Array.isArray(header) ? header : [header];
}

describe("CookieJarTest", () => {
  it("fetch", () => {
    const request = TestRequest.create(cookieEnv());
    const x = {};
    assertNot(request.cookieJar().isKey("zzzzzz"));
    assertEqual(x, request.cookieJar().fetch("zzzzzz", x));
    assertNot(request.cookieJar().isKey("zzzzzz"));
  });

  it("fetch exists", () => {
    const jar = CookieJar.build(cookieRequest(), { foo: "bar" });
    expect(jar.fetch("foo", "default")).toBe("bar");
  });

  it("fetch block", () => {
    const request = TestRequest.create(cookieEnv());
    const x = {};
    assertNot(request.cookieJar().isKey("zzzzzz"));
    assertEqual(
      x,
      request.cookieJar().fetch(
        "zzzzzz",
        block(() => x),
      ),
    );
  });

  it("key is to s", () => {
    const jar = new CookieJar(cookieRequest());
    jar.set("foo", "bar");
    expect(jar.get("foo")).toBe("bar");
  });

  it("to hash", () => {
    const request = TestRequest.create(cookieEnv());
    request.cookieJar().set("foo", "bar");
    assertEqual({ foo: "bar" }, request.cookieJar().toHash());
    assertEqual({ foo: "bar" }, request.cookieJar().toH());
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
    const request = TestRequest.create(cookieEnv());
    assertNot(request.cookieJar().isKey("foo"));
    assertNot(request.cookieJar().hasKey("foo"));

    request.cookieJar().set("foo", "bar");
    assert(request.cookieJar().isKey("foo"));
    assert(request.cookieJar().hasKey("foo"));
  });

  it("write doesnt set a nil header", () => {
    const headers: Record<string, unknown> = {};
    TestRequest.create(cookieEnv())
      .cookieJar()
      .write(headers as unknown as Parameters<CookieJar["write"]>[0]);
    assertNotIncludes(headers, "Set-Cookie");
  });
});

describe("CookiesMiddlewareTest", () => {
  it("sets expected cookie header", () => {
    const env = cookieEnv();
    delete env["action_dispatch.cookies_same_site_protection"];
    const request = TestRequest.create(env);
    request.cookieJar().set("foo", "bar");
    const headers = setCookieHeaders(request.cookieJar());
    assertEqual("foo=bar; path=/", headers[0]);
  });
});

describe("CookiesTest", () => {
  it("setting cookie with no same site protection", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => ":none";

    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=None");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with same site protection proc normal user agent", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = (request: {
      userAgent: string;
    }) => (request.userAgent === "spooky browser" ? undefined : ":strict");

    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Strict");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with same site protection proc special user agent", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = (request: {
      userAgent: string;
    }) => (request.userAgent === "spooky browser" ? undefined : ":strict");

    tc.request.userAgent = "spooky browser";
    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with misspelled same site protection raises", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => ":funky";

    const error = await assertRaise([ArgumentError], {}, async () => {
      await tc.get("authenticate");
    });
    assertMatch(/Invalid :?Same_?Site value: :funky/i, error.message);
  });

  it("setting cookie with same site strict", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => ":strict";

    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Strict");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with same site nil", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => null;

    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with specific same site strict", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => ":lax";

    await tc.get("setSameSiteStrict");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Strict");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with specific same site nil", async () => {
    tc.request.env["action_dispatch.cookies_same_site_protection"] = () => ":lax";

    await tc.get("setSameSiteNil");
    tc.assertSetCookieHeader("user_name=david; path=/");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie", async () => {
    await tc.get("authenticate");
    tc.assertSetCookieHeader("user_name=david; path=/; SameSite=Lax");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting the same value to cookie", async () => {
    tc.request.cookies["user_name"] = "david";
    await tc.get("authenticate");
    assertEmpty(tc.response.cookies);
  });

  it("setting the same value to permanent cookie", async () => {
    tc.request.cookies["user_name"] = "Jamie";
    await tc.get("setPermanentCookie");
    assertEqual({ user_name: "Jamie" }, tc.response.cookies);
  });

  it("setting cookie for fourteen days", async () => {
    await tc.get("authenticateForFourteenDays");
    tc.assertSetCookieHeader(
      "user_name=david; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT; SameSite=Lax",
    );
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie for fourteen days with symbols", async () => {
    await tc.get("authenticateForFourteenDaysWithSymbols");
    tc.assertSetCookieHeader(
      "user_name=david; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT; SameSite=Lax",
    );
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with http only", async () => {
    await tc.get("authenticateWithHttpOnly");
    tc.assertSetCookieHeader("user_name=david; path=/; HttpOnly; SameSite=Lax");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with secure", async () => {
    tc.request.env["HTTPS"] = "on";
    await tc.get("authenticateWithSecure");
    tc.assertSetCookieHeader("user_name=david; path=/; secure; SameSite=Lax");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with secure on onion address", async () => {
    tc.request.host = "fake.onion";
    await tc.get("authenticateWithSecure");
    tc.assertSetCookieHeader("user_name=david; path=/; secure; SameSite=Lax");
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("setting cookie with secure when always write cookie is true", async () => {
    const oldCookie = tc.request.cookieJar().alwaysWriteCookie;
    tc.request.cookieJar().alwaysWriteCookie = true;
    try {
      await tc.get("authenticateWithSecure");
      tc.assertSetCookieHeader("user_name=david; path=/; secure; SameSite=Lax");
      assertEqual({ user_name: "david" }, tc.response.cookies);
    } finally {
      tc.request.cookieJar().alwaysWriteCookie = oldCookie;
    }
  });

  it("not setting cookie with secure", async () => {
    await tc.get("authenticateWithSecure");
    tc.assertNotSetCookieHeader("user_name");
    assertNotEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("multiple cookies", async () => {
    await tc.get("setMultipleCookies");
    assertEqual(2, Object.keys(tc.response.cookies).length);
    tc.assertSetCookieHeader([
      "user_name=david; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT; SameSite=Lax",
      "login=XJ-122; path=/; SameSite=Lax",
    ]);
    assertEqual({ login: "XJ-122", user_name: "david" }, tc.response.cookies);
  });

  it("setting test cookie", async () => {
    await assertNothingRaised(() => tc.get("accessFrozenCookies"));
  });

  it("expiring cookie", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("logout");
    tc.assertSetCookieHeader(
      "user_name=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
    assertEqual({ user_name: null }, tc.response.cookies);
  });

  it("delete cookie with path", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteCookieWithPath");
    tc.assertSetCookieHeader(
      "user_name=; path=/beaten; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    );
  });

  it("delete cookie return value", () => {
    tc.request.cookies["user_name"] = "Joe";
    const returnValue = hashDelete(tc.request.cookies, "user_name");
    assertEqual("Joe", returnValue);
  });

  it("delete unexisting cookie return value", () => {
    const returnValue = hashDelete(tc.request.cookies, "no_such_cookie");
    assertNil(returnValue);
  });

  it("delete unexisting cookie", async () => {
    for (const key of Object.keys(tc.request.cookies)) delete tc.request.cookies[key];
    await tc.get("deleteCookie");
    assertEmpty(tc.response.cookies);
  });

  it("deleted cookie predicate", () => {
    tc.cookies().set("user_name", "Joe");
    tc.cookies().delete("user_name");
    assert(tc.cookies().isDeleted("user_name"));
    assertEqual(false, tc.cookies().isDeleted("another"));
  });

  it("deleting cookie get", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleting cookie post", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.post("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleting cookie patch", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.patch("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleting cookie put", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.put("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleting cookie delete", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.delete("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleting cookie head", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.head("logout");
    assertNil(tc.cookies().get("user_name"));
  });

  it("deleted cookie predicate with mismatching options", () => {
    tc.cookies().set("user_name", "Joe");
    tc.cookies().delete("user_name", { path: "/path" });
    assertEqual(false, tc.cookies().isDeleted("user_name", { path: "/different" }));
  });

  it("cookies persist throughout request", async () => {
    const response = await tc.get("authenticate");
    assertMatch(/user_name=david/, response.headers.get("Set-Cookie")!);
  });

  it("set permanent cookie", async () => {
    await tc.get("setPermanentCookie");
    assertMatch(/Jamie/, tc.response.headers.get("Set-Cookie")!);
    assertMatch(
      new RegExp(`${new Date().getUTCFullYear() + 20}`),
      tc.response.headers.get("Set-Cookie")!,
    );
  });

  it("read permanent cookie", async () => {
    await tc.get("setPermanentCookie");
    assertEqual("Jamie", controllerCookies().permanent.get("user_name"));
  });

  it("signed cookie using default digest", async () => {
    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const verifier = new MessageVerifier(secret, { serializer: Marshal, digest: "SHA1" });
    assertEqual(verifier.generate(45), cookies.get("user_id"));
  });

  it("tampered with signed cookie", async () => {
    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const verifier = new MessageVerifier(secret, { serializer: Marshal, digest: "SHA1" });
    const message = verifier.generate(45);

    tc.request.headers.set(
      "Cookie",
      `user_id=${String.fromCharCode(...Marshal.dump(45))}--${message.split("--").at(-1)}`,
    );
    await tc.get("getSignedCookie");
    assertNil(controllerCookies().signed.get("user_id"));
  });

  it("signed cookie using default serializer", async () => {
    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it("signed cookie using json serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":json";
    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it("signed cookie using custom serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = CustomSerializer;
    await tc.get("setSignedCookie");
    assertNotEqual(45, tc.cookies().get("user_id"));
    assertEqual("45 was dumped and loaded", tc.cookies().signed.get("user_id"));
  });

  it("accessing nonexistent signed cookie should not raise an invalid signature", async () => {
    await tc.get("setSignedCookie");
    assertNil(controllerCookies().signed.get("non_existent_attribute"));
  });

  it("encrypted cookie using default serializer", async () => {
    await tc.get("setEncryptedCookie");
    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it("encrypted cookie using json serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":json";
    await tc.get("setEncryptedCookie");
    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it("encrypted cookie using custom serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = CustomSerializer;
    await tc.get("setEncryptedCookie");
    assertNotEqual("bar", tc.cookies().encrypted.get("foo"));
    assertEqual("bar was dumped and loaded", tc.cookies().encrypted.get("foo"));
  });

  it("signed cookie using hybrid serializer can migrate marshal dumped value to json", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":hybrid";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const marshalValue = new MessageVerifier(secret, { serializer: Marshal }).generate(45);
    tc.request.headers.set("Cookie", `user_id=${marshalValue}`);

    await tc.get("getSignedCookie");

    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const verifier = new MessageVerifier(secret, { serializer: JSON });
    assertEqual(45, verifier.verify(tc.response.cookies["user_id"]!));
  });

  it("accessing nonexistent encrypted cookie should not raise invalid message", async () => {
    await tc.get("setEncryptedCookie");
    assertNil(controllerCookies().encrypted.get("non_existent_attribute"));
  });

  it("setting invalid encrypted cookie should return nil when accessing it", async () => {
    await tc.get("setInvalidEncryptedCookie");
    assertNil(controllerCookies().encrypted.get("invalid_cookie"));
  });

  it("delete and set cookie", async () => {
    tc.request.cookies["user_name"] = "Joe";
    await tc.get("deleteAndSetCookie");
    tc.assertSetCookieHeader(
      "user_name=david; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT; SameSite=Lax",
    );
    assertEqual({ user_name: "david" }, tc.response.cookies);
  });

  it("raise data overflow", async () => {
    const error = await assertRaise([CookieOverflow], {}, async () => {
      await tc.get("raiseDataOverflow");
    });
    assertEqual("foo cookie overflowed with size 5522 bytes", error.message);
  });

  it("tampered cookies", async () => {
    await assertNothingRaised(async () => {
      await tc.get("tamperedCookies");
      tc.assertResponse("success");
    });
  });

  it("legacy signed cookie is treated as nil by signed cookie jar if tampered", async () => {
    tc.request.headers.set("Cookie", "user_id=45");
    await tc.get("getSignedCookie");

    assertNil(controllerCookies().signed.get("user_id"));
    assertNil(tc.response.cookies["user_id"]);
  });

  it("legacy signed cookie is treated as nil by encrypted cookie jar if tampered", async () => {
    tc.request.headers.set("Cookie", "foo=baz");
    await tc.get("getEncryptedCookie");

    assertNil(controllerCookies().encrypted.get("foo"));
    assertNil(tc.response.cookies["foo"]);
  });

  it("signed cookie using custom digest", async () => {
    tc.request.env["action_dispatch.signed_cookie_digest"] = "SHA256";

    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const verifier = new MessageVerifier(secret, { serializer: Marshal, digest: "SHA256" });
    assertEqual(verifier.generate(45), cookies.get("user_id"));
  });

  it("signed cookie rotating secret and digest", async () => {
    let secret: string | ReturnType<KeyGenerator["generateKey"]> =
      "b3c631c314c0bbca50c1b2843150fe33";

    tc.request.env["action_dispatch.signed_cookie_digest"] = "SHA256";
    (tc.request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "signed",
      secret,
      { digest: "SHA1" },
    );

    const oldMessage = new MessageVerifier(secret, {
      digest: "SHA1",
      serializer: Marshal,
    }).generate(45);
    tc.request.headers.set("Cookie", `user_id=${oldMessage}`);

    await tc.get("getSignedCookie");
    assertEqual(45, controllerCookies().signed.get("user_id"));

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );
    const verifier = new MessageVerifier(secret, { digest: "SHA256", serializer: Marshal });
    assertEqual(45, verifier.verify(tc.response.cookies["user_id"]!));
  });

  it("signed cookie using marshal serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":marshal";
    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it.skip("wrapped signed cookie using json serializer", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it("signed cookie using message pack serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":message_pack";
    await tc.get("setSignedCookie");
    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));
  });

  it("signed cookie using marshal serializer can read from json dumped value", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":marshal";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const jsonValue = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    tc.request.headers.set("Cookie", `user_id=${jsonValue}`);

    await tc.get("getSignedCookie");

    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(tc.response.cookies["user_id"]);
  });

  it("signed cookie using hybrid serializer can read from json dumped value", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":hybrid";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const jsonValue = new MessageVerifier(secret, { serializer: JSON }).generate(45);
    tc.request.headers.set("Cookie", `user_id=${jsonValue}`);

    await tc.get("getSignedCookie");

    const cookies = controllerCookies();
    assertNotEqual(45, cookies.get("user_id"));
    assertEqual(45, cookies.signed.get("user_id"));

    assertNil(tc.response.cookies["user_id"]);
  });

  it("signed cookie using json serializer will drop marshal dumped value", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":json";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );

    const marshalValue = new MessageVerifier(secret, { serializer: Marshal }).generate("bar");

    tc.request.headers.set("Cookie", `foo=${escape(marshalValue)}`);

    await tc.get("getSignedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertNil(tc.response.cookies["foo"]);
  });

  it.skip("signed cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it("encrypted cookie using marshal serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":marshal";
    await tc.get("setEncryptedCookie");
    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it.skip("wrapped encrypted cookie using json serializer", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it("encrypted cookie using message pack serializer", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":message_pack";
    await tc.get("setEncryptedCookie");
    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.signed.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
  });

  it("encrypted cookie using hybrid serializer can migrate marshal dumped value to json", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":hybrid";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    const marshalValue = encryptor.encryptAndSign("bar");
    tc.request.headers.set("Cookie", `foo=${escape(marshalValue)}`);

    await tc.get("getEncryptedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const jsonEncryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    assertNotNil(tc.response.cookies["foo"]);
    assertEqual("bar", jsonEncryptor.decryptAndVerify(tc.response.cookies["foo"]!));
  });

  it("encrypted cookie using hybrid serializer can read from json dumped value", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":hybrid";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: JSON });
    const jsonValue = encryptor.encryptAndSign("bar");
    tc.request.headers.set("Cookie", `foo=${escape(jsonValue)}`);

    await tc.get("getEncryptedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    assertNil(tc.response.cookies["foo"]);
  });

  it("encrypted cookie using json serializer will drop marshal dumped value", async () => {
    tc.request.env["action_dispatch.cookies_serializer"] = ":json";

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      32,
    ) as Buffer;

    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    const marshalValue = encryptor.encryptAndSign("bar");
    tc.request.headers.set("Cookie", `foo=${escape(marshalValue)}`);

    await tc.get("getEncryptedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertNil(cookies.encrypted.get("foo"));
    assertNil(tc.response.cookies["foo"]);
  });

  it.skip("encrypted cookie using message pack serializer can migrate json dumped value to message pack", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it("cookie jar mutated by request persists on future requests", async () => {
    await tc.get("authenticate");
    const cookieJar = tc.request.cookieJar();
    cookieJar.signed.set("user_id", 123);
    assertEqual(["user_name", "user_id"], [...cookieJarCookies(tc.request.cookieJar()).keys()]);
    await tc.get("getSignedCookie");
    assertEqual(["user_name", "user_id"], [...cookieJarCookies(tc.request.cookieJar()).keys()]);
  });

  it("permanent signed cookie", async () => {
    await tc.get("setPermanentSignedCookie");
    assertMatch(
      new RegExp(`${new Date().getUTCFullYear() + 20}`),
      tc.response.headers.get("Set-Cookie")!,
    );
    assertEqual(100, controllerCookies().signed.get("remember_me"));
  });

  it.skip("use authenticated cookie encryption uses legacy hmac aes cbc encryption when not enabled", async () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    tc.request.env["action_dispatch.use_authenticated_cookie_encryption"] = null;

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const encryptedCookieSalt = tc.request.env["action_dispatch.encrypted_cookie_salt"] as string;
    const encryptedSignedCookieSalt = tc.request.env[
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

    await tc.get("setEncryptedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));
    assertEqual("bar", encryptor.decryptAndVerify(tc.response.cookies["foo"]!));
  });

  it.skip("rotating signed cookies digest", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it.skip("legacy hmac aes cbc marshal mode falls back to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it.skip("legacy hmac aes cbc json mode falls back to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it("encrypted cookie rotating secret", async () => {
    let secret: string | Buffer = "b3c631c314c0bbca50c1b2843150fe33";

    tc.request.env["action_dispatch.encrypted_cookie_cipher"] = "aes-256-gcm";
    (tc.request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "encrypted",
      secret,
      { digest: "SHA1" },
    );

    const keyLen = MessageEncryptor.keyLen("aes-256-gcm");

    const oldMessage = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    }).encryptAndSign(45);

    tc.request.headers.set("Cookie", `foo=${escape(oldMessage)}`);

    await tc.get("getEncryptedCookie");
    assertEqual(45, controllerCookies().encrypted.get("foo"));

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    secret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string,
      keyLen,
    ) as Buffer;
    const encryptor = new MessageEncryptor(secret, {
      cipher: "aes-256-gcm",
      serializer: Marshal,
    });
    assertEqual(45, encryptor.decryptAndVerify(tc.response.cookies["foo"]!));
  });

  it.skip("legacy hmac aes cbc encrypted marshal cookie is upgraded to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it.skip("legacy hmac aes cbc encrypted json cookie is upgraded to authenticated encrypted cookie", () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
  });

  it.skip("legacy hmac aes cbc encrypted cookie using 64 byte key is upgraded to authenticated encrypted cookie", async () => {
    // BLOCKED: cookie-jar-serializer-fallbacks-and-legacy-cbc-upgrade
    tc.request.env["action_dispatch.secret_key_base"] = "c3b95688f35581fad38df788add315ff";
    tc.request.env["action_dispatch.encrypted_cookie_salt"] = "b3c631c314c0bbca50c1b2843150fe33";
    tc.request.env["action_dispatch.encrypted_signed_cookie_salt"] =
      "b3c631c314c0bbca50c1b2843150fe33";

    const message = Buffer.from(
      "566d4e75536d686e633246564e6b493062557079626c566d51574d30515430394c53315665564a694e4563786555744f57537454576b396a5a31566a626e52525054303d2d2d34663234333330623130623261306163363562316266323335396164666364613564643134623131",
      "hex",
    ).toString("latin1");
    tc.request.headers.set("Cookie", `foo=${message}`);

    await tc.get("getEncryptedCookie");

    const cookies = controllerCookies();
    assertNotEqual("bar", cookies.get("foo"));
    assertEqual("bar", cookies.encrypted.get("foo"));

    const salt = tc.request.env["action_dispatch.authenticated_encrypted_cookie_salt"] as string;
    const secret = (tc.request.env["action_dispatch.key_generator"] as KeyGenerator).generateKey(
      salt,
      MessageEncryptor.keyLen("aes-256-gcm"),
    ) as Buffer;
    const encryptor = new MessageEncryptor(secret, { cipher: "aes-256-gcm", serializer: Marshal });

    assertEqual("bar", encryptor.decryptAndVerify(tc.response.cookies["foo"]!));
  });

  it("cookie with hash value not modified by rotation", async () => {
    tc.request.env["action_dispatch.signed_cookie_digest"] = "SHA256";
    (tc.request.env["action_dispatch.cookies_rotations"] as RotationConfiguration).rotate(
      "signed",
      { digest: "SHA1" },
    );

    const keyGenerator = tc.request.env["action_dispatch.key_generator"] as KeyGenerator;
    const oldSecret = keyGenerator.generateKey(
      tc.request.env["action_dispatch.signed_cookie_salt"] as string,
    );
    const oldValue = new MessageVerifier(oldSecret).generate({ bar: "baz" });

    tc.request.headers.set("Cookie", `foo=${oldValue}`);
    await tc.get("getSignedCookie");
    assertEqual({ bar: "baz" }, controllerCookies().signed.get("foo"));
  });

  const CustomSerializer = {
    load(value: unknown): string {
      return `${value} and loaded`;
    },

    dump(value: unknown): string {
      return `${value} was dumped`;
    },
  };

  const DOMAINS = ["example1.com", "example2.com", ".example3.com"];

  class TestController extends Base {
    async authenticate(): Promise<void> {
      this.cookies().set("user_name", "david");
      await this.head("ok");
    }

    async authenticateForFourteenDays(): Promise<void> {
      this.cookies().set("user_name", { value: "david", expires: Time.utc(2005, 10, 10, 5) });
      await this.head("ok");
    }

    async authenticateForFourteenDaysWithSymbols(): Promise<void> {
      this.cookies().set("user_name", { value: "david", expires: Time.utc(2005, 10, 10, 5) });
      await this.head("ok");
    }

    async setMultipleCookies(): Promise<void> {
      this.cookies().set("user_name", { value: "david", expires: Time.utc(2005, 10, 10, 5) });
      this.cookies().set("login", "XJ-122");
      await this.head("ok");
    }

    async accessFrozenCookies(): Promise<void> {
      this.cookies().set("will", "work");
      await this.head("ok");
    }

    async setCookieIfNotPresent(): Promise<void> {
      if (!isPresent(this.cookies().get("user_name"))) this.cookies().set("user_name", "alice");
      await this.head("ok");
    }

    async logout(): Promise<void> {
      this.cookies().delete("user_name");
      await this.head("ok");
    }

    declare deleteCookie: TestController["logout"];
    static {
      this.prototype.deleteCookie = this.prototype.logout;
    }

    async deleteCookieWithPath(): Promise<void> {
      this.cookies().delete("user_name", { path: "/beaten" });
      await this.head("ok");
    }

    async authenticateWithHttpOnly(): Promise<void> {
      this.cookies().set("user_name", { value: "david", httpOnly: true });
      await this.head("ok");
    }

    async authenticateWithSecure(): Promise<void> {
      this.cookies().set("user_name", { value: "david", secure: true });
      await this.head("ok");
    }

    async setPermanentCookie(): Promise<void> {
      this.cookies().permanent.set("user_name", "Jamie");
      await this.head("ok");
    }

    async setSignedCookie(): Promise<void> {
      this.cookies().signed.set("user_id", 45);
      await this.head("ok");
    }

    async getSignedCookie(): Promise<void> {
      this.cookies().signed.get("user_id");
      await this.head("ok");
    }

    async setEncryptedCookie(): Promise<void> {
      this.cookies().encrypted.set("foo", "bar");
      await this.head("ok");
    }

    async getEncryptedCookie(): Promise<void> {
      this.cookies().encrypted.get("foo");
      await this.head("ok");
    }

    async setInvalidEncryptedCookie(): Promise<void> {
      this.cookies().set("invalid_cookie", "invalid--9170e00a57cfc27083363b5c75b835e477bd90cf");
      await this.head("ok");
    }

    async raiseDataOverflow(): Promise<void> {
      this.cookies().signed.set("foo", "bye!".repeat(1024));
      await this.head("ok");
    }

    async tamperedCookies(): Promise<void> {
      this.cookies().set("tampered", "BAh7BjoIZm9vIghiYXI%3D--123456780");
      this.cookies().signed.get("tampered");
      await this.head("ok");
    }

    async setPermanentSignedCookie(): Promise<void> {
      this.cookies().permanent.signed.set("remember_me", 100);
      await this.head("ok");
    }

    async deleteAndSetCookie(): Promise<void> {
      this.cookies().delete("user_name");
      this.cookies().set("user_name", { value: "david", expires: Time.utc(2005, 10, 10, 5) });
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

    async setSameSiteStrict(): Promise<void> {
      this.cookies().set("user_name", { value: "david", sameSite: ":strict" });
      await this.head("ok");
    }

    async setSameSiteNil(): Promise<void> {
      this.cookies().set("user_name", { value: "david", sameSite: null });
      await this.head("ok");
    }
  }

  class CookiesTestCase extends TestCase {
    declare assertSetCookieHeader: (expected: string | string[]) => void;
    declare assertNotSetCookieHeader: (expected: string | string[]) => void;

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

  function controllerCookies(): CookieJar {
    return (tc.controller as TestController).cookies();
  }

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

  it("read rails 5 2 stable encrypted cookies if config is false", async () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().encrypted.get("favorite"));
    });

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));
  });

  it("read rails 5 2 stable signed cookies if config is false", async () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = false;

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().signed.get("favorite"));
    });

    await tc.get("rails52StableSignedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Choco Chip Cookie", tc.cookies().signed.get("favorite"));
  });

  it("read rails 5 2 stable encrypted cookies if use metadata config is true", async () => {
    tc.request.env["action_dispatch.use_cookies_with_metadata"] = true;

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOn");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));

    travel(Duration.years(1001), {}, () => {
      assertNil(tc.cookies().encrypted.get("favorite"));
    });

    await tc.get("rails52StableEncryptedCookieWithAuthenticatedEncryptionFlagOff");

    assertEqual("5-2-Stable Chocolate Cookies", tc.cookies().encrypted.get("favorite"));
  });

  it("read rails 5 2 stable signed cookies if use metadata config is true", async () => {
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
