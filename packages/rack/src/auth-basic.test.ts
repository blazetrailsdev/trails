import { it, expect, beforeEach } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { pack, regexpEscape } from "@blazetrails/ruby-compat";
import { Basic } from "./auth/basic.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import type { MockResponse } from "./mock-response.js";

function realm() {
  return "WallysWorld";
}

function unprotectedApp() {
  return new Lint((env: Record<string, any>) => [
    200,
    { "content-type": "text/plain" },
    [`Hi ${env["REMOTE_USER"]}`],
  ]);
}

function protectedApp() {
  const app = new Basic(unprotectedApp(), undefined, (username: string) => "Boss" === username);
  app.realm = realm();
  return app;
}

let request: MockRequest;

beforeEach(() => {
  request = new MockRequest(protectedApp());
});

async function requestWithBasicAuth(
  username: string,
  password: string,
  block: (response: MockResponse) => void,
) {
  await requestWith(
    { HTTP_AUTHORIZATION: "Basic " + (pack([`${username}:${password}`], "m*") as string) },
    block,
  );
}

async function requestWith(headers: Record<string, any>, block: (response: MockResponse) => void) {
  block(await request.get("/", headers));
}

function assertBasicAuthChallenge(response: MockResponse) {
  expect(response.isClientError).toBeTruthy();
  expect(response.status).toBe(401);
  expect(Object.keys(response.headers)).toContain("www-authenticate");
  expect(response.headers["www-authenticate"]).toMatch(
    new RegExp(`Basic realm="${regexpEscape(realm())}"`),
  );
  expect(response.body).toBeEmpty();
}

it("challenge correctly when no credentials are specified", async () => {
  await requestWith({}, (response) => {
    assertBasicAuthChallenge(response);
  });
});

it("rechallenge if incorrect credentials are specified", async () => {
  await requestWithBasicAuth("joe", "password", (response) => {
    assertBasicAuthChallenge(response);
  });
});

it("return application output if correct credentials are specified", async () => {
  await requestWithBasicAuth("Boss", "password", (response) => {
    expect(response.status).toBe(200);
    expect(String(response.body)).toBe("Hi Boss");
  });
});

it("return 400 Bad Request if different auth scheme used", async () => {
  await requestWith({ HTTP_AUTHORIZATION: "Digest params" }, (response) => {
    expect(response.isClientError).toBeTruthy();
    expect(response.status).toBe(400);
    expect(Object.keys(response.headers)).not.toContain("www-authenticate");
  });
});

it("return 400 Bad Request for a malformed authorization header", async () => {
  await requestWith({ HTTP_AUTHORIZATION: "" }, (response) => {
    expect(response.isClientError).toBeTruthy();
    expect(response.status).toBe(400);
    expect(Object.keys(response.headers)).not.toContain("www-authenticate");
  });
});

it("return 401 Bad Request for a nil authorization header", async () => {
  await requestWith({ HTTP_AUTHORIZATION: null }, (response) => {
    expect(response.isClientError).toBeTruthy();
    expect(response.status).toBe(401);
  });
});

it("return 400 Bad Request for a authorization header with only username", async () => {
  const auth = "Basic " + (pack(["foo"], "m*") as string);
  await requestWith({ HTTP_AUTHORIZATION: auth }, (response) => {
    expect(response.isClientError).toBeTruthy();
    expect(response.status).toBe(400);
    expect(Object.keys(response.headers)).not.toContain("www-authenticate");
  });
});

it("takes realm as optional constructor arg", () => {
  const app = new Basic(unprotectedApp(), realm(), () => true);
  expect(realm()).toBe(app.realm);
});
