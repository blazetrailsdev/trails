// Mirrors Rails actionpack/test/assertions/response_assertions_test.rb
import { describe, expect, it } from "vitest";
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
    location,
    body,
    getHeader: (key) => (key.toLowerCase() === "location" ? location : undefined),
  };
}

function host(
  response: FakeResponse,
  request?: AssertionResponseHost["request"],
): AssertionResponseHost {
  return { response, request };
}

describe("ResponseAssertionsTest", () => {
  it("assert response predicate methods", () => {
    expect(() => assertResponse.call(host(fakeResponse(200)), "success")).not.toThrow();
    expect(() => assertResponse.call(host(fakeResponse(200)), "unauthorized")).toThrow();

    expect(() => assertResponse.call(host(fakeResponse(404)), "missing")).not.toThrow();
    expect(() => assertResponse.call(host(fakeResponse(404)), "unauthorized")).toThrow();

    expect(() => assertResponse.call(host(fakeResponse(302)), "redirect")).not.toThrow();
    expect(() => assertResponse.call(host(fakeResponse(302)), "unauthorized")).toThrow();

    expect(() => assertResponse.call(host(fakeResponse(500)), "error")).not.toThrow();
    expect(() => assertResponse.call(host(fakeResponse(500)), "unauthorized")).toThrow();
  });

  it("assert response integer", () => {
    const h = host(fakeResponse(400));
    expect(() => assertResponse.call(h, 400)).not.toThrow();
    expect(() => assertResponse.call(h, "unauthorized")).toThrow();
    expect(() => assertResponse.call(h, 500)).toThrow();
  });

  it("assert response sym status", () => {
    const h = host(fakeResponse(401));
    expect(() => assertResponse.call(h, "unauthorized")).not.toThrow();
    expect(() => assertResponse.call(h, "ok")).toThrow();
    expect(() => assertResponse.call(h, "success")).toThrow();
  });

  it("assert response sym typo", () => {
    const h = host(fakeResponse(200));
    expect(() => assertResponse.call(h, "succezz")).toThrow(/Invalid response name/);
  });

  it("error message shows 404 when 404 asserted for success", () => {
    const h = host(fakeResponse(404));
    expect(() => assertResponse.call(h, "success")).toThrow(
      "Expected response to be a <2XX: success>, but was a <404: Not Found>",
    );
  });

  it("error message shows 404 when asserted for 200", () => {
    const h = host(fakeResponse(404));
    expect(() => assertResponse.call(h, 200)).toThrow(
      "Expected response to be a <200: OK>, but was a <404: Not Found>",
    );
  });

  it("error message shows 302 redirect when 302 asserted for success", () => {
    const h = host(fakeResponse(302, { location: "http://test.host/posts/redirect/1" }));
    expect(() => assertResponse.call(h, "success")).toThrow(
      "Expected response to be a <2XX: success>, but was a <302: Found> redirect to <http://test.host/posts/redirect/1>",
    );
  });

  it("error message shows 302 redirect when 302 asserted for 301", () => {
    const h = host(fakeResponse(302, { location: "http://test.host/posts/redirect/2" }));
    expect(() => assertResponse.call(h, 301)).toThrow(
      "Expected response to be a <301: Moved Permanently>, but was a <302: Found> redirect to <http://test.host/posts/redirect/2>",
    );
  });

  it("error message shows short response body", () => {
    const h = host(fakeResponse(400, { body: "not too long" }));
    expect(() => assertResponse.call(h, 200)).toThrow(
      "Expected response to be a <200: OK>, but was a <400: Bad Request>\nResponse body: not too long",
    );
  });

  it("error message does not show long response body", () => {
    const h = host(fakeResponse(400, { body: "not too long".repeat(50) }));
    try {
      assertResponse.call(h, 200);
      throw new Error("should not reach");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("Expected response to be a <200: OK>, but was a <400: Bad Request>");
      expect(msg).not.toContain("Response body:");
    }
  });

  it("error message shows rescued exception", () => {
    const ex = new Error("example error");
    ex.name = "RuntimeError";
    const h = host(fakeResponse(500), { env: { "action_dispatch.exception": ex } });
    expect(() => assertResponse.call(h, 200)).toThrow(
      "Expected response to be a <200: OK>, but was a <500: Internal Server Error>\n\nException while processing request: RuntimeError: example error\n",
    );
  });
});
