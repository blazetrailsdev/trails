import { describe, it, expect } from "vitest";
import {
  encodeCredentials,
  authenticateOrRequestWithHttpBasic,
  authenticateWithHttpBasic,
  requestHttpBasicAuthentication,
  httpBasicAuthenticateWith,
  type BasicControllerHost,
} from "../metal/http-authentication.js";

// Mirrors the minimal controller setup from Rails'
// HttpBasicAuthenticationTest (test/controller/http_basic_authentication_test.rb).
function makeController(authHeader?: string): BasicControllerHost {
  return {
    request: { authorization: authHeader },
    headers: {} as Record<string, string>,
    status: 200,
    responseBody: null,
  };
}

describe("HttpBasicAuthenticationTest", () => {
  it("successful authentication with ", () => {
    const c = makeController(encodeCredentials("lifo", "world"));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      null,
      (user, pass) => user === "lifo" && pass === "world",
    );
    expect(result).toBe(true);
    expect(c.status).toBe(200);
  });

  it("successful authentication with  and long credentials", () => {
    const longCred = "1234567890123456789012345678901234567890";
    const c = makeController(encodeCredentials(longCred, longCred));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      null,
      (user, pass) => user === longCred && pass === longCred,
    );
    expect(result).toBe(true);
  });

  it("unsuccessful authentication with ", () => {
    const c = makeController(encodeCredentials("h4x0r", "world"));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "Application",
      null,
      (user, pass) => user === "lifo" && pass === "world",
    );
    expect(result).toBe(false);
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("HTTP Basic: Access denied.\n");
  });

  it("unsuccessful authentication with  and long credentials", () => {
    const longUser = "h4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0r";
    const longPass = "worldworldworldworldworldworldworldworld";
    const longCred = "1234567890123456789012345678901234567890";
    const c = makeController(encodeCredentials(longUser, longPass));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "Application",
      null,
      (user, pass) => user === longCred && pass === longCred,
    );
    expect(result).toBe(false);
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("HTTP Basic: Access denied.\n");
  });

  it("unsuccessful authentication with  and no credentials", () => {
    const c = makeController();
    const result = authenticateOrRequestWithHttpBasic.call(c, "Application", null, () => true);
    expect(result).toBe(false);
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("HTTP Basic: Access denied.\n");
  });

  it("encode credentials has no newline", () => {
    const username = "laskjdfhalksdjfhalkjdsfhalksdjfhklsdjhalksdjfhalksdjfhlakdsjfh";
    const password = "kjfhueyt9485osdfasdkljfh4lkjhakldjfhalkdsjf";
    const result = encodeCredentials(username, password);
    expect(result).not.toMatch(/\n/);
  });

  it("successful authentication with uppercase authorization scheme", () => {
    const creds = encodeCredentials("lifo", "world").replace(/^Basic /, "BASIC ");
    const c = makeController(creds);
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      null,
      (user, pass) => user === "lifo" && pass === "world",
    );
    expect(result).toBe(true);
  });

  it("authentication request without credential", () => {
    // Rails: GET /display with no auth → request_http_basic_authentication("SuperSecret", "Authentication Failed\n")
    const c = makeController();
    requestHttpBasicAuthentication.call(c, "SuperSecret", "Authentication Failed\n");
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("Authentication Failed\n");
    expect(c.headers["WWW-Authenticate"]).toBe('Basic realm="SuperSecret"');
  });

  it("authentication request with invalid credential", () => {
    // Rails: encode_credentials("pretty", "foo") — valid base64, wrong user/pass
    const c = makeController(encodeCredentials("pretty", "foo"));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      "Authentication Failed\n",
      (user, pass) => user === "pretty" && pass === "please",
    );
    expect(result).toBe(false);
    expect(c.status).toBe(401);
    expect(c.responseBody).toBe("Authentication Failed\n");
    expect(c.headers["WWW-Authenticate"]).toBe('Basic realm="SuperSecret"');
  });

  it("authentication request with a missing password", () => {
    // Rails: Base64("David") — no colon, so password is absent
    const noColon = `Basic ${Buffer.from("David").toString("base64")}`;
    const c = makeController(noColon);
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "Application",
      null,
      (user, pass) => user === "David" && pass === "Goliath",
    );
    expect(result).toBe(false);
    expect(c.status).toBe(401);
  });

  it("authentication request with no required password", () => {
    // Rails: Base64("George") — no colon, password is "" (absent)
    const noColon = `Basic ${Buffer.from("George").toString("base64")}`;
    const c = makeController(noColon);
    // Mirrors DummyController#no_password: authenticate_with_http_basic { |u, p| [u, p] }
    const result = authenticateWithHttpBasic.call(c, (user, pass) => [user, pass]);
    expect(result).toEqual(["George", ""]);
    expect(c.status).toBe(200);
  });

  it("authentication request with valid credential", () => {
    const c = makeController(encodeCredentials("lifo", "world"));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      null,
      (user, pass) => user === "lifo" && pass === "world",
    );
    expect(result).toBe(true);
    expect(c.status).toBe(200);
  });

  it("authentication request with valid credential special chars", () => {
    const specialUser = "login!@#$%^&*()_+{}[];\"',./<>?`~ \n\r\t";
    const specialPass = "pwd:!@#$%^&*()_+{}[];\"',./<>?`~ \n\r\t";
    const c = makeController(encodeCredentials(specialUser, specialPass));
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "SuperSecret",
      null,
      (user, pass) => user === specialUser && pass === specialPass,
    );
    expect(result).toBe(true);
    expect(c.status).toBe(200);
  });

  it("authenticate with class method", () => {
    const beforeActionCalls: Array<(c: BasicControllerHost) => unknown> = [];
    const host = {
      beforeAction(cb: (c: BasicControllerHost) => unknown) {
        beforeActionCalls.push(cb);
      },
    };
    httpBasicAuthenticateWith.call(host, { name: "David", password: "Goliath" });
    expect(beforeActionCalls).toHaveLength(1);
    const okCtrl = makeController(encodeCredentials("David", "Goliath"));
    expect(beforeActionCalls[0](okCtrl)).toBe(true);
    const badCtrl = makeController(encodeCredentials("David", "WRONG!"));
    expect(beforeActionCalls[0](badCtrl)).toBe(false);
  });

  it("authentication request with wrong scheme", () => {
    // Rails: "Bearer " + encode_credentials("David","Goliath").split(" ",2)[1]
    const basicCreds = encodeCredentials("David", "Goliath");
    const token = basicCreds.split(" ")[1];
    const c = makeController(`Bearer ${token}`);
    const result = authenticateOrRequestWithHttpBasic.call(
      c,
      "Application",
      null,
      (user, pass) => user === "David" && pass === "Goliath",
    );
    expect(result).toBe(false);
    expect(c.status).toBe(401);
  });
});
