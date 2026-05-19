import { describe, it, expect, vi } from "vitest";
import {
  authenticate,
  authenticationRequest,
  authParam,
  authScheme,
  decodeCredentials,
  encodeCredentials,
  hasBasicCredentials,
  userNameAndPassword,
  authenticateOrRequestWithHttpBasic,
  authenticateWithHttpBasic,
  httpBasicAuthenticateOrRequestWith,
  httpBasicAuthenticateWith,
  requestHttpBasicAuthentication,
  type BasicControllerHost,
} from "./http-authentication.js";

const req = (auth?: string) => ({ authorization: auth });
const ctrl = (auth?: string): BasicControllerHost => ({
  request: req(auth),
  headers: {},
  status: 200,
  responseBody: null,
});

describe("HttpAuthentication::Basic", () => {
  it("encode/decode round-trip, including colons in password", () => {
    const header = encodeCredentials("admin", "se:cret");
    expect(decodeCredentials(req(header))).toBe("admin:se:cret");
    expect(userNameAndPassword(req(header))).toEqual(["admin", "se:cret"]);
  });

  it("authScheme + authParam mirror Ruby split(' ', 2) — ignores leading + collapses runs", () => {
    expect([authScheme(req("Basic Zm9v")), authParam(req("Basic Zm9v"))]).toEqual([
      "Basic",
      "Zm9v",
    ]);
    expect(authParam(req("Bearer"))).toBeUndefined();
    expect([authScheme(req("  Basic   Zm9v")), authParam(req("  Basic   Zm9v"))]).toEqual([
      "Basic",
      "Zm9v",
    ]);
  });

  it("hasBasicCredentials is case-insensitive, rejects empty/whitespace/wrong scheme", () => {
    expect(hasBasicCredentials(req("basic Zm9vOmJhcg=="))).toBe(true);
    expect(hasBasicCredentials(req("Bearer abc"))).toBe(false);
    expect(hasBasicCredentials(req())).toBe(false);
    expect(hasBasicCredentials(req("   "))).toBe(false);
  });

  it("authenticate invokes login_procedure with decoded user+pass, else returns undefined", () => {
    const verify = vi.fn((u: string, p: string) => `${u}/${p}`);
    expect(authenticate(req(encodeCredentials("dhh", "secret")), verify)).toBe("dhh/secret");
    expect(authenticate(req(), verify)).toBeUndefined();
  });

  it("authenticationRequest writes 401 + WWW-Authenticate and strips realm quotes", () => {
    const c = { headers: {} as Record<string, string>, status: 200, responseBody: null };
    authenticationRequest(c, 'Evil"Realm', null);
    expect(c.headers["WWW-Authenticate"]).toBe('Basic realm="EvilRealm"');
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("HTTP Basic: Access denied.\n");
  });
});

describe("HttpAuthentication::Basic::ControllerMethods", () => {
  it("authenticateWithHttpBasic delegates to authenticate using this.request", () => {
    const c = ctrl(encodeCredentials("u", "p"));
    expect(authenticateWithHttpBasic.call(c, (u, p) => ({ u, p }))).toEqual({ u: "u", p: "p" });
  });

  it("authenticateOrRequestWithHttpBasic returns login result, else issues 401", () => {
    const ok = ctrl(encodeCredentials("u", "p"));
    expect(authenticateOrRequestWithHttpBasic.call(ok, null, null, () => "OK")).toBe("OK");
    const fail = ctrl();
    expect(authenticateOrRequestWithHttpBasic.call(fail, null, null, () => "OK")).toBe(false);
    expect(fail.status).toBe(401);
    expect(fail.headers["WWW-Authenticate"]).toBe('Basic realm="Application"');
  });

  it("requestHttpBasicAuthentication uses provided realm + message", () => {
    const c = ctrl();
    requestHttpBasicAuthentication.call(c, "Zone", "nope");
    expect(c.headers["WWW-Authenticate"]).toBe('Basic realm="Zone"');
    expect(c.responseBody).toBe("nope");
  });

  it("httpBasicAuthenticateOrRequestWith succeeds only on matching credentials", () => {
    const ok = ctrl(encodeCredentials("dhh", "secret"));
    expect(httpBasicAuthenticateOrRequestWith.call(ok, { name: "dhh", password: "secret" })).toBe(
      true,
    );
    const bad = ctrl(encodeCredentials("dhh", "wrong"));
    expect(httpBasicAuthenticateOrRequestWith.call(bad, { name: "dhh", password: "secret" })).toBe(
      false,
    );
    expect(bad.status).toBe(401);
  });
});

describe("HttpAuthentication::Basic::ControllerMethods::ClassMethods", () => {
  it("httpBasicAuthenticateWith registers a beforeAction filter and forwards filter options", () => {
    const beforeAction = vi.fn();
    httpBasicAuthenticateWith.call({ beforeAction }, { name: "dhh", password: "s", only: "edit" });
    const [cb, opts] = beforeAction.mock.calls[0];
    expect(opts).toEqual({ only: "edit" });
    expect(cb(ctrl(encodeCredentials("dhh", "s")))).toBe(true);
  });

  it("httpBasicAuthenticateWith rejects non-string name/password", () => {
    const ba = vi.fn();
    expect(() =>
      httpBasicAuthenticateWith.call({ beforeAction: ba }, { name: 1 as never, password: "x" }),
    ).toThrow(/Expected name/);
    expect(() =>
      httpBasicAuthenticateWith.call({ beforeAction: ba }, { name: "x", password: null as never }),
    ).toThrow(/Expected password/);
  });
});
