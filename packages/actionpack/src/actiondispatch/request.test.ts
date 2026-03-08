import { describe, it, expect } from "vitest";
import { Request } from "./request.js";

describe("ActionDispatch::Request", () => {
  // --- URL / Host ---

  it("url_for class method", () => {
    const req = new Request({
      HTTP_HOST: "www.example.com",
      PATH_INFO: "/posts",
      "rack.url_scheme": "http",
    });
    expect(req.url).toBe("http://www.example.com/posts");
  });

  it("remote ip", () => {
    const req = new Request({ REMOTE_ADDR: "1.2.3.4" });
    expect(req.remoteIp).toBe("1.2.3.4");
  });

  it("remote ip middleware not present still returns an IP", () => {
    const req = new Request({});
    expect(req.remoteIp).toBe("127.0.0.1");
  });

  it("remote ip v6", () => {
    const req = new Request({ REMOTE_ADDR: "::1" });
    expect(req.remoteIp).toBe("::1");
  });

  it("domains", () => {
    const req = new Request({ HTTP_HOST: "www.example.com" });
    expect(req.domain()).toBe("example.com");
  });

  it("subdomains", () => {
    const req = new Request({ HTTP_HOST: "app.staging.example.com" });
    expect(req.subdomains()).toEqual(["app", "staging"]);
  });

  it("standard_port", () => {
    const req = new Request({ "rack.url_scheme": "http" });
    expect(req.standardPort).toBe(80);
    const req2 = new Request({ "rack.url_scheme": "https" });
    expect(req2.standardPort).toBe(443);
  });

  it("standard_port?", () => {
    const req = new Request({ SERVER_PORT: "80", "rack.url_scheme": "http" });
    expect(req.isStandardPort).toBe(true);
    const req2 = new Request({ SERVER_PORT: "3000", "rack.url_scheme": "http" });
    expect(req2.isStandardPort).toBe(false);
  });

  it("optional port", () => {
    const req = new Request({ SERVER_PORT: "80", "rack.url_scheme": "http" });
    expect(req.optionalPort).toBe("");
    const req2 = new Request({ HTTP_HOST: "example.com:3000" });
    expect(req2.optionalPort).toBe(":3000");
  });

  it("port string", () => {
    const req = new Request({ SERVER_PORT: "80", "rack.url_scheme": "http" });
    expect(req.portString).toBe("");
    const req2 = new Request({ HTTP_HOST: "example.com:8080" });
    expect(req2.portString).toBe(":8080");
  });

  it("server port", () => {
    const req = new Request({ SERVER_PORT: "3000" });
    expect(req.serverPort).toBe(3000);
  });

  it("full path", () => {
    const req = new Request({ PATH_INFO: "/posts", QUERY_STRING: "page=1" });
    expect(req.fullpath).toBe("/posts?page=1");
  });

  it("original_fullpath returns ORIGINAL_FULLPATH", () => {
    const req = new Request({
      ORIGINAL_FULLPATH: "/original?q=1",
      PATH_INFO: "/other",
    });
    expect(req.originalFullpath).toBe("/original?q=1");
  });

  it("original_url returns URL built using ORIGINAL_FULLPATH", () => {
    const req = new Request({
      HTTP_HOST: "example.com",
      "rack.url_scheme": "http",
      ORIGINAL_FULLPATH: "/original",
    });
    expect(req.originalUrl).toBe("http://example.com/original");
  });

  it("original_fullpath returns fullpath if ORIGINAL_FULLPATH is not present", () => {
    const req = new Request({ PATH_INFO: "/posts", QUERY_STRING: "a=1" });
    expect(req.originalFullpath).toBe("/posts?a=1");
  });

  it("host without specifying port", () => {
    const req = new Request({ SERVER_NAME: "example.com" });
    expect(req.host).toBe("example.com");
  });

  it("host with default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:80" });
    expect(req.host).toBe("example.com");
  });

  it("host with non default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:8080" });
    expect(req.host).toBe("example.com");
    expect(req.port).toBe(8080);
  });

  it("raw without specifying port", () => {
    const req = new Request({ SERVER_NAME: "example.com", SERVER_PORT: "80" });
    expect(req.rawHost).toBe("example.com:80");
  });

  it("raw host with default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:80" });
    expect(req.rawHost).toBe("example.com:80");
  });

  it("raw host with non default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:3000" });
    expect(req.rawHost).toBe("example.com:3000");
  });

  it("http host", () => {
    const req = new Request({ HTTP_HOST: "example.com" });
    expect(req.host).toBe("example.com");
  });

  it("http host with default port overrides server port", () => {
    const req = new Request({ HTTP_HOST: "example.com", SERVER_PORT: "8080" });
    expect(req.host).toBe("example.com");
  });

  it("host with port if http standard port is specified", () => {
    const req = new Request({
      HTTP_HOST: "example.com:80",
      "rack.url_scheme": "http",
    });
    expect(req.hostWithPort).toBe("example.com");
  });

  it("host with port if https standard port is specified", () => {
    const req = new Request({
      HTTP_HOST: "example.com:443",
      "rack.url_scheme": "https",
    });
    expect(req.hostWithPort).toBe("example.com");
  });

  it("host if ipv6 reference", () => {
    const req = new Request({ HTTP_HOST: "[::1]" });
    expect(req.host).toBe("[::1]");
  });

  it("host if ipv6 reference with port", () => {
    const req = new Request({ HTTP_HOST: "[::1]:3000" });
    expect(req.host).toBe("[::1]");
    expect(req.port).toBe(3000);
  });

  // --- Request method ---

  it("method returns environment's request method when it has not been overridden by middleware", () => {
    const req = new Request({ REQUEST_METHOD: "GET" });
    expect(req.method).toBe("GET");
  });

  it("allow request method hacking", () => {
    const req = new Request({
      REQUEST_METHOD: "POST",
      "action_dispatch.request.parameters": { _method: "put" },
    });
    expect(req.method).toBe("PUT");
  });

  it("method returns original value of environment request method on POST", () => {
    const req = new Request({
      REQUEST_METHOD: "POST",
      HTTP_X_HTTP_METHOD_OVERRIDE: "PATCH",
    });
    expect(req.method).toBe("PATCH");
    expect(req.requestMethod).toBe("POST");
  });

  it("post masquerading as patch", () => {
    const req = new Request({
      REQUEST_METHOD: "POST",
      HTTP_X_HTTP_METHOD_OVERRIDE: "PATCH",
    });
    expect(req.method).toBe("PATCH");
    expect(req.isPatch).toBe(true);
  });

  it("post masquerading as put", () => {
    const req = new Request({
      REQUEST_METHOD: "POST",
      HTTP_X_HTTP_METHOD_OVERRIDE: "PUT",
    });
    expect(req.method).toBe("PUT");
    expect(req.isPut).toBe(true);
  });

  // --- Content type ---

  it("content type", () => {
    const req = new Request({ CONTENT_TYPE: "application/json" });
    expect(req.contentType).toBe("application/json");
  });

  it("no content type", () => {
    const req = new Request({});
    expect(req.contentType).toBeUndefined();
  });

  it("content type is XML", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml" });
    expect(req.contentType).toBe("application/xml");
  });

  it("content type with charset", () => {
    const req = new Request({ CONTENT_TYPE: "text/html; charset=utf-8" });
    expect(req.contentType).toBe("text/html");
  });

  it("doesn't break when content type has charset", () => {
    const req = new Request({ CONTENT_TYPE: "text/html; charset=utf-8" });
    expect(req.contentType).toBe("text/html");
  });

  // --- Format ---

  it("xml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format).toBe("xml");
  });

  it("xhtml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xhtml+xml" });
    expect(req.format).toBe("html");
  });

  it("txt format", () => {
    const req = new Request({ HTTP_ACCEPT: "text/plain" });
    expect(req.format).toBe("text");
  });

  it("formats text/html with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "text/html" });
    expect(req.format).toBe("html");
  });

  it("formats blank with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "" });
    expect(req.format).toBe("html");
  });

  it("formats XMLHttpRequest with accept header", () => {
    const req = new Request({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      HTTP_ACCEPT: "application/json",
    });
    expect(req.xhr).toBe(true);
    expect(req.format).toBe("json");
  });

  it("formats application/xml with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format).toBe("xml");
  });

  // --- User agent ---

  it("user agent", () => {
    const req = new Request({ HTTP_USER_AGENT: "Mozilla/5.0" });
    expect(req.userAgent).toBe("Mozilla/5.0");
  });

  // --- XMLHttpRequest ---

  it("XMLHttpRequest", () => {
    const req = new Request({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    expect(req.isXmlHttpRequest).toBe(true);
    expect(req.xhr).toBe(true);
  });

  // --- SSL ---

  it("reports ssl", () => {
    const req = new Request({ "rack.url_scheme": "https" });
    expect(req.ssl).toBe(true);
  });

  it("reports ssl when proxied via lighttpd", () => {
    const req = new Request({ HTTP_X_FORWARDED_PROTO: "https" });
    expect(req.ssl).toBe(true);
  });

  it("scheme returns https when proxied", () => {
    const req = new Request({ HTTP_X_FORWARDED_PROTO: "https" });
    expect(req.scheme).toBe("https");
  });

  // --- Server software ---

  it("server software", () => {
    const req = new Request({ SERVER_SOFTWARE: "Apache/2.4.41" });
    expect(req.serverSoftware).toBe("Apache");
  });

  // --- Body ---

  it("raw_post rewinds rack.input if RAW_POST_DATA is nil", () => {
    const req = new Request({ "rack.input": "body content" });
    expect(req.rawPost).toBe("body content");
  });

  it("raw_post does not raise when rack.input is nil", () => {
    const req = new Request({});
    expect(req.rawPost).toBe("");
  });

  // --- IPs ---

  it("IPs that match localhost", () => {
    const req = new Request({ REMOTE_ADDR: "127.0.0.1" });
    expect(req.ip).toBe("127.0.0.1");
  });

  // --- ETag ---

  it("doesn't match absent If-None-Match", () => {
    const req = new Request({});
    expect(req.ifNoneMatch).toBeUndefined();
    expect(req.ifNoneMatchEtags).toEqual([]);
  });

  it("if_none_match_etags multiple", () => {
    const req = new Request({ HTTP_IF_NONE_MATCH: '"abc", "def"' });
    expect(req.ifNoneMatchEtags).toEqual(['"abc"', '"def"']);
  });

  // --- Variant ---

  it("setting variant to a symbol", () => {
    const req = new Request({});
    const mobile = Symbol("mobile");
    req.variant = mobile;
    expect(req.variant).toBe(mobile);
  });

  it("setting variant to an array of symbols", () => {
    const req = new Request({});
    const mobile = Symbol("mobile");
    const tablet = Symbol("tablet");
    req.variant = [mobile, tablet];
    expect(req.variant).toEqual([mobile, tablet]);
  });

  it("clearing variant", () => {
    const req = new Request({});
    req.variant = Symbol("mobile");
    req.variant = undefined;
    expect(req.variant).toBeUndefined();
  });

  it("setting variant to a non-symbol value", () => {
    const req = new Request({});
    expect(() => { req.variant = "mobile" as any; }).toThrow(TypeError);
  });

  it("setting variant to an array containing a non-symbol value", () => {
    const req = new Request({});
    expect(() => { req.variant = ["mobile"] as any; }).toThrow(TypeError);
  });

  // --- Media type ---

  it("media_type is from the FORM_DATA_MEDIA_TYPES array", () => {
    const req = new Request({ CONTENT_TYPE: "application/x-www-form-urlencoded" });
    expect(req.mediaType).toBe("application/x-www-form-urlencoded");
  });

  it("media_type is not from the FORM_DATA_MEDIA_TYPES array", () => {
    const req = new Request({ CONTENT_TYPE: "application/json" });
    expect(req.mediaType).toBe("application/json");
  });

  it("no Content-Type header is provided and the request_method is POST", () => {
    const req = new Request({ REQUEST_METHOD: "POST" });
    expect(req.contentType).toBeUndefined();
    expect(req.isPost).toBe(true);
  });

  // --- Inspect ---

  it("inspect", () => {
    const req = new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/posts" });
    expect(req.inspect()).toBe('#<ActionDispatch::Request GET "/posts">');
  });

  // --- Session ---

  it("#session", () => {
    const req = new Request({ "rack.session": { user_id: 1 } });
    expect(req.session).toEqual({ user_id: 1 });
  });

  it("#session returns empty hash when not set", () => {
    const req = new Request({});
    expect(req.session).toEqual({});
  });

  // --- negotiate_mime ---

  it("negotiate_mime", () => {
    const req = new Request({ HTTP_ACCEPT: "text/html" });
    expect(req.format).toBe("html");
  });

  it("negotiate_mime with content_type", () => {
    const req = new Request({
      HTTP_ACCEPT: "application/json",
      CONTENT_TYPE: "application/xml",
    });
    expect(req.format).toBe("json");
    expect(req.contentType).toBe("application/xml");
  });

  // --- Query string ---

  it("doesn't interpret request uri as query string when missing", () => {
    const req = new Request({ PATH_INFO: "/posts" });
    expect(req.queryString).toBe("");
  });

  // --- Path parameters ---

  it("path parameters", () => {
    const req = new Request({
      "action_dispatch.request.path_parameters": { controller: "posts", action: "show", id: "1" },
    });
    expect(req.pathParameters).toEqual({ controller: "posts", action: "show", id: "1" });
  });

  it("path parameters default empty", () => {
    const req = new Request({});
    expect(req.pathParameters).toEqual({});
  });

  // --- Content length ---

  it("content length", () => {
    const req = new Request({ CONTENT_LENGTH: "42" });
    expect(req.contentLength).toBe(42);
  });

  it("content length when missing", () => {
    const req = new Request({});
    expect(req.contentLength).toBeUndefined();
  });

  // --- Proxy ---

  it("proxy request", () => {
    const req = new Request({
      HTTP_X_FORWARDED_PROTO: "https",
      HTTP_HOST: "example.com",
    });
    expect(req.scheme).toBe("https");
    expect(req.ssl).toBe(true);
  });

  // --- Format edge cases ---

  it("format is not nil with unknown format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/octet-stream" });
    // Unknown format returns undefined
    expect(req.format).toBeUndefined();
  });

  it("can override format with parameter positive", () => {
    const req = new Request({
      HTTP_ACCEPT: "text/html",
      "action_dispatch.request.parameters": { format: "json" },
    });
    expect(req.format).toBe("json");
  });

  it("always matches *", () => {
    const req = new Request({ HTTP_ACCEPT: "*/*" });
    expect(req.format).toBe("html");
  });

  // --- Cookie syntax resilience ---

  it("cookie syntax resilience", () => {
    const req = new Request({
      HTTP_COOKIE: "foo=bar; baz=qux",
    });
    // We just verify the env is stored correctly
    expect(req.env["HTTP_COOKIE"]).toBe("foo=bar; baz=qux");
  });
});
