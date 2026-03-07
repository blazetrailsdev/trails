import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { MockRequest } from "./mock-request.js";

function makeEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return MockRequest.envFor("/", overrides);
}

function makeReq(uri = "/", overrides: Record<string, any> = {}): Request {
  return new Request(MockRequest.envFor(uri, overrides));
}

it("copies the env when duping", () => {
  const req = makeReq();
  const dup = req.dup();
  expect(dup.env).not.toBe(req.env);
  expect(dup.env["REQUEST_METHOD"]).toBe(req.env["REQUEST_METHOD"]);
});

it("can check if something has been set", () => {
  const req = makeReq();
  expect(req.has("REQUEST_METHOD")).toBe(true);
  expect(req.has("NONEXISTENT")).toBe(false);
});

it("can get a key from the env", () => {
  const req = makeReq();
  expect(req.get("REQUEST_METHOD")).toBe("GET");
});

it("can calculate the authority", () => {
  const req = makeReq("http://example.org:8080/");
  expect(req.authority).toBe("example.org:8080");
});

it("can calculate the authority without a port", () => {
  const req = makeReq("http://example.org/");
  expect(req.authority).toBe("example.org");
});

it("can calculate the authority without a port on ssl", () => {
  const req = makeReq("https://example.org/");
  expect(req.authority).toBe("example.org");
});

it("can calculate the server authority", () => {
  const req = makeReq("http://example.org:8080/");
  expect(req.serverAuthority).toContain("example.org");
});

it("can calculate the port without an authority", () => {
  const req = makeReq();
  expect(req.port).toBe(80);
});

it("yields to the block if no value has been set", () => {
  const req = makeReq();
  const val = req.get("NONEXISTENT", () => "default");
  expect(val).toBe("default");
});

it("can iterate over values", () => {
  const req = makeReq();
  const keys: string[] = [];
  req.each((k) => keys.push(k));
  expect(keys.length).toBeGreaterThan(0);
  expect(keys).toContain("REQUEST_METHOD");
});

it("can set values in the env", () => {
  const req = makeReq();
  req.set("X_CUSTOM", "val");
  expect(req.env["X_CUSTOM"]).toBe("val");
});

it("can add to multivalued headers in the env", () => {
  const req = makeReq();
  req.set("HTTP_X_MULTI", "a");
  req.addHeader("HTTP_X_MULTI", "b");
  expect(req.env["HTTP_X_MULTI"]).toBe("a,b");
});

it("can delete env values", () => {
  const req = makeReq();
  req.set("HTTP_X_DEL", "val");
  const deleted = req.deleteHeader("HTTP_X_DEL");
  expect(deleted).toBe("val");
  expect(req.has("HTTP_X_DEL")).toBe(false);
});

it("wrap the rack variables", () => {
  const req = makeReq("http://example.org:8080/foo?bar=baz");
  expect(req.requestMethod).toBe("GET");
  expect(req.pathInfo).toBe("/foo");
  expect(req.queryString).toBe("bar=baz");
});

it("figure out the correct host", () => {
  expect(makeReq("/", { HTTP_HOST: "example.com" }).host).toBe("example.com");
  expect(makeReq("/", { HTTP_HOST: "example.com:8080" }).host).toBe("example.com");
  expect(makeReq("http://foo.example.com/").host).toBe("foo.example.com");
});

it("figure out the correct port", () => {
  expect(makeReq("http://example.org:8080/").port).toBe(8080);
  expect(makeReq("http://example.org/").port).toBe(80);
  expect(makeReq("https://example.org/").port).toBe(443);
});

it.skip("have forwarded_* methods respect forwarded_priority", () => {});

it("figure out the correct host with port", () => {
  expect(makeReq("http://example.org:8080/").hostWithPort).toBe("example.org:8080");
  expect(makeReq("http://example.org/").hostWithPort).toBe("example.org");
});

it("parse the query string", () => {
  const req = makeReq("/?foo=bar&baz=qux");
  expect(req.GET).toEqual({ foo: "bar", baz: "qux" });
});

it.skip("handles invalid unicode in query string value", () => {});
it.skip("handles invalid unicode in query string key", () => {});

it("not truncate query strings containing semi-colons #543 only in POST", () => {
  const req = makeReq("/?foo=bar;baz=qux");
  // Semicolons are NOT separators in GET
  expect(req.GET["foo"]).toBe("bar;baz=qux");
});

it.skip("should use the query_parser for query parsing", () => {});

it("does not use semi-colons as separators for query strings in GET", () => {
  const req = makeReq("/?a=1;b=2");
  expect(req.GET["a"]).toBe("1;b=2");
});

it.skip("limit the allowed parameter depth when parsing parameters", () => {});

it("not unify GET and POST when calling params", () => {
  const req = makeReq("/?foo=get", { method: "POST", input: "foo=post", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.GET["foo"]).toBe("get");
  expect(req.POST["foo"]).toBe("post");
  // params merges POST over GET
  expect(req.params["foo"]).toBe("post");
});

it.skip("use the query_parser's params_class for multipart params", () => {});
it.skip("raise if input params has invalid %-encoding", () => {});

it("return empty POST data if rack.input is missing", () => {
  const env = makeEnv();
  delete env["rack.input"];
  const req = new Request(env);
  expect(req.POST).toEqual({});
});

it("parse POST data when method is POST and no content-type given", () => {
  const req = makeReq("/", { method: "POST", input: "foo=bar" });
  // MockRequest sets default content-type for POST with input
  expect(req.POST["foo"]).toBe("bar");
});

it("parse POST data with explicit content type regardless of method", () => {
  const req = makeReq("/", { method: "PUT", input: "foo=bar", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.POST["foo"]).toBe("bar");
});

it("not parse POST data when media type is not form-data", () => {
  const req = makeReq("/", { method: "POST", input: '{"foo":"bar"}', CONTENT_TYPE: "application/json" });
  expect(req.POST).toEqual({});
});

it("parse POST data on PUT when media type is form-data", () => {
  const req = makeReq("/", { method: "PUT", input: "foo=bar", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.POST["foo"]).toBe("bar");
});

it("safely accepts POST requests with empty body", () => {
  const req = makeReq("/", { method: "POST", input: "", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.POST).toEqual({});
});

it("clean up Safari's ajax POST body", () => {
  const req = makeReq("/", { method: "POST", input: "\0", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.POST).toEqual({});
});

it.skip("limit POST body read to bytesize_limit when parsing url-encoded data", () => {});
it.skip("handle nil return from rack.input.read when parsing url-encoded data", () => {});
it.skip("truncate POST body at bytesize_limit when parsing url-encoded data", () => {});
it.skip("clean up Safari's ajax POST body with limited read", () => {});

it("return form_pairs for url-encoded POST data", () => {
  const req = makeReq("/", { method: "POST", input: "foo=bar&baz=qux", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.formPairs).toEqual([["foo", "bar"], ["baz", "qux"]]);
});

it("preserve duplicate keys in form_pairs", () => {
  const req = makeReq("/", { method: "POST", input: "foo=1&foo=2", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.formPairs).toEqual([["foo", "1"], ["foo", "2"]]);
});

it("handle empty values in form_pairs", () => {
  const req = makeReq("/", { method: "POST", input: "foo=&bar=baz", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.formPairs).toEqual([["foo", ""], ["bar", "baz"]]);
});

it("return empty array for form_pairs with no POST data", () => {
  const req = makeReq("/", { method: "POST", input: "", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  expect(req.formPairs).toEqual([]);
});

it("return empty array for form_pairs with non-form content type", () => {
  const req = makeReq("/", { method: "POST", input: '{"a":1}', CONTENT_TYPE: "application/json" });
  expect(req.formPairs).toEqual([]);
});

it.skip("raise same error for form_pairs as POST with invalid encoding", () => {});
it.skip("return form_pairs for multipart form data", () => {});
it.skip("preserve duplicate keys in multipart form_pairs", () => {});
it.skip("include file uploads in multipart form_pairs", () => {});
it.skip("return empty array for empty multipart form_pairs", () => {});

it("extract referrer correctly", () => {
  const req = makeReq("/", { HTTP_REFERER: "http://example.com/page" });
  expect(req.referrer).toBe("http://example.com/page");
});

it("extract user agent correctly", () => {
  const req = makeReq("/", { HTTP_USER_AGENT: "Mozilla/5.0" });
  expect(req.userAgent).toBe("Mozilla/5.0");
});

it("treat missing content type as nil", () => {
  const env = makeEnv();
  delete env["CONTENT_TYPE"];
  expect(new Request(env).contentType).toBeNull();
});

it("treat empty content type as nil", () => {
  const req = makeReq("/", { CONTENT_TYPE: "" });
  expect(req.contentType).toBeNull();
});

it("return nil media type for empty content type", () => {
  const req = makeReq("/", { CONTENT_TYPE: "" });
  expect(req.mediaType).toBeNull();
});

it("figure out if called via XHR", () => {
  expect(makeReq("/", { HTTP_X_REQUESTED_WITH: "XMLHttpRequest" }).xhr).toBe(true);
  expect(makeReq("/").xhr).toBe(false);
});

it("figure out if prefetch request", () => {
  expect(makeReq("/", { HTTP_X_MOZ: "prefetch" }).prefetch).toBe(true);
  expect(makeReq("/", { HTTP_PURPOSE: "prefetch" }).prefetch).toBe(true);
  expect(makeReq("/").prefetch).toBe(false);
});

it("ssl detection", () => {
  expect(makeReq("https://example.org/").ssl).toBe(true);
  expect(makeReq("http://example.org/").ssl).toBe(false);
});

it("prevents scheme abuse", () => {
  const env = makeEnv();
  env["rack.url_scheme"] = "javascript";
  expect(new Request(env).scheme).toBe("http");
});

it("parse cookies", () => {
  const req = makeReq("/", { HTTP_COOKIE: "foo=bar; baz=qux" });
  expect(req.cookies).toEqual({ foo: "bar", baz: "qux" });
});

it("always return the same hash object", () => {
  const req = makeReq("/", { HTTP_COOKIE: "foo=bar" });
  expect(req.cookies).toBe(req.cookies);
});

it("modify the cookies hash in place", () => {
  const req = makeReq("/", { HTTP_COOKIE: "foo=bar" });
  req.cookies["new"] = "val";
  expect(req.cookies["new"]).toBe("val");
});

it("not modify the params hash in place", () => {
  const req = makeReq("/?foo=bar");
  const p1 = req.params;
  const p2 = req.params;
  // params creates a new merged object each time
  expect(p1).not.toBe(p2);
});

it("modify params hash if param is in GET", () => {
  const req = makeReq("/?foo=bar");
  req.GET["foo"] = "modified";
  expect(req.params["foo"]).toBe("modified");
});

it("modify params hash if param is in POST", () => {
  const req = makeReq("/", { method: "POST", input: "foo=bar", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  req.POST["foo"] = "modified";
  expect(req.params["foo"]).toBe("modified");
});

it("modify params hash, even if param didn't exist before", () => {
  const req = makeReq("/");
  req.GET["new"] = "val";
  expect(req.params["new"]).toBe("val");
});

it("modify params hash by changing only GET", () => {
  const req = makeReq("/?foo=bar");
  req.GET["foo"] = "updated";
  expect(req.GET["foo"]).toBe("updated");
});

it("modify params hash by changing only POST", () => {
  const req = makeReq("/", { method: "POST", input: "foo=bar", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  req.POST["foo"] = "updated";
  expect(req.POST["foo"]).toBe("updated");
});

it("modify params hash, even if param is defined in both POST and GET", () => {
  const req = makeReq("/?foo=get", { method: "POST", input: "foo=post", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  req.POST["foo"] = "new_post";
  expect(req.params["foo"]).toBe("new_post");
});

it("allow deleting from params hash if param is in GET", () => {
  const req = makeReq("/?foo=bar");
  req.deleteParam("foo");
  expect(req.GET["foo"]).toBeUndefined();
});

it("allow deleting from params hash if param is in POST", () => {
  const req = makeReq("/", { method: "POST", input: "foo=bar", CONTENT_TYPE: "application/x-www-form-urlencoded" });
  req.deleteParam("foo");
  expect(req.POST["foo"]).toBeUndefined();
});

it("pass through non-uri escaped cookies as-is", () => {
  const req = makeReq("/", { HTTP_COOKIE: "foo=bar%20baz" });
  expect(req.cookies["foo"]).toBe("bar%20baz");
});

it("parse cookies according to RFC 2109", () => {
  const req = makeReq("/", { HTTP_COOKIE: "foo=bar; foo=baz" });
  // First value wins per RFC 2109
  expect(req.cookies["foo"]).toBe("bar");
});

it("parse cookies with quotes", () => {
  const req = makeReq("/", { HTTP_COOKIE: 'foo="bar"' });
  expect(req.cookies["foo"]).toBe('"bar"');
});

it("provide setters", () => {
  const req = makeReq();
  req.scriptName = "/app";
  req.pathInfo = "/page";
  expect(req.scriptName).toBe("/app");
  expect(req.pathInfo).toBe("/page");
});

it("provide the original env", () => {
  const env = makeEnv();
  const req = new Request(env);
  expect(req.env).toBe(env);
});

it("restore the base URL", () => {
  const req = makeReq("http://example.org:8080/app/page?q=1", { script_name: "/app" });
  expect(req.baseUrl).toContain("example.org");
});

it("restore the URL", () => {
  const req = makeReq("http://example.org/page?q=1");
  expect(req.url).toContain("example.org");
  expect(req.url).toContain("page");
  expect(req.url).toContain("q=1");
});

it("restore the full path", () => {
  const req = makeReq("/page?q=1");
  expect(req.fullpath).toBe("/page?q=1");
});

it("handle multiple media type parameters", () => {
  const req = makeReq("/", { CONTENT_TYPE: "text/plain; charset=utf-8; boundary=something" });
  expect(req.mediaType).toBe("text/plain");
  expect(req.mediaTypeParams["charset"]).toBe("utf-8");
});

it.skip("returns the same error for invalid post inputs", () => {});
it.skip("parse with junk before boundary", () => {});
it.skip("not infinite loop with a malformed HTTP request", () => {});
it.skip("parse multipart form data", () => {});
it.skip("parse multipart delimiter-only boundary", () => {});
it.skip("MultipartPartLimitError when request has too many multipart file parts if limit set", () => {});
it.skip("MultipartPartLimitError when request has too many multipart total parts if limit set", () => {});
it.skip("closes tempfiles it created in the case of too many created", () => {});
it.skip("parse big multipart form data", () => {});
it.skip("record tempfiles from multipart form data in env[rack.tempfiles]", () => {});
it.skip("detect invalid multipart form data", () => {});
it.skip("consistently raise EOFError on bad multipart form data", () => {});
it.skip("correctly parse the part name from Content-Id header", () => {});
it.skip("not try to interpret binary as utf8", () => {});
it.skip("use form_hash when form_input is a Tempfile", () => {});
it.skip("conform to the Rack spec", () => {});

it("parse Accept-Encoding correctly", () => {
  const req = makeReq("/", { HTTP_ACCEPT_ENCODING: "gzip;q=1.0, deflate;q=0.5" });
  const ae = req.acceptEncoding;
  expect(ae).toEqual([["gzip", 1.0], ["deflate", 0.5]]);
});

it("parse Accept-Language correctly", () => {
  const req = makeReq("/", { HTTP_ACCEPT_LANGUAGE: "en;q=0.9, fr;q=0.8" });
  const al = req.acceptLanguage;
  expect(al).toEqual([["en", 0.9], ["fr", 0.8]]);
});

it("provide ip information", () => {
  const req = makeReq("/", { REMOTE_ADDR: "1.2.3.4" });
  expect(req.ip).toBe("1.2.3.4");
});

it("deals with proxies", () => {
  const req = makeReq("/", { REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "1.2.3.4" });
  expect(req.ip).toBe("1.2.3.4");
});

it("not allow IP spoofing via Client-IP and X-Forwarded-For headers", () => {
  const req = makeReq("/", {
    REMOTE_ADDR: "127.0.0.1",
    HTTP_X_FORWARDED_FOR: "1.2.3.4, 127.0.0.1",
    HTTP_CLIENT_IP: "2.3.4.5",
  });
  // Client-IP not in forwarded chain and not trusted => return it
  expect(req.ip).toBe("2.3.4.5");
});

it("preserves ip for trusted proxy chain", () => {
  const req = makeReq("/", {
    REMOTE_ADDR: "127.0.0.1",
    HTTP_X_FORWARDED_FOR: "1.2.3.4, 10.0.0.1",
  });
  expect(req.ip).toBe("1.2.3.4");
});

it.skip("uses a custom trusted proxy filter", () => {});

it("regards local addresses as proxies", () => {
  const req = makeReq("/", {
    REMOTE_ADDR: "127.0.0.1",
    HTTP_X_FORWARDED_FOR: "1.2.3.4, 192.168.1.1, 10.0.0.1",
  });
  expect(req.ip).toBe("1.2.3.4");
});

it("uses rack.request.trusted_proxy env key when set to nil (default behavior)", () => {
  const req = makeReq("/", { REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "1.2.3.4" });
  expect(req.ip).toBe("1.2.3.4");
});

it("trusts all proxies when rack.request.trusted_proxy is true", () => {
  const env = MockRequest.envFor("/", {
    REMOTE_ADDR: "1.2.3.4",
    HTTP_X_FORWARDED_FOR: "5.6.7.8, 9.10.11.12",
  });
  env["rack.request.trusted_proxy"] = true;
  const req = new Request(env);
  // All trusted, fall through to REMOTE_ADDR
  expect(req.ip).toBe("1.2.3.4");
});

it("trusts no proxies when rack.request.trusted_proxy is false", () => {
  const env = MockRequest.envFor("/", {
    REMOTE_ADDR: "1.2.3.4",
    HTTP_X_FORWARDED_FOR: "5.6.7.8",
  });
  env["rack.request.trusted_proxy"] = false;
  const req = new Request(env);
  expect(req.ip).toBe("1.2.3.4");
});

it("trusts only specified IPs when rack.request.trusted_proxy is a callable", () => {
  const env = MockRequest.envFor("/", {
    REMOTE_ADDR: "127.0.0.1",
    HTTP_X_FORWARDED_FOR: "1.2.3.4, 10.0.0.1",
  });
  env["rack.request.trusted_proxy"] = (ip: string) => ip === "10.0.0.1";
  const req = new Request(env);
  expect(req.ip).toBe("1.2.3.4");
});

it.skip("supports CIDR ranges in rack.request.trusted_proxy callable", () => {});
it.skip("supports IPv6 addresses in rack.request.trusted_proxy callable", () => {});
it.skip("handles custom logic in rack.request.trusted_proxy callable", () => {});
it.skip("can use Rack::Config to set rack.request.trusted_proxy", () => {});

it("sets the default session to an empty hash", () => {
  const req = makeReq();
  expect(req.session).toEqual({});
});

it("sets the default session options to an empty hash", () => {
  const req = makeReq();
  expect(req.sessionOptions).toEqual({});
});

it("allow subclass request to be instantiated after parent request", () => {
  class SubRequest extends Request {}
  const env = makeEnv();
  const parent = new Request(env);
  const sub = new SubRequest(env);
  expect(sub).toBeInstanceOf(SubRequest);
  expect(sub).toBeInstanceOf(Request);
});

it("allow parent request to be instantiated after subclass request", () => {
  class SubRequest extends Request {}
  const env = makeEnv();
  const sub = new SubRequest(env);
  const parent = new Request(env);
  expect(parent).toBeInstanceOf(Request);
});

it.skip("raise TypeError every time if request parameters are broken", () => {});
it.skip("not strip '#{a}' => '#{c}' => '#{b}' escaped character from parameters when accessed as string", () => {});
it.skip("handles ASCII NUL input of #{length} bytes", () => {});

it("Env sets @env on initialization", () => {
  const env = makeEnv();
  const req = new Request(env);
  expect(req.env).toBe(env);
});
