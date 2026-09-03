import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Request } from "../request.js";
import { Response } from "../response.js";

function withTempFile<T>(contents: string, fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "trails-response-"));
  const path = join(dir, "fixture");
  writeFileSync(path, contents);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ResponseTest", () => {
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
    expect(res.contentType).toBe("application/json; charset=utf-8");
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
    res.setCookie("user_name", { value: "david", path: "/" });
    expect(res.headers.get("set-cookie")).toBe("user_name=david; path=/");
    expect(res.cookies).toEqual({ user_name: "david" });
  });

  it("multiple cookies", () => {
    const res = new Response();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    expect(res.headers.get("set-cookie")).toBe(
      "user_name=david; path=/\nlogin=foo%26bar; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT",
    );
    expect(res.cookies).toEqual({ login: "foo&bar", user_name: "david" });
  });

  it("delete cookies", () => {
    const res = new Response();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    res.deleteCookie("login");
    expect(res.cookies).toEqual({ user_name: "david", login: "" });
  });

  it("read ETag and Cache-Control", () => {
    const res = new Response();
    res.weakEtag("abc123");
    res._cacheControl = "public, max-age=3600";
    expect(res.etag?.startsWith('W/"')).toBe(true);
    expect(res._cacheControl).toBe("public, max-age=3600");
  });

  it("read strong ETag", () => {
    const res = new Response();
    res.strongEtag("strong-etag");
    expect(res.isStrongEtag()).toBe(true);
    expect(res.isWeakEtag()).toBe(false);
  });

  it("read charset and content type", () => {
    const res = new Response();
    res.setHeader("content-type", "text/html; charset=utf-8");
    expect(res.contentType).toBe("text/html; charset=utf-8");
    expect(res.mediaType).toBe("text/html");
    expect(res.charset).toBe("utf-8");
  });

  it("respect no-store cache-control", () => {
    const res = new Response();
    res._cacheControl = "no-store";
    expect(res._cacheControl).toBe("no-store");
  });

  it("respect private, no-store cache-control", () => {
    const res = new Response();
    res._cacheControl = "private, no-store";
    expect(res._cacheControl).toBe("private, no-store");
  });

  it("does not include Status header", () => {
    const res = new Response(200);
    expect(res.headers.get("Status")).toBeUndefined();
  });

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

  it("toRack returns rack-compatible triple", () => {
    const res = Response.create(200, { "content-type": "text/plain" }, "hi");
    const [status, headers, body] = res.toRack();
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/plain");
    expect([...(body as Iterable<unknown>)]).toEqual(["hi"]);
  });

  it("inspect", () => {
    const res = new Response(200);
    expect(res.inspect()).toBe("#<ActionDispatch::Response 200 OK>");
  });

  it("response body encoding", () => {
    const res = new Response();
    res.body = "テスト";
    expect(res.body).toBe("テスト");
    expect(res.contentLength).toBe(Buffer.byteLength("テスト", "utf-8"));
  });

  it("getHeader is case insensitive", () => {
    const res = new Response();
    res.setHeader("X-Custom", "value");
    expect(res.getHeader("X-Custom")).toBe("value");
  });

  it("deleteHeader removes the header", () => {
    const res = new Response();
    res.setHeader("X-Custom", "value");
    res.deleteHeader("X-Custom");
    expect(res.getHeader("X-Custom")).toBeUndefined();
  });

  it("setHeader overwrites existing header", () => {
    const res = new Response();
    res.setHeader("X-Custom", "first");
    res.setHeader("X-Custom", "second");
    expect(res.getHeader("X-Custom")).toBe("second");
  });

  it("weak ETag detection", () => {
    const res = new Response();
    res.setHeader("etag", 'W/"abc"');
    expect(res.isWeakEtag()).toBe(true);
    expect(res.isStrongEtag()).toBe(false);
  });

  it("etag= delegates to setWeakEtag (Rails parity)", () => {
    const res = new Response();
    res.etag = "abc";
    expect(res.etag?.startsWith('W/"')).toBe(true);
    expect(res.isWeakEtag()).toBe(true);
  });

  it("setting _cacheControl to undefined removes it", () => {
    const res = new Response();
    res._cacheControl = "no-cache";
    res._cacheControl = undefined;
    expect(res._cacheControl).toBeUndefined();
  });

  it("text content type gets charset appended", () => {
    const res = new Response();
    res.contentType = "text/plain";
    expect(res.getHeader("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("setCookie with options", () => {
    const res = new Response();
    res.setCookie("session", { value: "abc", path: "/", httpOnly: true, secure: true });
    expect(res.cookies.session).toBe("abc");
  });

  it("deleteCookie sets empty value and past expiry", () => {
    const res = new Response();
    res.setCookie("token", "val");
    res.deleteCookie("token");
    expect(res.cookies.token).toBe("");
  });

  it("Response.create with no body", () => {
    const res = Response.create(404);
    expect(res.status).toBe(404);
    expect(res.body).toBe("");
  });

  it("Response.create with all args", () => {
    const res = Response.create(201, { "x-custom": "yes" }, "created");
    expect(res.status).toBe(201);
    expect(res.getHeader("x-custom")).toBe("yes");
    expect(res.body).toBe("created");
  });

  it("Response.create with an enumerable body", () => {
    const res = Response.create(200, {}, ["Hello", " ", "World"]);
    expect(res.body).toBe("Hello World");
  });

  it("default constructor has status 200", () => {
    const res = new Response();
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
  });

  it("status messages for common codes", () => {
    expect(new Response(201).message).toBe("Created");
    expect(new Response(204).message).toBe("No Content");
    expect(new Response(302).message).toBe("Found");
    expect(new Response(400).message).toBe("Bad Request");
    expect(new Response(401).message).toBe("Unauthorized");
    expect(new Response(403).message).toBe("Forbidden");
    expect(new Response(422).message).toBe("Unprocessable Entity");
    expect(new Response(503).message).toBe("Service Unavailable");
  });

  it("contentLength returns undefined when not set", () => {
    const res = new Response();
    expect(res.contentLength).toBeUndefined();
  });

  it("inspect for error status", () => {
    expect(new Response(500).inspect()).toBe(
      "#<ActionDispatch::Response 500 Internal Server Error>",
    );
  });

  it("inspect for redirect", () => {
    expect(new Response(302).inspect()).toBe("#<ActionDispatch::Response 302 Found>");
  });

  it("successful predicate", () => {
    expect(new Response(200).successful).toBe(true);
    expect(new Response(299).successful).toBe(true);
    expect(new Response(300).successful).toBe(false);
    expect(new Response(404).successful).toBe(false);
  });

  it("redirection predicate", () => {
    expect(new Response(301).redirection).toBe(true);
    expect(new Response(302).redirection).toBe(true);
    expect(new Response(200).redirection).toBe(false);
    expect(new Response(400).redirection).toBe(false);
  });

  it("clientError predicate", () => {
    expect(new Response(400).clientError).toBe(true);
    expect(new Response(404).clientError).toBe(true);
    expect(new Response(499).clientError).toBe(true);
    expect(new Response(500).clientError).toBe(false);
  });

  it("serverError predicate", () => {
    expect(new Response(500).serverError).toBe(true);
    expect(new Response(599).serverError).toBe(true);
    expect(new Response(404).serverError).toBe(false);
  });

  it("notFound predicate", () => {
    expect(new Response(404).notFound).toBe(true);
    expect(new Response(400).notFound).toBe(false);
    expect(new Response(200).notFound).toBe(false);
  });

  it("defaultCharset static is utf-8", () => {
    expect(Response.defaultCharset).toBe("utf-8");
  });

  it("contentType setter honors a customized Response.defaultCharset", () => {
    const prior = Response.defaultCharset;
    try {
      Response.defaultCharset = "iso-8859-1";
      const res = new Response();
      res.contentType = "text/plain";
      expect(res.headers.get("content-type")).toBe("text/plain; charset=iso-8859-1");
    } finally {
      Response.defaultCharset = prior;
    }
  });

  it("set header after read body during action", () => {
    const res = new Response();
    void res.body;
    res.setHeader("x-header", "Best of all possible worlds.");
    const [status, headers] = res.toRack();
    expect(status).toBe(200);
    expect(headers["x-header"]).toBe("Best of all possible worlds.");
  });

  it.skip("read body during action", () => {});

  it.skip("code", () => {});

  it("read content type with default charset utf-8", () => {
    const res = new Response(200, { "Content-Type": "text/xml" });
    expect(res.charset).toBe("utf-8");
  });

  it("read content type with charset utf-16", () => {
    const original = Response.defaultCharset;
    try {
      Response.defaultCharset = "utf-16";
      const res = new Response(200, { "Content-Type": "text/xml" });
      expect(res.charset).toBe("utf-16");
    } finally {
      Response.defaultCharset = original;
    }
  });

  it("read x_frame_options, x_content_type_options, x_xss_protection, x_permitted_cross_domain_policies and referrer_policy", () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "0",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };
      const resp = Response.create();
      resp.body = "Hello";
      resp.toRack();
      expect(resp.headers.get("X-Frame-Options")).toBe("DENY");
      expect(resp.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(resp.headers.get("X-XSS-Protection")).toBe("0");
      expect(resp.headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
      expect(resp.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    } finally {
      Response.defaultHeaders = original;
    }
  });

  it("read custom default_header", () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-XX-XXXX": "Here is my phone number",
      };
      const resp = Response.create();
      resp.body = "Hello";
      resp.toRack();
      expect(resp.headers.get("X-XX-XXXX")).toBe("Here is my phone number");
    } finally {
      Response.defaultHeaders = original;
    }
  });

  it.skip("respond_to? accepts include_private", () => {});

  it("can be explicitly destructured into status, headers and an enumerable body", () => {
    const res = new Response(404, { "Content-Type": "text/plain" }, ["Not Found"]);
    const [status, headers, body] = res.toRack() as [
      number,
      Record<string, string>,
      Iterable<unknown>,
    ];
    expect(status).toBe(404);
    expect(headers["content-type"]).toBe("text/plain");
    expect([...body]).toEqual(["Not Found"]);
  });

  it.skip("[response.to_a].flatten does not recurse infinitely", () => {});

  it.skip("compatibility with Rack::ContentLength", () => {});
});

describe("ResponseFilterRedirect", () => {
  it("location getter/setter round-trips through the Location header", () => {
    const res = new Response();
    res.location = "https://example.com/foo";
    expect(res.location).toBe("https://example.com/foo");
    expect(res.headers.get("location")).toBe("https://example.com/foo");
  });

  it("filteredLocation strips sensitive query params using the request filter", () => {
    const req = new Request({
      "action_dispatch.parameter_filter": ["token"],
    });
    const res = new Response();
    res.request = req;
    res.location = "https://example.com/foo?token=secret&name=alice";
    const filtered = res.filteredLocation();
    expect(filtered).toContain("name=alice");
    expect(filtered).not.toContain("secret");
    expect(filtered).toContain("token=");
  });

  it("filteredLocation replaces the entire location when redirect_filter matches", () => {
    const req = new Request({
      "action_dispatch.redirect_filter": [/secret/],
    });
    const res = new Response();
    res.request = req;
    res.location = "https://example.com/secret/path";
    expect(res.filteredLocation()).toBe("[FILTERED]");
  });

  it("filteredLocation returns the unmodified location when no filters are configured", () => {
    const req = new Request({});
    const res = new Response();
    res.request = req;
    res.location = "https://example.com/foo";
    expect(res.filteredLocation()).toBe("https://example.com/foo");
  });
});

describe("Response Cache::Response wiring", () => {
  it("lastModified round-trips through Last-Modified header", () => {
    const res = new Response();
    const t = new Date("1994-11-06T08:49:37Z");
    res.lastModified = t;
    expect(res.isLastModified).toBe(true);
    expect(res.getHeader("Last-Modified")).toBe("Sun, 06 Nov 1994 08:49:37 GMT");
    expect(res.lastModified?.getTime()).toBe(t.getTime());
  });

  it("lastModified returns undefined when absent", () => {
    const res = new Response();
    expect(res.isLastModified).toBe(false);
    expect(res.lastModified).toBeUndefined();
  });

  it("date round-trips through Date header", () => {
    const res = new Response();
    const t = new Date("1994-11-06T08:49:37Z");
    res.date = t;
    expect(res.isDate).toBe(true);
    expect(res.date?.getTime()).toBe(t.getTime());
  });

  it("setWeakEtag writes a W/-prefixed strong-form digest", () => {
    const res = new Response();
    res.weakEtag(["abc", 1]);
    const e = res.getHeader("ETag")!;
    expect(e.startsWith('W/"')).toBe(true);
    expect(res.isWeakEtag()).toBe(true);
    expect(res.isStrongEtag()).toBe(false);
    expect(res.isEtag).toBe(e);
    expect(res.getHeader("etag")).toBe(e);
    expect(res.getHeader("ETAG")).toBe(e);
  });

  it("setStrongEtag writes an unprefixed digest", () => {
    const res = new Response();
    res.strongEtag(["abc", 1]);
    const e = res.getHeader("ETag")!;
    expect(e.startsWith('"')).toBe(true);
    expect(e.startsWith('W/"')).toBe(false);
    expect(res.isStrongEtag()).toBe(true);
    expect(res.isWeakEtag()).toBe(false);
  });

  it("cacheControl returns a parsed directive hash", () => {
    const res = new Response();
    res.setHeader("Cache-Control", "max-age=600, public, foo=bar");
    const hash = res.cacheControl;
    expect(hash["max_age"]).toBe("600");
    expect(hash["public"]).toBe(true);
    expect(hash.extras).toEqual(["foo=bar"]);
  });

  it("mergeAndNormalizeCacheControl writes back the combined directive set", () => {
    const res = new Response();
    res._cacheControl = "no-cache";
    res.mergeAndNormalizeCacheControlBang({ public: true, max_age: 30 });
    const cc = res._cacheControl;
    expect(cc).toContain("max-age=30");
    expect(cc).toContain("public");
  });

  it("handleConditionalGet sets a default Cache-Control when an ETag is present", () => {
    const res = new Response();
    res.weakEtag("v1");
    res.handleConditionalGetBang();
    expect(res.getHeader("Cache-Control")).toBe("max-age=0, private, must-revalidate");
    expect(res.getHeader("cache-control")).toBe("max-age=0, private, must-revalidate");
  });

  it("handleConditionalGet is a no-op when Cache-Control is already set", () => {
    const res = new Response();
    res.weakEtag("v1");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.handleConditionalGetBang();
    expect(res.getHeader("Cache-Control")).toBe("public, max-age=60");
  });

  it("handleConditionalGet is a no-op without ETag or Last-Modified", () => {
    const res = new Response();
    res.handleConditionalGetBang();
    expect(res.getHeader("Cache-Control")).toBeUndefined();
  });

  describe("lifecycle (commit / sending / sent)", () => {
    it("commitBang is idempotent and runs beforeCommitted once", () => {
      const res = new Response();
      res.commitBang();
      expect(res.committed).toBe(true);
      expect(res.getHeader("content-type")).toMatch(/text\/html/);
      res.commitBang();
      expect(res.committed).toBe(true);
    });

    it("each wraps iteration in sending! / sent!", () => {
      const res = new Response(200, {}, ["hello", " world"]);
      const chunks: unknown[] = [];
      for (const chunk of res.each()) chunks.push(chunk);
      expect(chunks).toEqual(["hello", " world"]);
      expect(res.isSending).toBe(true);
      expect(res.isSent).toBe(true);
    });
  });

  describe("sendFile", () => {
    it("commits the response and exposes a Rack-compatible file body", () => {
      withTempFile("hello", (path) => {
        const res = new Response();
        res.sendFile(path);
        expect(res.committed).toBe(true);
        const stream = res.stream as { toPath(): string; each(): IterableIterator<string> };
        expect(typeof stream.toPath).toBe("function");
        expect(stream.toPath()).toBe(path);
      });
    });

    it("toRack surfaces the stream itself (preserving toPath) when sendFile was called", () => {
      withTempFile("hello", (path) => {
        const res = new Response();
        res.sendFile(path);
        const [status, , body] = res.toRack();
        expect(status).toBe(200);
        const stream = body as { toPath(): string; each(): IterableIterator<string> };
        expect(stream.toPath()).toBe(path);
        const chunks: string[] = [];
        for (const c of stream.each()) chunks.push(c);
        expect(chunks.join("")).toBe("hello");
      });
    });
  });

  describe("bodyParts", () => {
    it("drains the buffered body when no explicit stream is set", () => {
      const res = new Response(200, {}, ["a", "b"]);
      expect(res.bodyParts()).toEqual(["a", "b"]);
    });
  });
});

describe("ResponseHeadersTest", () => {
  it("has_header?", () => {
    const res = Response.create();
    res.setHeader("Foo", "1");
    expect(res.hasHeader("Foo")).toBe(true);
    expect(res.hasHeader("foo")).toBe(true);
  });

  it("get_header", () => {
    const res = Response.create();
    res.setHeader("Foo", "1");
    expect(res.getHeader("Foo")).toBe("1");
    expect(res.getHeader("foo")).toBe("1");
  });

  it("set_header", () => {
    const res = Response.create();
    res.setHeader("Foo", "1");
    res.setHeader("Foo", "2");
    expect(res.hasHeader("Foo")).toBe(true);
    expect(res.getHeader("Foo")).toBe("2");
  });

  it("delete_header", () => {
    const res = Response.create();
    res.setHeader("Foo", "1");
    res.deleteHeader("Foo");
    expect(res.hasHeader("Foo")).toBe(false);
  });

  it.skip("add_header", () => {});
});

describe("ResponseIntegrationTest", () => {
  it.skip("response cache control from railsish app", () => {});

  it.skip("response cache control from rackish app", () => {});

  it.skip("response charset and content type from railsish app", () => {});

  it.skip("response charset and content type from rackish app", () => {});

  it.skip("strong ETag validator", () => {});

  it.skip("response Content-Type with optional parameters", () => {});

  it.skip("response Content-Type with optional parameters that set before charset", () => {});

  it.skip("response Content-Type with quoted-string", () => {});

  it.skip("response body with enumerator", () => {});

  it.skip("response body with lazy enumerator", () => {});
});
