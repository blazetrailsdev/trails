import { describe, it, expect } from "vitest";
import type { Request } from "../../action-dispatch/http/request.js";
import { HttpAuthentication } from "../metal/http-authentication.js";

const { Token } = HttpAuthentication;

function mockAuthorizationRequest(authorization: string): Request {
  return { authorization } as Request;
}

function sampleRequest(token: string, options: Record<string, string> = { nonce: "def" }): Request {
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

describe("HttpTokenAuthenticationTest", () => {
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
});
