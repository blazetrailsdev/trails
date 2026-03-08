import { describe, it, expect } from "vitest";
import { Response } from "./response.js";

describe("ActionDispatch::Response", () => {
  it("simple output", () => {
    const res = Response.create(200, { "content-type": "text/html" }, "Hello");
    expect(res.status).toBe(200);
    expect(res.body).toBe("Hello");
  });

  it("status handled properly in initialize", () => {
    const res = new Response(404);
    expect(res.status).toBe(404);
    expect(res.message).toBe("Not Found");
  });

  it("response code", () => {
    const res = new Response(200);
    expect(res.code).toBe(200);
    expect(res.statusCode).toBe(200);
  });

  it("message", () => {
    expect(new Response(200).message).toBe("OK");
    expect(new Response(404).message).toBe("Not Found");
    expect(new Response(500).message).toBe("Internal Server Error");
    expect(new Response(301).message).toBe("Moved Permanently");
  });

  it("only set charset still defaults to text html", () => {
    const res = new Response();
    res.charset = "utf-8";
    res.contentType = "text/html";
    expect(res.charset).toBe("utf-8");
  });

  it("utf8 output", () => {
    const res = Response.create(200, {}, "héllo");
    expect(res.body).toBe("héllo");
  });

  it("content length", () => {
    const res = new Response();
    res.body = "hello";
    expect(res.contentLength).toBe(5);
  });

  it("does not contain a message-body", () => {
    const res = new Response(204);
    expect(res.status).toBe(204);
    expect(res.message).toBe("No Content");
  });

  it("content type", () => {
    const res = new Response();
    res.contentType = "application/json";
    expect(res.contentType).toBe("application/json");
  });

  it("empty content type returns nil", () => {
    const res = new Response();
    expect(res.contentType).toBeUndefined();
  });

  it("setting content type header impacts content type method", () => {
    const res = new Response();
    res.setHeader("content-type", "application/xml");
    expect(res.contentType).toBe("application/xml");
  });

  it("response charset writer", () => {
    const res = new Response();
    res.charset = "iso-8859-1";
    expect(res.charset).toBe("iso-8859-1");
  });

  it("cookies", () => {
    const res = new Response();
    res.setCookie("foo", "bar");
    expect(res.cookies).toEqual({ foo: "bar" });
  });

  it("multiple cookies", () => {
    const res = new Response();
    res.setCookie("foo", "bar");
    res.setCookie("baz", "qux");
    expect(res.cookies).toEqual({ foo: "bar", baz: "qux" });
  });

  it("delete cookies", () => {
    const res = new Response();
    res.setCookie("foo", "bar");
    res.deleteCookie("foo");
    expect(res.cookies.foo).toBe("");
  });

  it("read ETag and Cache-Control", () => {
    const res = new Response();
    res.etag = "abc123";
    res.cacheControl = "public, max-age=3600";
    expect(res.etag).toBe('"abc123"');
    expect(res.cacheControl).toBe("public, max-age=3600");
  });

  it("read strong ETag", () => {
    const res = new Response();
    res.etag = '"strong-etag"';
    expect(res.strongEtag).toBe(true);
    expect(res.weakEtag).toBe(false);
  });

  it("read charset and content type", () => {
    const res = new Response();
    res.setHeader("content-type", "text/html; charset=utf-8");
    expect(res.contentType).toBe("text/html");
    expect(res.charset).toBe("utf-8");
  });

  it("respect no-store cache-control", () => {
    const res = new Response();
    res.cacheControl = "no-store";
    expect(res.cacheControl).toBe("no-store");
  });

  it("respect private, no-store cache-control", () => {
    const res = new Response();
    res.cacheControl = "private, no-store";
    expect(res.cacheControl).toBe("private, no-store");
  });

  it("does not include Status header", () => {
    const res = new Response(200);
    expect(res.headers["Status"]).toBeUndefined();
  });

  // --- Stream / commit ---

  it("can wait until commit", () => {
    const res = new Response();
    expect(res.committed).toBe(false);
    res.close();
    expect(res.committed).toBe(true);
  });

  it("stream close", () => {
    const res = new Response();
    res.close();
    expect(res.committed).toBe(true);
  });

  it("stream write", () => {
    const res = new Response();
    res.write("hello");
    res.write(" world");
    expect(res.body).toBe("hello world");
  });

  it("write after close", () => {
    const res = new Response();
    res.close();
    expect(() => res.write("more")).toThrow();
  });

  it("each isnt called if str body is written", () => {
    const res = new Response();
    res.body = "direct body";
    expect(res.body).toBe("direct body");
  });

  // --- toRack ---

  it("toRack returns rack-compatible triple", () => {
    const res = Response.create(200, { "content-type": "text/plain" }, "hi");
    const [status, headers, body] = res.toRack();
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/plain");
    expect(body).toEqual(["hi"]);
  });

  // --- Inspect ---

  it("inspect", () => {
    const res = new Response(200);
    expect(res.inspect()).toBe("#<ActionDispatch::Response 200 OK>");
  });

  // --- Body encoding ---

  it("response body encoding", () => {
    const res = new Response();
    res.body = "テスト";
    expect(res.body).toBe("テスト");
    // Content-length should be byte length, not char length
    expect(res.contentLength).toBe(Buffer.byteLength("テスト", "utf-8"));
  });
});
