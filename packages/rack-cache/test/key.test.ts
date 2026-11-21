import { describe, it, expect } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { Key } from "../lib/key.js";
import { Request } from "../lib/request.js";

describe("Rack::Cache::Key", () => {
  function mockRequest(uri: string, opts?: Record<string, unknown>): Request {
    const env = MockRequest.envFor(uri, opts ?? {});
    return new Request(env);
  }

  function newKey(request: Request): string {
    return Key.call(request);
  }

  function withQueryStringIgnore(proc: (k: string, v?: string) => unknown, block: () => void) {
    try {
      Key.queryStringIgnore = proc;
      block();
    } finally {
      Key.queryStringIgnore = null;
    }
  }

  it("sorts params", () => {
    const request = mockRequest("/test?z=last&a=first");
    expect(newKey(request)).toContain("a=first&z=last");
  });

  it("handles badly encoded params", () => {
    const request = mockRequest("/test?%D0%BA=%D1");
    expect(newKey(request)).toContain("%D0%BA=%D1");
  });

  it("doesn't confuse encoded equals sign with query string separator", () => {
    const request = mockRequest("/test?weird%3Dkey=whatever");
    expect(newKey(request)).toContain("weird%3Dkey=whatever");
  });

  it("includes the scheme", () => {
    const request = mockRequest("/test", {
      "rack.url_scheme": "https",
      HTTP_HOST: "www2.example.org",
    });
    expect(newKey(request)).toContain("https://");
  });

  it("includes host", () => {
    const request = mockRequest("/test", { HTTP_HOST: "www2.example.org" });
    expect(newKey(request)).toContain("www2.example.org");
  });

  it("includes path", () => {
    const request = mockRequest("/test");
    expect(newKey(request)).toContain("/test");
  });

  it("does not include question mark if there is no query string", () => {
    const request = mockRequest("/test");
    expect(newKey(request)).not.toContain("?");
  });

  it("sorts the query string by key/value after decoding", () => {
    const request = mockRequest("/test?x=q&a=b&%78=c");
    expect(newKey(request)).toMatch(/\?a=b&x=c&x=q$/);
  });

  it("is in order of scheme, host, path, params", () => {
    const request = mockRequest("/test?x=y", { HTTP_HOST: "www2.example.org" });
    expect(newKey(request)).toBe("http://www2.example.org/test?x=y");
  });

  it("ignores params based on configuration", () => {
    withQueryStringIgnore(
      (k, _v) => k === "a",
      () => {
        const request = mockRequest("/test?a=first&z=last");
        expect(newKey(request)).not.toContain("a=first");
        expect(newKey(request)).toContain("z=last");
      },
    );
  });

  it("does not include query when all params are ignored", () => {
    withQueryStringIgnore(
      (k, _v) => k === "a",
      () => {
        const request = mockRequest("/test?a=a");
        expect(newKey(request)).not.toContain("?");
      },
    );
  });
});
