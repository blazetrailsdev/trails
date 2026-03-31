import { describe, it, expect } from "vitest";
import { Headers } from "./header.js";

function makeHeaders(hash: Record<string, unknown>): Headers {
  return new Headers(hash);
}

// ==========================================================================
// dispatch/header_test.rb
// ==========================================================================
describe("HeaderTest", () => {
  function setup() {
    return makeHeaders({
      CONTENT_TYPE: "text/plain",
      HTTP_REFERER: "/some/page",
    });
  }

  it("#new does not normalize the data", () => {
    const headers = makeHeaders({
      "Content-Type": "application/json",
      HTTP_REFERER: "/some/page",
      Host: "http://test.com",
    });
    expect(headers.env).toEqual({
      "Content-Type": "application/json",
      HTTP_REFERER: "/some/page",
      Host: "http://test.com",
    });
  });

  it("#env returns the headers as env variables", () => {
    const headers = setup();
    expect(headers.env).toEqual({
      CONTENT_TYPE: "text/plain",
      HTTP_REFERER: "/some/page",
    });
  });

  it("#each iterates through the env variables", () => {
    const headers = setup();
    const pairs: [string, unknown][] = [];
    headers.each((pair) => pairs.push(pair));
    expect(pairs).toEqual([
      ["CONTENT_TYPE", "text/plain"],
      ["HTTP_REFERER", "/some/page"],
    ]);
  });

  it("set new headers", () => {
    const headers = setup();
    headers.set("Host", "127.0.0.1");
    expect(headers.get("Host")).toBe("127.0.0.1");
    expect(headers.get("HTTP_HOST")).toBe("127.0.0.1");
  });

  it("add to multivalued headers", () => {
    const headers = setup();
    headers.add("Foo", "1");
    expect(headers.get("Foo")).toBe("1");

    headers.add("Foo", null);
    expect(headers.get("Foo")).toBe("1");

    headers.add("Foo", 1);
    expect(headers.get("Foo")).toBe("1,1");

    headers.add("fOo", 2);
    expect(headers.get("foO")).toBe("1,1,2");
  });

  it("headers can contain numbers", () => {
    const headers = setup();
    headers.set("Content-MD5", "Q2hlY2sgSW50ZWdyaXR5IQ==");
    expect(headers.get("Content-MD5")).toBe("Q2hlY2sgSW50ZWdyaXR5IQ==");
    expect(headers.get("HTTP_CONTENT_MD5")).toBe("Q2hlY2sgSW50ZWdyaXR5IQ==");
  });

  it("set new env variables", () => {
    const headers = setup();
    headers.set("HTTP_HOST", "127.0.0.1");
    expect(headers.get("Host")).toBe("127.0.0.1");
    expect(headers.get("HTTP_HOST")).toBe("127.0.0.1");
  });

  it("key?", () => {
    const headers = setup();
    expect(headers.has("CONTENT_TYPE")).toBe(true);
    expect(headers.has("Content-Type")).toBe(true);
  });

  it("fetch with block", () => {
    const headers = setup();
    expect(headers.fetch("notthere", () => "omg")).toBe("omg");
  });

  it("accessing http header", () => {
    const headers = setup();
    expect(headers.get("Referer")).toBe("/some/page");
    expect(headers.get("referer")).toBe("/some/page");
    expect(headers.get("HTTP_REFERER")).toBe("/some/page");
  });

  it("accessing special header", () => {
    const headers = setup();
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("CONTENT_TYPE")).toBe("text/plain");
  });

  it("fetch", () => {
    const headers = setup();
    expect(headers.fetch("content-type", null)).toBe("text/plain");
    expect(headers.fetch("not-found", "not found")).toBe("not found");
  });

  it("#merge! headers with mutation", () => {
    const headers = setup();
    headers.mergeInPlace({ Host: "http://example.test", "Content-Type": "text/html" });
    expect(headers.env).toEqual({
      HTTP_HOST: "http://example.test",
      CONTENT_TYPE: "text/html",
      HTTP_REFERER: "/some/page",
    });
  });

  it("#merge! env with mutation", () => {
    const headers = setup();
    headers.mergeInPlace({ HTTP_HOST: "http://first.com", CONTENT_TYPE: "text/html" });
    expect(headers.env).toEqual({
      HTTP_HOST: "http://first.com",
      CONTENT_TYPE: "text/html",
      HTTP_REFERER: "/some/page",
    });
  });

  it("merge without mutation", () => {
    const headers = setup();
    const combined = headers.merge({
      HTTP_HOST: "http://example.com",
      CONTENT_TYPE: "text/html",
    });
    expect(combined.env).toEqual({
      HTTP_HOST: "http://example.com",
      CONTENT_TYPE: "text/html",
      HTTP_REFERER: "/some/page",
    });
    expect(headers.env).toEqual({
      CONTENT_TYPE: "text/plain",
      HTTP_REFERER: "/some/page",
    });
  });

  it("env variables with . are not modified", () => {
    const headers = makeHeaders({});
    headers.mergeInPlace({
      "rack.input": "",
      "rack.request.cookie_hash": "",
      "action_dispatch.logger": "",
    });
    expect(Object.keys(headers.env).sort()).toEqual([
      "action_dispatch.logger",
      "rack.input",
      "rack.request.cookie_hash",
    ]);
  });

  it("symbols are treated as strings", () => {
    const headers = makeHeaders({});
    headers.mergeInPlace({
      SERVER_NAME: "example.com",
      HTTP_REFERER: "/",
      Host: "test.com",
    });
    expect(headers.get("SERVER_NAME")).toBe("example.com");
    expect(headers.get("HTTP_REFERER")).toBe("/");
    expect(headers.get("HTTP_HOST")).toBe("test.com");
  });

  it("headers directly modifies the passed environment", () => {
    const env: Record<string, unknown> = { HTTP_REFERER: "/" };
    const headers = makeHeaders(env);
    headers.set("Referer", "http://example.com/");
    headers.set("CONTENT_TYPE", "text/plain");
    expect(env).toEqual({
      HTTP_REFERER: "http://example.com/",
      CONTENT_TYPE: "text/plain",
    });
  });

  it("fetch exception", () => {
    const headers = setup();
    expect(() => headers.fetch("some_key_that_doesnt_exist")).toThrow();
  });
});
