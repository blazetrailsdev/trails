import { beforeEach, describe, it } from "vitest";
import { Assertion, assertMatch, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import {
  assertResponse,
  type AssertionResponseHost,
  type AssertionResponseLike,
} from "../testing/assertions/response.js";

interface FakeResponse extends AssertionResponseLike {
  status: number;
  location: string;
  body: string;
  getHeader: (key: string) => string | undefined;
}

function fakeResponse(
  status: number,
  opts: { location?: string; body?: string } = {},
): FakeResponse {
  const location = opts.location ?? "http://test.example.com/posts";
  const body = opts.body ?? "";
  return {
    status,
    isRedirection: status >= 300 && status <= 399,
    location,
    body,
    getHeader: (key) => (key.toLowerCase() === "location" ? location : undefined),
  };
}

describe("ResponseAssertionsTest", () => {
  let self: AssertionResponseHost & { assertResponse: typeof assertResponse };

  beforeEach(() => {
    self = { response: fakeResponse(200), request: undefined, assertResponse };
  });

  it("assert response predicate methods", async () => {
    for (const [sym, status] of [
      ["success", 200],
      ["missing", 404],
      ["redirect", 302],
      ["error", 500],
    ] as const) {
      self.response = fakeResponse(status);
      self.assertResponse(sym);

      await assertRaises([Assertion], {}, () => {
        self.assertResponse("unauthorized");
      });
    }
  });

  it("assert response integer", async () => {
    self.response = fakeResponse(400);
    self.assertResponse(400);

    await assertRaises([Assertion], {}, () => {
      self.assertResponse("unauthorized");
    });

    await assertRaises([Assertion], {}, () => {
      self.assertResponse(500);
    });
  });

  it("assert response sym status", async () => {
    self.response = fakeResponse(401);
    self.assertResponse("unauthorized");

    await assertRaises([Assertion], {}, () => {
      self.assertResponse("ok");
    });

    await assertRaises([Assertion], {}, () => {
      self.assertResponse("success");
    });
  });

  it("assert response sym typo", async () => {
    self.response = fakeResponse(200);

    await assertRaises([ArgumentError], {}, () => {
      self.assertResponse("succezz");
    });
  });

  it("error message shows 404 when 404 asserted for success", async () => {
    self.response = fakeResponse(404);

    const error = await assertRaises([Assertion], {}, () => self.assertResponse("success"));
    const expected = "Expected response to be a <2XX: success>, but was a <404: Not Found>";
    assertMatch(expected, error.message);
  });

  it("error message shows 404 when asserted for 200", async () => {
    self.response = fakeResponse(404);

    const error = await assertRaises([Assertion], {}, () => self.assertResponse(200));
    const expected = "Expected response to be a <200: OK>, but was a <404: Not Found>";
    assertMatch(expected, error.message);
  });

  it("error message shows 302 redirect when 302 asserted for success", async () => {
    self.response = fakeResponse(302, { location: "http://test.host/posts/redirect/1" });

    const error = await assertRaises([Assertion], {}, () => self.assertResponse("success"));
    const expected =
      "Expected response to be a <2XX: success>, but was a <302: Found>" +
      " redirect to <http://test.host/posts/redirect/1>";
    assertMatch(expected, error.message);
  });

  it("error message shows 302 redirect when 302 asserted for 301", async () => {
    self.response = fakeResponse(302, { location: "http://test.host/posts/redirect/2" });

    const error = await assertRaises([Assertion], {}, () => self.assertResponse(301));
    const expected =
      "Expected response to be a <301: Moved Permanently>, but was a <302: Found>" +
      " redirect to <http://test.host/posts/redirect/2>";
    assertMatch(expected, error.message);
  });

  it("error message shows short response body", async () => {
    self.response = fakeResponse(400, { body: "not too long" });
    const error = await assertRaises([Assertion], {}, () => self.assertResponse(200));
    const expected =
      "Expected response to be a <200: OK>, but was a <400: Bad Request>" +
      "\nResponse body: not too long";
    assertMatch(expected, error.message);
  });

  it("error message does not show long response body", async () => {
    self.response = fakeResponse(400, { body: "not too long".repeat(50) });
    const error = await assertRaises([Assertion], {}, () => self.assertResponse(200));
    const expected = "Expected response to be a <200: OK>, but was a <400: Bad Request>";
    assertMatch(expected, error.message);
  });

  it("error message shows rescued exception", async () => {
    self.response = fakeResponse(500);

    const ex = new Error("example error");
    ex.name = "RuntimeError";
    self.request = { env: { "action_dispatch.exception": ex } };

    const error = await assertRaises([Assertion], {}, () => self.assertResponse(200));
    const expected =
      "Expected response to be a <200: OK>, but was a <500: Internal Server Error>\n\n" +
      "Exception while processing request: RuntimeError: example error\n";
    assertMatch(expected, error.message);
  });
});
