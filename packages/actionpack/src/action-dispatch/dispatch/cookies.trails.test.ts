import { describe, it, expect } from "vitest";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { Response } from "@blazetrails/rack";
import { CookieJar } from "../middleware/cookies.js";
import type { RequestCookieMethodsHost } from "../middleware/cookies.js";
import { TestRequest } from "../testing/test-request.js";

const SECRET_KEY_BASE = "b3c631c314c0bbca50c1b2843150fe33";

function cookieRequest(): RequestCookieMethodsHost {
  const request = TestRequest.create({
    "action_dispatch.key_generator": new KeyGenerator(SECRET_KEY_BASE, { iterations: 2 }),
    "action_dispatch.cookies_rotations": new RotationConfiguration(),
    "action_dispatch.secret_key_base": SECRET_KEY_BASE,
    "action_dispatch.signed_cookie_salt": "signed cookie",
    "action_dispatch.authenticated_encrypted_cookie_salt": "authenticated encrypted cookie",
    "action_dispatch.use_authenticated_cookie_encryption": true,
    "action_dispatch.cookies_same_site_protection": () => ":lax",
  });
  request.host = "www.nextangle.com";
  return request as unknown as RequestCookieMethodsHost;
}

function setCookieHeaders(jar: CookieJar): string[] {
  const response = new Response();
  jar.write(response);
  const header = response.headers["set-cookie"] as string | string[] | undefined;
  if (header === undefined || header === null) return [];
  return Array.isArray(header) ? header : [header];
}

describe("CookieJar (trails)", () => {
  it("setting cookie expires from a Temporal.Instant", () => {
    const jar = new CookieJar(cookieRequest());
    const instant = Temporal.Instant.from("2030-04-15T12:00:00Z");
    jar.set("user_name", { value: "david", expires: instant });
    const headers = setCookieHeaders(jar);
    expect(headers[0]).toContain("expires=Mon, 15 Apr 2030 12:00:00 GMT");
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
});
