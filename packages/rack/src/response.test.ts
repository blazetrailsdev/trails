import { describe, it, expect } from "vitest";
import { Response, ResponseRaw } from "./response.js";

describe("Rack::Response", () => {
  it("has standard constructor", () => {
    const headers = { "header": "value" };
    const body = ["body"];
    const response = Response.create(200, headers, body);
    expect(response.status).toBe(200);
    expect(response.headers["header"]).toBe("value");
    expect(response.body).toEqual(body);
  });

  it("has cache-control methods", () => {
    const response = new Response();
    response.cacheControl = "foo";
    expect(response.cacheControl).toBe("foo");
    const [, h] = response.toArray();
    expect(h["cache-control"]).toBe("foo");
  });

  it("has an etag method", () => {
    const response = new Response();
    response.etag = "foo";
    expect(response.etag).toBe("foo");
    const [, h] = response.toArray();
    expect(h["etag"]).toBe("foo");
  });

  it("has a content-type method", () => {
    const response = new Response();
    response.contentType = "foo";
    expect(response.contentType).toBe("foo");
    const [, h] = response.toArray();
    expect(h["content-type"]).toBe("foo");
  });

  it("have sensible default values", () => {
    let response = new Response();
    const [status, header] = response.finish();
    expect(status).toBe(200);
    expect(header).toEqual({});

    response = new Response();
    const [s2, h2, b2] = response.toArray();
    expect(s2).toBe(200);
  });

  it("can be written to inside finish block and it does not generate a content-length header", () => {
    const response = new Response("foo");
    response.write("bar");
    const [, h, body] = response.finish((res) => { res.write("baz"); });
    const parts: string[] = [];
    body.each((part: string) => parts.push(part));
    expect(parts).toEqual(["foo", "bar", "baz"]);
    expect(h["content-length"]).toBeUndefined();
  });

  it("can set and read headers", () => {
    const response = new Response();
    expect(response.headers["content-type"]).toBeUndefined();
    response.headers["content-type"] = "text/plain";
    expect(response.headers["content-type"]).toBe("text/plain");
  });

  it("doesn't mutate given headers", () => {
    const headers = Object.freeze({}) as Record<string, string>;
    const response = new Response([], 200, headers);
    response.headers["content-type"] = "text/plain";
    expect(response.headers["content-type"]).toBe("text/plain");
    expect("content-type" in headers).toBe(false);
  });

  it("can override the initial content-type with a different case", () => {
    const response = new Response("", 200, { "content-type": "text/plain" });
    expect(response.headers["content-type"]).toBe("text/plain");
  });

  it("can get and set set-cookie header", () => {
    const response = new Response();
    expect(response.setCookieHeaderValue).toBeUndefined();
    response.setCookieHeaderValue = "v=1;";
    expect(response.setCookieHeaderValue).toBe("v=1;");
    expect(response.headers["set-cookie"]).toBe("v=1;");
  });

  it("can set cookies", () => {
    const response = new Response();
    response.setCookie("foo", "bar");
    expect(response.headers["set-cookie"]).toBe("foo=bar");
    response.setCookie("foo2", "bar2");
    expect(response.headers["set-cookie"]).toEqual(["foo=bar", "foo2=bar2"]);
    response.setCookie("foo3", "bar3");
    expect(response.headers["set-cookie"]).toEqual(["foo=bar", "foo2=bar2", "foo3=bar3"]);
  });

  it("can set cookies with the same name for multiple domains", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", domain: "sample.example.com" });
    response.setCookie("foo", { value: "bar", domain: ".example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; domain=sample.example.com",
      "foo=bar; domain=.example.com",
    ]);
  });

  it("formats the Cookie expiration date accordingly to RFC 6265", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", expires: new Date(Date.now() + 10000) });
    expect(response.headers["set-cookie"]).toMatch(/expires=..., \d\d ... \d\d\d\d \d\d:\d\d:\d\d .../);
  });

  it("can set secure cookies", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", secure: true });
    expect(response.headers["set-cookie"]).toBe("foo=bar; secure");
  });

  it("can set http only cookies", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", httponly: true });
    expect(response.headers["set-cookie"]).toBe("foo=bar; httponly");
  });

  it("can set http only cookies with :http_only", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", http_only: true });
    expect(response.headers["set-cookie"]).toBe("foo=bar; httponly");
  });

  it("can set prefers :httponly for http only cookie setting when :httponly and :http_only provided", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", httponly: false, http_only: true });
    expect(response.headers["set-cookie"]).toBe("foo=bar");
  });

  it("can set same site cookies with symbol value :none", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "none" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=none");
  });

  it("can set same site cookies with symbol value :None", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "None" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=none");
  });

  it("can set same site cookies with string value 'None'", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "None" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=none");
  });

  it("can set same site cookies with symbol value :lax", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "lax" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=lax");
  });

  it("can set same site cookies with symbol value :Lax", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "lax" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=lax");
  });

  it("can set same site cookies with string value 'Lax'", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "Lax" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=lax");
  });

  it("can set same site cookies with boolean value true", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: true });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=strict");
  });

  it("can set same site cookies with symbol value :strict", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "strict" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=strict");
  });

  it("can set same site cookies with symbol value :Strict", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "Strict" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=strict");
  });

  it("can set same site cookies with string value 'Strict'", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "Strict" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=strict");
  });

  it("validates the same site option value", () => {
    const response = new Response();
    expect(() => response.setCookie("foo", { value: "bar", same_site: "Foo" })).toThrow(/Invalid/);
  });

  it("can set same site cookies with symbol value", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", same_site: "Strict" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; samesite=strict");
  });

  it("omits same site attribute given a nil/false value", () => {
    for (const val of [null, false]) {
      const response = new Response();
      response.setCookie("foo", { value: "bar", same_site: val });
      expect(response.headers["set-cookie"]).toBe("foo=bar");
    }
  });

  it("can delete cookies", () => {
    const response = new Response();
    response.setCookie("foo", "bar");
    response.setCookie("foo2", "bar2");
    response.deleteCookie("foo");
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar",
      "foo2=bar2",
      "foo=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("can delete cookies with the same name from multiple domains", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", domain: "sample.example.com" });
    response.setCookie("foo", { value: "bar", domain: ".example.com" });

    response.deleteCookie("foo", { domain: ".example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; domain=sample.example.com",
      "foo=bar; domain=.example.com",
      "foo=; domain=.example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);

    response.deleteCookie("foo", { domain: "sample.example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; domain=sample.example.com",
      "foo=bar; domain=.example.com",
      "foo=; domain=.example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "foo=; domain=sample.example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("only deletes cookies for the domain specified", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", domain: "example.com.example.com" });
    response.setCookie("foo", { value: "bar", domain: "example.com" });

    response.deleteCookie("foo", { domain: "example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; domain=example.com.example.com",
      "foo=bar; domain=example.com",
      "foo=; domain=example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);

    response.deleteCookie("foo", { domain: "example.com.example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; domain=example.com.example.com",
      "foo=bar; domain=example.com",
      "foo=; domain=example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "foo=; domain=example.com.example.com; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("can delete cookies with the same name with different paths", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", path: "/" });
    response.setCookie("foo", { value: "bar", path: "/path" });
    expect(response.headers["set-cookie"]).toEqual(["foo=bar; path=/", "foo=bar; path=/path"]);

    response.deleteCookie("foo", { path: "/path" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; path=/",
      "foo=bar; path=/path",
      "foo=; path=/path; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("only delete cookies with the path specified", () => {
    const response = new Response();
    response.setCookie("foo", { value: "bar", path: "/a/b" });
    expect(response.headers["set-cookie"]).toBe("foo=bar; path=/a/b");

    response.deleteCookie("foo", { path: "/a" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=bar; path=/a/b",
      "foo=; path=/a; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("only delete cookies with the domain and path specified", () => {
    const response = new Response();
    response.deleteCookie("foo", { path: "/a", domain: "example.com" });
    expect(response.headers["set-cookie"]).toBe(
      "foo=; domain=example.com; path=/a; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );

    response.deleteCookie("foo", { path: "/a/b", domain: "example.com" });
    expect(response.headers["set-cookie"]).toEqual([
      "foo=; domain=example.com; path=/a; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "foo=; domain=example.com; path=/a/b; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  it("can do redirects", () => {
    let response = new Response();
    response.redirect("/foo");
    const [status, header] = response.finish();
    expect(status).toBe(302);
    expect(header["location"]).toBe("/foo");

    response = new Response();
    response.redirect("/foo", 307);
    const [s2] = response.finish();
    expect(s2).toBe(307);
  });

  it("has a useful constructor", () => {
    let r = new Response("foo");
    let body = r.finish()[2];
    let str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foo");

    r = new Response(["foo", "bar"]);
    body = r.finish()[2];
    str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foobar");

    r = new Response([], 500);
    expect(r.status).toBe(500);

    r = new Response([], 200);
    expect(r.status).toBe(200);
  });

  it("has a constructor that can take a block", () => {
    const r = new Response();
    r.status = 404;
    r.write("foo");
    const [status, , body] = r.finish();
    const parts: string[] = [];
    body.forEach((part: string) => parts.push(part));
    expect(parts.join("")).toBe("foo");
    expect(status).toBe(404);
  });

  it("correctly updates content-length when writing when initialized without body", () => {
    const r = new Response();
    r.write("foo");
    r.write("bar");
    r.write("baz");
    const [, header, body] = r.finish();
    let str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foobarbaz");
    expect(header["content-length"]).toBe("9");
  });

  it("correctly updates content-length when writing when initialized with Array body", () => {
    const r = new Response(["foo"]);
    r.write("bar");
    r.write("baz");
    const [, header, body] = r.finish();
    let str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foobarbaz");
    expect(header["content-length"]).toBe("9");
  });

  it("correctly updates content-length when writing when initialized with String body", () => {
    const r = new Response("foo");
    r.write("bar");
    r.write("baz");
    const [, header, body] = r.finish();
    let str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foobarbaz");
    expect(header["content-length"]).toBe("9");
  });

  it("correctly updates content-length when writing when initialized with object body that responds to #each", () => {
    const obj = { each(fn: (s: string) => void) { fn("foo"); fn("bar"); } };
    const r = new Response(obj);
    r.write("baz");
    r.write("baz");
    const [, header, body] = r.finish();
    let str = "";
    body.forEach((part: string) => str += part);
    expect(str).toBe("foobarbazbaz");
    expect(header["content-length"]).toBe("12");
  });

  it("doesn't return invalid responses", () => {
    const r = new Response(["foo", "bar"], 204);
    const [, header, body] = r.finish();
    let str = "";
    if (Array.isArray(body)) body.forEach((part: string) => str += part);
    expect(str).toBe("");
    expect(header["content-type"]).toBeUndefined();
    expect(header["content-length"]).toBeUndefined();
  });

  it("knows if it's empty", () => {
    let r = new Response();
    expect(r.isEmpty()).toBe(true);
    r.write("foo");
    expect(r.isEmpty()).toBe(false);

    r = new Response();
    expect(r.isEmpty()).toBe(true);
    r.finish();
    expect(r.isEmpty()).toBe(true);

    r = new Response();
    expect(r.isEmpty()).toBe(true);
    r.finish(() => {});
    expect(r.isEmpty()).toBe(false);
  });

  it("provide access to the HTTP status", () => {
    const res = new Response();
    res.status = 200;
    expect(res.isSuccessful).toBe(true);
    expect(res.isOk).toBe(true);

    res.status = 201;
    expect(res.isSuccessful).toBe(true);
    expect(res.isCreated).toBe(true);

    res.status = 202;
    expect(res.isSuccessful).toBe(true);
    expect(res.isAccepted).toBe(true);

    res.status = 204;
    expect(res.isSuccessful).toBe(true);
    expect(res.isNoContent).toBe(true);

    res.status = 301;
    expect(res.isRedirect).toBe(true);
    expect(res.isMovedPermanently).toBe(true);

    res.status = 400;
    expect(res.isSuccessful).toBe(false);
    expect(res.isClientError).toBe(true);
    expect(res.isBadRequest).toBe(true);

    res.status = 401;
    expect(res.isClientError).toBe(true);
    expect(res.isUnauthorized).toBe(true);

    res.status = 404;
    expect(res.isClientError).toBe(true);
    expect(res.isNotFound).toBe(true);

    res.status = 405;
    expect(res.isMethodNotAllowed).toBe(true);

    res.status = 406;
    expect(res.isNotAcceptable).toBe(true);

    res.status = 408;
    expect(res.isRequestTimeout).toBe(true);

    res.status = 412;
    expect(res.isPreconditionFailed).toBe(true);

    res.status = 422;
    expect(res.isUnprocessable).toBe(true);

    res.status = 501;
    expect(res.isServerError).toBe(true);
  });

  it("provide access to the HTTP headers", () => {
    const res = new Response();
    res.headers["content-type"] = "text/yaml; charset=UTF-8";
    expect(res.includes("content-type")).toBe(true);
    expect(res.headers["content-type"]).toBe("text/yaml; charset=UTF-8");
    expect(res.contentType).toBe("text/yaml; charset=UTF-8");
    expect(res.mediaType).toBe("text/yaml");
    expect(res.mediaTypeParams).toEqual({ charset: "UTF-8" });
    expect(res.contentLength).toBeNull();
    expect(res.location).toBeUndefined();
  });

  it("does not add or change content-length when #finish()ing", () => {
    let res = new Response();
    res.status = 200;
    res.finish();
    expect(res.headers["content-length"]).toBeUndefined();

    res = new Response();
    res.status = 200;
    res.headers["content-length"] = "10";
    res.finish();
    expect(res.headers["content-length"]).toBe("10");
  });

  it("updates length when body appended to using #write", () => {
    const res = new Response();
    expect(res.length).toBeNull();
    res.write("Hi");
    expect(res.length).toBe(2);
    res.write(" there");
    expect(res.length).toBe(8);
    res.finish();
    expect(res.headers["content-length"]).toBe("8");
  });

  it("does not wrap body", () => {
    const body = { custom: true };
    const res = new Response(body);
    expect(res.finish()[2]).toBe(body);
  });

  it("does wraps body when using #write", () => {
    const body = ["Foo"];
    const res = new Response(body);
    res.write("Bar");
    expect(body).toEqual(["Foo"]);
    expect(res.finish()[2]).toEqual(["Foo", "Bar"]);
  });

  it("calls close on #body", () => {
    const res = new Response();
    const body = { closed: false, close() { this.closed = true; } };
    res.body = body;
    res.close();
    expect(body.closed).toBe(true);
  });

  it("calls close on #body when 204 or 304", () => {
    let res = new Response();
    let body: any = { closed: false, close() { this.closed = true; } };
    res.body = body;
    res.finish();
    expect(body.closed).toBe(false);

    res.status = 204;
    const [, , b] = res.finish();
    expect(body.closed).toBe(true);
    expect(b).not.toBe(body);

    body = { closed: false, close() { this.closed = true; } };
    res.body = body;
    res.status = 304;
    const [, , b2] = res.finish();
    expect(body.closed).toBe(true);
    expect(b2).not.toBe(body);
  });

  it("doesn't call close on #body when 205", () => {
    const res = new Response();
    const body = { closed: false, close() { this.closed = true; } };
    res.body = body;
    res.status = 205;
    res.finish();
    expect(body.closed).toBe(false);
  });

  it("doesn't clear #body when 101 and streaming", () => {
    const res = new Response();
    const streamingBody = { close() {} };
    res.body = streamingBody;
    res.status = 101;
    res.finish();
    expect(res.body).toBe(streamingBody);
  });

  it("flatten doesn't cause infinite loop", () => {
    const res = new Response("Hello World");
    const result = res.finish();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should specify not to cache content", () => {
    const response = new Response();
    response.cache(1000);
    response.doNotCache();
    expect(response.headers["cache-control"]).toBe("no-cache, must-revalidate");
    const expires = new Date(response.headers["expires"] as string);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("should not cache content if calling cache! after do_not_cache!", () => {
    const response = new Response();
    response.doNotCache();
    response.cache(1000);
    expect(response.headers["cache-control"]).toBe("no-cache, must-revalidate");
  });

  it("should specify to cache content", () => {
    const response = new Response();
    const duration = 120;
    const minExpires = Date.now() + 100000;
    response.cache(duration);
    expect(response.headers["cache-control"]).toBe("public, max-age=120");
    const expires = new Date(response.headers["expires"] as string);
    expect(expires.getTime()).toBeGreaterThanOrEqual(minExpires);
  });
});

describe("Rack::Response, 'headers", () => {
  it("has_header?", () => {
    const response = new Response([], 200, { foo: "1" } as any);
    expect(() => response.hasHeader(null as any)).toThrow();
    expect(response.hasHeader("foo")).toBe(true);
  });

  it("get_header", () => {
    const response = new Response([], 200, { foo: "1" } as any);
    expect(() => response.getHeader(null as any)).toThrow();
    expect(response.getHeader("foo")).toBe("1");
  });

  it("set_header", () => {
    const response = new Response([], 200, { foo: "1" } as any);
    expect(() => response.setHeader(null as any, "1")).toThrow();
    expect(response.setHeader("foo", "2")).toBe("2");
    expect(response.hasHeader("foo")).toBe(true);
    expect(response.getHeader("foo")).toBe("2");

    expect(response.setHeader("foo", null)).toBeNull();
    expect(response.getHeader("foo")).toBeNull();
  });

  it("add_header", () => {
    const response = new Response([], 200, { foo: "1" } as any);
    expect(() => response.addHeader(null as any, "1")).toThrow();

    expect(response.addHeader("foo", "2")).toEqual(["1", "2"]);
    expect(response.getHeader("foo")).toEqual(["1", "2"]);

    expect(response.addHeader("foo", null)).toEqual(["1", "2"]);

    expect(response.addHeader("bar", null)).toBeNull();
    expect(response.hasHeader("bar")).toBe(false);

    expect(response.addHeader("bar", "1")).toBe("1");
    expect(response.hasHeader("bar")).toBe(true);
    expect(response.getHeader("bar")).toBe("1");
  });

  it("delete_header", () => {
    const response = new Response([], 200, { foo: "1" } as any);
    expect(() => response.deleteHeader(null as any)).toThrow();

    expect(response.deleteHeader("foo")).toBe("1");
    expect(response.hasHeader("foo")).toBe(false);

    expect(response.deleteHeader("foo")).toBeNull();

    response.setHeader("foo", 1);
    expect(response.deleteHeader("foo")).toBe(1);
    expect(response.hasHeader("foo")).toBe(false);
  });
});

describe("Rack::Response::Raw", () => {
  it("has_header?", () => {
    const response = new ResponseRaw(200, { foo: "1" });
    expect(response.hasHeader("foo")).toBe(true);
    expect(response.hasHeader(null as any)).toBe(false);
  });

  it("get_header", () => {
    const response = new ResponseRaw(200, { foo: "1" });
    expect(response.getHeader("foo")).toBe("1");
    expect(response.getHeader(null as any)).toBeUndefined();
  });

  it("set_header", () => {
    const response = new ResponseRaw(200, { foo: "1" });
    expect(response.setHeader("foo", "2")).toBe("2");
    expect(response.getHeader("foo")).toBe("2");

    expect(response.setHeader(null as any, "1")).toBe("1");
    expect(response.getHeader(null as any)).toBe("1");

    expect(response.setHeader("foo", null)).toBeNull();
    expect(response.getHeader("foo")).toBeNull();
  });

  it("delete_header", () => {
    const response = new ResponseRaw(200, { foo: "1" });
    expect(response.deleteHeader("foo")).toBe("1");
    expect(response.hasHeader("foo")).toBe(false);

    expect(response.deleteHeader("foo")).toBeNull();

    response.setHeader("foo", 1);
    expect(response.deleteHeader("foo")).toBe(1);
    expect(response.hasHeader("foo")).toBe(false);
  });
});
