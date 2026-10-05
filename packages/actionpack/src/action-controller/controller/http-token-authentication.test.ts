import { beforeEach, describe, it, expect } from "vitest";
import type { Request } from "../../action-dispatch/http/request.js";
import { Base } from "../base.js";
import { HttpAuthentication } from "../metal/http-authentication.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

const { Token } = HttpAuthentication;

class DummyController extends Base {
  declare loggedIn: boolean;

  static {
    this.beforeAction("authenticate", { only: "index" });
    this.beforeAction("authenticateWithRequest", { only: "display" });
    this.beforeAction("authenticateLongCredentials", { only: "show" });
  }

  async index(): Promise<void> {
    await this.render({ plain: "Hello Secret" });
  }

  async display(): Promise<void> {
    await this.render({ plain: "Definitely Maybe" });
  }

  async show(): Promise<void> {
    await this.render({ plain: "Only for loooooong credentials" });
  }

  private authenticate(): unknown {
    return this.authenticateOrRequestWithHttpToken(undefined, undefined, (token, _) => {
      return token === "lifo";
    });
  }

  private authenticateWithRequest(): unknown {
    if (
      this.authenticateWithHttpToken(
        (token, options) => token === '"quote" pretty' && options.get("algorithm") === "test",
      )
    ) {
      return (this.loggedIn = true);
    } else {
      return this.requestHttpTokenAuthentication("SuperSecret", "Authentication Failed\n");
    }
  }

  private authenticateLongCredentials(): unknown {
    return this.authenticateOrRequestWithHttpToken(undefined, undefined, (token, options) => {
      return (
        token === "1234567890123456789012345678901234567890" && options.get("algorithm") === "test"
      );
    });
  }
}

const AUTH_HEADERS = [
  "HTTP_AUTHORIZATION",
  "X-HTTP_AUTHORIZATION",
  "X_HTTP_AUTHORIZATION",
  "REDIRECT_X_HTTP_AUTHORIZATION",
];

const Timeout = {
  async timeout(sec: number, block: () => Promise<void>): Promise<void> {
    const started = performance.now();
    await block();
    if (performance.now() - started > sec * 1000) throw new Error("execution expired");
  },
};

describe("HttpTokenAuthenticationTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new DummyController();
    await tc.beforeSetup();
  });

  AUTH_HEADERS.forEach((header) => {
    it(`successful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = encodeCredentials("lifo");
      await tc.get("index");

      assertResponse("success");
      expect(tc.response.body, `Authentication failed for request header ${header}`).toBe(
        "Hello Secret",
      );
    });
    it(`successful authentication with ${header.toLowerCase()} and long credentials`, async () => {
      tc.request.env[header] = encodeCredentials("1234567890123456789012345678901234567890", {
        algorithm: "test",
      });
      await tc.get("show");

      assertResponse("success");
      expect(
        tc.response.body,
        `Authentication failed for request header ${header} and long credentials`,
      ).toBe("Only for loooooong credentials");
    });
  });

  AUTH_HEADERS.forEach((header) => {
    it(`unsuccessful authentication with ${header.toLowerCase()}`, async () => {
      tc.request.env[header] = encodeCredentials("h4x0r");
      await tc.get("index");

      assertResponse("unauthorized");
      expect(tc.response.body, `Authentication didn't fail for request header ${header}`).toBe(
        "HTTP Token: Access denied.\n",
      );
    });
    it(`unsuccessful authentication with ${header.toLowerCase()} and long credentials`, async () => {
      tc.request.env[header] = encodeCredentials("h4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0rh4x0r");
      await tc.get("show");

      assertResponse("unauthorized");
      expect(
        tc.response.body,
        `Authentication didn't fail for request header ${header} and long credentials`,
      ).toBe("HTTP Token: Access denied.\n");
    });
  });

  it("authentication request with badly formatted header", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = 'Token token$"lifo"';
    await tc.get("index");

    assertResponse("unauthorized");
    expect(tc.response.body, "Authentication header was not properly parsed").toBe(
      "HTTP Token: Access denied.\n",
    );
  });

  it("authentication request with evil header", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = "Token ." + " ".repeat(1024 * 80 - 8) + ".";
    await Timeout.timeout(1, async () => {
      await tc.get("index");
    });

    assertResponse("unauthorized");
    expect(tc.response.body, "Authentication header was not properly parsed").toBe(
      "HTTP Token: Access denied.\n",
    );
  });

  it("successful authentication request with Bearer instead of Token", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = "Bearer lifo";
    await tc.get("index");

    assertResponse("success");
  });

  it("authentication request with tab in header", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = 'Token\ttoken="lifo"';
    await tc.get("index");

    assertResponse("success");
    expect(tc.response.body).toBe("Hello Secret");
  });

  it("authentication request without credential", async () => {
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed\n");
    expect(tc.response.headers.get("WWW-Authenticate")).toBe('Token realm="SuperSecret"');
  });

  it("authentication request with invalid credential", async () => {
    tc.request.env["HTTP_AUTHORIZATION"] = encodeCredentials('"quote" pretty');
    await tc.get("display");

    assertResponse("unauthorized");
    expect(tc.response.body).toBe("Authentication Failed\n");
    expect(tc.response.headers.get("WWW-Authenticate")).toBe('Token realm="SuperSecret"');
  });

  it("token_and_options returns correct token", () => {
    const token = "rcHu+HzSFw89Ypyhn/896A==";
    const actual = Token.tokenAndOptions(sampleRequest(token))![0];
    const expected = token;
    expect(actual).toBe(expected);
  });

  it("token_and_options returns correct token with value after the equal sign", () => {
    const token = "rcHu+=HzSFw89Ypyhn/896A==f34";
    const actual = Token.tokenAndOptions(sampleRequest(token))![0];
    const expected = token;
    expect(actual).toBe(expected);
  });

  it("token_and_options returns correct token with slashes", () => {
    const token = 'rcHu+\\\\"/896A';
    const actual = Token.tokenAndOptions(sampleRequest(token))![0];
    const expected = token;
    expect(actual).toBe(expected);
  });

  it("token_and_options returns correct token with quotes", () => {
    const token = '\\"quote\\" pretty';
    const actual = Token.tokenAndOptions(sampleRequest(token))![0];
    const expected = token;
    expect(actual).toBe(expected);
  });

  it("token_and_options returns empty string with empty token", () => {
    const token = "";
    const actual = Token.tokenAndOptions(sampleRequest(token))![0];
    const expected = token;
    expect(actual).toBe(expected);
  });

  it("token_and_options returns correct token with nonce option", () => {
    const token = "rcHu+HzSFw89Ypyhn/896A=";
    const nonceHash = { nonce: "123abc" };
    const actual = Token.tokenAndOptions(sampleRequest(token, nonceHash))!;
    const expectedToken = token;
    const expectedNonce = { nonce: nonceHash.nonce };
    expect(actual[0]).toBe(expectedToken);
    expect(Object.fromEntries(actual[1].toHash())).toEqual(expectedNonce);
  });

  it("token_and_options returns nil with no value after the equal sign", () => {
    const actual = Token.tokenAndOptions(malformedRequest())![0];
    expect(actual).toBeUndefined();
  });

  it("token_and_options ignores empty elements in header value", () => {
    const token = "foo,,bar,  ,   , baz=qux";
    const expectedToken = "foo";
    const expectedOptions = { bar: undefined, baz: "qux" };

    const actual = Token.tokenAndOptions(sampleRequest(token, {}))!;
    expect(actual[0]).toBe(expectedToken);
    expect(Object.fromEntries(actual[1].toHash())).toEqual(expectedOptions);
  });

  it("raw_params returns a tuple of two key value pair strings", () => {
    const auth = String(sampleRequest("rcHu+HzSFw89Ypyhn/896A=").authorization);
    const actual = Token.rawParams(auth);
    const expected = ['token="rcHu+HzSFw89Ypyhn/896A="', 'nonce="def"'];
    expect(actual).toEqual(expected);
  });

  it("raw_params returns a tuple of key value pair strings when auth does not contain a token key", () => {
    const auth = String(sampleRequestWithoutTokenKey("rcHu+HzSFw89Ypyhn/896A=").authorization);
    const actual = Token.rawParams(auth);
    const expected = ["token=rcHu+HzSFw89Ypyhn/896A="];
    expect(actual).toEqual(expected);
  });

  it("raw_params returns a tuple of key strings when auth does not contain a token key and value", () => {
    const auth = String(sampleRequestWithoutTokenKey(null).authorization);
    const actual = Token.rawParams(auth);
    const expected = ["token="];
    expect(actual).toEqual(expected);
  });

  it("token_and_options returns right token when token key is not specified in header", () => {
    const token = "rcHu+HzSFw89Ypyhn/896A=";

    const actual = Token.tokenAndOptions(sampleRequestWithoutTokenKey(token))![0];

    const expected = token;
    expect(actual).toBe(expected);
  });

  function sampleRequest(
    token: string,
    options: Record<string, string> = { nonce: "def" },
  ): Request {
    const authorization = Object.entries(options)
      .reduce((arr, [k, v]) => [...arr, `${k}="${v}"`], [`Token token="${token}"`])
      .join(", ");
    return mockAuthorizationRequest(authorization);
  }

  function malformedRequest(): Request {
    return mockAuthorizationRequest("Token token=");
  }

  function sampleRequestWithoutTokenKey(token: string | null): Request {
    return mockAuthorizationRequest(`Token ${token ?? ""}`);
  }

  function mockAuthorizationRequest(authorization: string): Request {
    return { authorization } as Request;
  }

  function encodeCredentials(token: string, options: Record<string, unknown> = {}): string {
    return Token.encodeCredentials(token, options);
  }
});
