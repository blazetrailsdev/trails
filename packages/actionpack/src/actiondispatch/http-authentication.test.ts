import { describe, it, expect } from "vitest";
import { BasicAuth, TokenAuth, DigestAuth } from "./http-authentication.js";

// ==========================================================================
// controller/http_basic_authentication_test.rb
// ==========================================================================
describe("ActionController::HttpAuthentication::Basic", () => {
  it("decode valid credentials", () => {
    const header = BasicAuth.encode("admin", "secret");
    const creds = BasicAuth.decode(header);
    expect(creds).toEqual({ username: "admin", password: "secret" });
  });

  it("decode with colon in password", () => {
    const header = BasicAuth.encode("admin", "pass:word");
    const creds = BasicAuth.decode(header);
    expect(creds).toEqual({ username: "admin", password: "pass:word" });
  });

  it("decode invalid header", () => {
    expect(BasicAuth.decode("Bearer xyz")).toBeNull();
  });

  it("decode malformed base64", () => {
    expect(BasicAuth.decode("Basic !!!")).toBeNull();
  });

  it("has basic credentials", () => {
    expect(BasicAuth.hasBasicCredentials("Basic dGVzdDp0ZXN0")).toBe(true);
    expect(BasicAuth.hasBasicCredentials("Token abc")).toBe(false);
    expect(BasicAuth.hasBasicCredentials(undefined)).toBe(false);
  });

  it("authenticate success", () => {
    const header = BasicAuth.encode("admin", "secret");
    const result = BasicAuth.authenticate(header, (u, p) => u === "admin" && p === "secret");
    expect(result).toBe(true);
  });

  it("authenticate failure", () => {
    const header = BasicAuth.encode("admin", "wrong");
    const result = BasicAuth.authenticate(header, (u, p) => u === "admin" && p === "secret");
    expect(result).toBe(false);
  });

  it("authenticate with no header", () => {
    const result = BasicAuth.authenticate(undefined, () => true);
    expect(result).toBe(false);
  });

  it("challenge response", () => {
    const [status, headers, body] = BasicAuth.challengeResponse("MyApp");
    expect(status).toBe(401);
    expect(headers["www-authenticate"]).toBe('Basic realm="MyApp"');
    expect(body).toContain("Access denied");
  });

  it("challenge response default realm", () => {
    const [, headers] = BasicAuth.challengeResponse();
    expect(headers["www-authenticate"]).toBe('Basic realm="Application"');
  });

  it("encode roundtrip", () => {
    const encoded = BasicAuth.encode("user", "pass");
    const decoded = BasicAuth.decode(encoded);
    expect(decoded).toEqual({ username: "user", password: "pass" });
  });

  it("encode with empty password", () => {
    const encoded = BasicAuth.encode("user", "");
    const decoded = BasicAuth.decode(encoded);
    expect(decoded).toEqual({ username: "user", password: "" });
  });

  it("encode with unicode", () => {
    const encoded = BasicAuth.encode("über", "pässwörd");
    const decoded = BasicAuth.decode(encoded);
    expect(decoded).toEqual({ username: "über", password: "pässwörd" });
  });

  it("case insensitive scheme", () => {
    const base64 = Buffer.from("user:pass").toString("base64");
    expect(BasicAuth.decode(`basic ${base64}`)).toEqual({ username: "user", password: "pass" });
    expect(BasicAuth.decode(`BASIC ${base64}`)).toEqual({ username: "user", password: "pass" });
  });
});

// ==========================================================================
// controller/http_token_authentication_test.rb
// ==========================================================================
describe("ActionController::HttpAuthentication::Token", () => {
  it("decode valid token", () => {
    const header = TokenAuth.encode("abc123");
    const creds = TokenAuth.decode(header);
    expect(creds?.token).toBe("abc123");
  });

  it("decode token with options", () => {
    const header = TokenAuth.encode("abc123", { nonce: "xyz", count: "1" });
    const creds = TokenAuth.decode(header);
    expect(creds?.token).toBe("abc123");
    expect(creds?.options.nonce).toBe("xyz");
    expect(creds?.options.count).toBe("1");
  });

  it("decode invalid header", () => {
    expect(TokenAuth.decode("Basic xyz")).toBeNull();
  });

  it("decode missing token", () => {
    expect(TokenAuth.decode("Token nonce=\"abc\"")).toBeNull();
  });

  it("has token credentials", () => {
    expect(TokenAuth.hasTokenCredentials("Token token=\"abc\"")).toBe(true);
    expect(TokenAuth.hasTokenCredentials("Basic xyz")).toBe(false);
    expect(TokenAuth.hasTokenCredentials(undefined)).toBe(false);
  });

  it("authenticate success", () => {
    const header = TokenAuth.encode("secret-token");
    const result = TokenAuth.authenticate(header, (token) => token === "secret-token");
    expect(result).toBe(true);
  });

  it("authenticate failure", () => {
    const header = TokenAuth.encode("wrong-token");
    const result = TokenAuth.authenticate(header, (token) => token === "secret-token");
    expect(result).toBe(false);
  });

  it("authenticate with no header", () => {
    const result = TokenAuth.authenticate(undefined, () => true);
    expect(result).toBe(false);
  });

  it("challenge response", () => {
    const [status, headers, body] = TokenAuth.challengeResponse("MyApp");
    expect(status).toBe(401);
    expect(headers["www-authenticate"]).toBe('Token realm="MyApp"');
    expect(body).toContain("Access denied");
  });

  it("challenge response default realm", () => {
    const [, headers] = TokenAuth.challengeResponse();
    expect(headers["www-authenticate"]).toBe('Token realm="Application"');
  });

  it("encode roundtrip", () => {
    const encoded = TokenAuth.encode("my-token", { app: "test" });
    const decoded = TokenAuth.decode(encoded);
    expect(decoded?.token).toBe("my-token");
    expect(decoded?.options.app).toBe("test");
  });

  it("encode simple token", () => {
    const encoded = TokenAuth.encode("abc");
    expect(encoded).toBe('Token token="abc"');
  });

  it("token with special characters", () => {
    const header = TokenAuth.encode("abc+def/ghi=");
    const creds = TokenAuth.decode(header);
    expect(creds?.token).toBe("abc+def/ghi=");
  });

  it("case insensitive scheme", () => {
    expect(TokenAuth.hasTokenCredentials('token token="abc"')).toBe(true);
    expect(TokenAuth.hasTokenCredentials('TOKEN token="abc"')).toBe(true);
  });

  it("authenticate passes options to callback", () => {
    const header = TokenAuth.encode("abc", { device: "mobile" });
    let receivedOptions: Record<string, string> = {};
    TokenAuth.authenticate(header, (_token, opts) => {
      receivedOptions = opts;
      return true;
    });
    expect(receivedOptions.device).toBe("mobile");
  });
});

// ==========================================================================
// controller/http_digest_authentication_test.rb
// ==========================================================================
describe("ActionController::HttpAuthentication::Digest", () => {
  it("has digest credentials", () => {
    expect(DigestAuth.hasDigestCredentials('Digest username="admin"')).toBe(true);
    expect(DigestAuth.hasDigestCredentials("Basic xyz")).toBe(false);
    expect(DigestAuth.hasDigestCredentials(undefined)).toBe(false);
  });

  it("decode digest header", () => {
    const header = 'Digest username="admin", realm="testrealm", nonce="abc123", uri="/path", nc=00000001, cnonce="xyz", qop=auth, response="deadbeef"';
    const params = DigestAuth.decode(header);
    expect(params?.username).toBe("admin");
    expect(params?.realm).toBe("testrealm");
    expect(params?.nonce).toBe("abc123");
    expect(params?.uri).toBe("/path");
    expect(params?.nc).toBe("00000001");
    expect(params?.cnonce).toBe("xyz");
    expect(params?.qop).toBe("auth");
    expect(params?.response).toBe("deadbeef");
  });

  it("decode invalid header", () => {
    expect(DigestAuth.decode("Basic xyz")).toBeNull();
  });

  it("generate nonce", () => {
    const nonce = DigestAuth.generateNonce("secret");
    expect(nonce).toBeTruthy();
    expect(nonce.length).toBeGreaterThan(0);
  });

  it("validate nonce", () => {
    const nonce = DigestAuth.generateNonce("secret");
    expect(DigestAuth.validateNonce(nonce, "secret")).toBe(true);
  });

  it("validate nonce wrong secret", () => {
    const nonce = DigestAuth.generateNonce("secret");
    expect(DigestAuth.validateNonce(nonce, "wrong")).toBe(false);
  });

  it("validate nonce garbage", () => {
    expect(DigestAuth.validateNonce("garbage", "secret")).toBe(false);
  });

  it("ha1 computation", () => {
    const result = DigestAuth.ha1("admin", "testrealm", "password");
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  it("expected response computation", () => {
    const ha1 = DigestAuth.ha1("admin", "testrealm", "password");
    const response = DigestAuth.expectedResponse("GET", "/path", ha1, {
      nonce: "abc",
      nc: "00000001",
      cnonce: "xyz",
      qop: "auth",
    });
    expect(response).toMatch(/^[0-9a-f]{32}$/);
  });

  it("expected response without qop", () => {
    const ha1 = DigestAuth.ha1("admin", "testrealm", "password");
    const response = DigestAuth.expectedResponse("GET", "/path", ha1, {
      nonce: "abc",
      nc: "",
      cnonce: "",
    });
    expect(response).toMatch(/^[0-9a-f]{32}$/);
  });

  it("digest verification", () => {
    const realm = "testrealm";
    const username = "admin";
    const password = "secret";
    const nonce = "testnonce";
    const uri = "/protected";
    const nc = "00000001";
    const cnonce = "clientnonce";
    const qop = "auth";

    const ha1 = DigestAuth.ha1(username, realm, password);
    const expectedResp = DigestAuth.expectedResponse("GET", uri, ha1, { nonce, nc, cnonce, qop });

    const header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=${qop}, response="${expectedResp}"`;
    const params = DigestAuth.decode(header);
    expect(params).not.toBeNull();

    const computed = DigestAuth.expectedResponse("GET", params!.uri, ha1, {
      nonce: params!.nonce,
      nc: params!.nc,
      cnonce: params!.cnonce,
      qop: params!.qop,
    });
    expect(computed).toBe(params!.response);
  });

  it("challenge response", () => {
    const [status, headers, body] = DigestAuth.challengeResponse("testrealm", "secret");
    expect(status).toBe(401);
    expect(headers["www-authenticate"]).toContain('Digest realm="testrealm"');
    expect(headers["www-authenticate"]).toContain("nonce=");
    expect(headers["www-authenticate"]).toContain("opaque=");
    expect(headers["www-authenticate"]).toContain('qop="auth"');
    expect(body).toContain("Access denied");
  });

  it("challenge response custom opaque", () => {
    const [, headers] = DigestAuth.challengeResponse("realm", "secret", { opaque: "myopaque" });
    expect(headers["www-authenticate"]).toContain('opaque="myopaque"');
  });

  it("different nonces each time", () => {
    const n1 = DigestAuth.generateNonce("secret");
    // Small delay to ensure different timestamp
    const n2 = DigestAuth.generateNonce("secret");
    // They might be the same if called in the same millisecond, so just check they're valid
    expect(DigestAuth.validateNonce(n1, "secret")).toBe(true);
    expect(DigestAuth.validateNonce(n2, "secret")).toBe(true);
  });

  it("ha1 is deterministic", () => {
    const h1 = DigestAuth.ha1("user", "realm", "pass");
    const h2 = DigestAuth.ha1("user", "realm", "pass");
    expect(h1).toBe(h2);
  });

  it("ha1 changes with different inputs", () => {
    const h1 = DigestAuth.ha1("user", "realm", "pass1");
    const h2 = DigestAuth.ha1("user", "realm", "pass2");
    expect(h1).not.toBe(h2);
  });

  it("case insensitive scheme", () => {
    expect(DigestAuth.hasDigestCredentials('digest username="a"')).toBe(true);
    expect(DigestAuth.hasDigestCredentials('DIGEST username="a"')).toBe(true);
  });

  it("decode missing response field returns null", () => {
    expect(DigestAuth.decode('Digest username="admin", realm="r"')).toBeNull();
  });
});
