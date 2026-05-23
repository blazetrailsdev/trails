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
  // Digest
  decodeDigestCredentials,
  expectedResponse,
  ha1,
  encodeDigestCredentials,
  nonce,
  validateNonce,
  opaque,
  digestAuthenticationRequest,
  secretToken,
  validateDigestResponse,
  requestHttpDigestAuthentication,
  type DigestControllerHost,
  type DigestRequestLike,
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

// ============================================================================
// HttpAuthentication::Digest tests
// (mirrors http_digest_authentication_test.rb low-level helper coverage)
// ============================================================================

const SECRET = "4fb45da9e4ab4ddeb7580d6a35503d99";
const SALT = "http authentication";

function makeKeyGenerator(secret: string) {
  return {
    generateKey(salt: string): string {
      // Simplified: concatenate secret+salt for tests (rails uses PBKDF2-style)
      return `${secret}${salt}`;
    },
  };
}

function makeDigestRequest(auth?: string): DigestRequestLike {
  return {
    authorization: auth,
    keyGenerator: makeKeyGenerator(SECRET),
    httpAuthSalt: SALT,
    getHeader: () => null,
  };
}

function makeDigestCtrl(auth?: string): DigestControllerHost {
  return {
    request: makeDigestRequest(auth),
    headers: {},
    status: 200,
    responseBody: null,
  };
}

describe("HttpAuthentication::Digest", () => {
  it("decode_credentials parses Digest header into key-value record", () => {
    const header =
      'Digest username="lifo", realm="SuperSecret", nonce="abc", uri="/", response="xyz"';
    const creds = decodeDigestCredentials(header);
    expect(creds.username).toBe("lifo");
    expect(creds.realm).toBe("SuperSecret");
    expect(creds.nonce).toBe("abc");
  });

  it("decode_credentials handles quoted and unquoted values", () => {
    const header = 'Digest username="user", nc=00000001';
    const creds = decodeDigestCredentials(header);
    expect(creds.username).toBe("user");
    expect(creds.nc).toBe("00000001");
  });

  it("opaque is MD5 of secret key", () => {
    const secretKey = secretToken(makeDigestRequest());
    const opaqueVal = opaque(secretKey);
    expect(opaqueVal).toMatch(/^[0-9a-f]{32}$/);
  });

  it("nonce encodes timestamp + MD5 in base64", () => {
    const secretKey = secretToken(makeDigestRequest());
    const nonceVal = nonce(secretKey, 1000000);
    const decoded = Buffer.from(nonceVal, "base64").toString("utf-8");
    expect(decoded).toMatch(/^1000000:/);
  });

  it("validate_nonce accepts a freshly generated nonce", () => {
    const secretKey = secretToken(makeDigestRequest());
    const nonceVal = nonce(secretKey);
    expect(validateNonce(secretKey, makeDigestRequest(), nonceVal)).toBe(true);
  });

  it("validate_nonce rejects nil", () => {
    const secretKey = secretToken(makeDigestRequest());
    expect(validateNonce(secretKey, makeDigestRequest(), null)).toBe(false);
  });

  it("validate_nonce rejects stale nonce", () => {
    const secretKey = secretToken(makeDigestRequest());
    const staleTime = Math.floor(Date.now() / 1000) - 400;
    const nonceVal = nonce(secretKey, staleTime);
    expect(validateNonce(secretKey, makeDigestRequest(), nonceVal, 300)).toBe(false);
  });

  it("expected_response matches ha1+ha2 digest computation", () => {
    const creds = {
      username: "lifo",
      realm: "SuperSecret",
      nonce: "abc",
      nc: "00000001",
      cnonce: "xyz",
      qop: "auth",
      uri: "/",
    };
    const password = "world";
    const ha1Val = ha1(creds, password);
    const response1 = expectedResponse("GET", "/", creds, password, false);
    const response2 = expectedResponse("GET", "/", creds, ha1Val, true);
    expect(response1).toBe(response2);
    expect(response1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("encode_credentials returns Digest header string with response field", () => {
    const creds = {
      username: "lifo",
      realm: "SuperSecret",
      nonce: "abc",
      nc: "00000001",
      cnonce: "xyz",
      qop: "auth",
      uri: "/",
    };
    const encoded = encodeDigestCredentials("GET", creds, "world", false);
    expect(encoded).toMatch(/^Digest /);
    expect(encoded).toMatch(/response=/);
  });

  it("authentication_request sets 401 + WWW-Authenticate Digest header", () => {
    const c = makeDigestCtrl();
    digestAuthenticationRequest(c, "SuperSecret", null);
    expect(c.status).toBe(401);
    expect(c.headers["WWW-Authenticate"]).toMatch(/^Digest realm="SuperSecret"/);
    expect(c.responseBody).toBe("HTTP Digest: Access denied.\n");
  });

  it("authentication_request uses provided message", () => {
    const c = makeDigestCtrl();
    digestAuthenticationRequest(c, "SuperSecret", "Authentication Failed");
    expect(c.responseBody).toBe("Authentication Failed");
  });

  it("validate_digest_response should fail with nil returning password_procedure", () => {
    const secretKey = secretToken(makeDigestRequest());
    const nonceVal = nonce(secretKey);
    const opaqueVal = opaque(secretKey);
    const creds = {
      username: "lifo",
      realm: "SuperSecret",
      nonce: nonceVal,
      nc: "00000001",
      cnonce: "0a4f113b",
      qop: "auth",
      uri: "/",
      opaque: opaqueVal,
    };
    const response = expectedResponse("GET", "/", creds, "world", false);
    const header = `Digest username="lifo", realm="SuperSecret", nonce="${nonceVal}", uri="/", nc=00000001, cnonce="0a4f113b", qop=auth, response="${response}", opaque="${opaqueVal}"`;
    const req = { ...makeDigestRequest(header) };
    expect(validateDigestResponse(req, "SuperSecret", () => null)).toBe(false);
  });
});

describe("HttpAuthentication::Digest::ControllerMethods", () => {
  it("requestHttpDigestAuthentication sets 401 + Digest WWW-Authenticate header", () => {
    const c = makeDigestCtrl();
    requestHttpDigestAuthentication.call(c, "SuperSecret", "Auth Failed");
    expect(c.status).toBe(401);
    expect(c.headers["WWW-Authenticate"]).toMatch(/^Digest realm="SuperSecret"/);
    expect(c.responseBody).toBe("Auth Failed");
  });
});
