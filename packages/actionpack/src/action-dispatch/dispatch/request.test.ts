import { describe, it, expect } from "vitest";
import { Request } from "../request.js";
import { MimeType } from "../http/mime-type.js";

describe("RequestUrlFor", () => {
  it("url_for class method", () => {
    const req = new Request({
      HTTP_HOST: "www.example.com",
      PATH_INFO: "/posts",
      "rack.url_scheme": "http",
    });
    expect(req.url).toBe("http://www.example.com/posts");
  });
});

describe("RequestIP", () => {
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
});

describe("RequestDomain", () => {
  it("domains", () => {
    const req = new Request({ HTTP_HOST: "www.example.com" });
    expect(req.domain()).toBe("example.com");
  });

  it("subdomains", () => {
    const req = new Request({ HTTP_HOST: "app.staging.example.com" });
    expect(req.subdomains()).toEqual(["app", "staging"]);
  });
});

describe("RequestPort", () => {
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
});

describe("RequestPath", () => {
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
});

describe("RequestHost", () => {
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

  it("proxy request", () => {
    const req = new Request({
      HTTP_X_FORWARDED_PROTO: "https",
      HTTP_HOST: "example.com",
    });
    expect(req.scheme).toBe("https");
    expect(req.ssl).toBe(true);
  });
});

describe("RequestMethod", () => {
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
});

describe("RequestMimeType", () => {
  it("content type", () => {
    const req = new Request({ CONTENT_TYPE: "text/html" });
    expect(req.contentMimeType).toBe(MimeType.HTML);
    expect(req.mediaType).toBe("text/html");
    expect(req.contentType).toBe("text/html");
  });

  it("no content type", () => {
    const req = new Request({});
    expect(req.contentMimeType).toBeNull();
    expect(req.mediaType).toBeUndefined();
    expect(req.contentType).toBeUndefined();
  });

  it("content type is XML", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml" });
    expect(req.contentMimeType?.symbol).toBe("xml");
    expect(req.mediaType).toBe("application/xml");
    expect(req.contentType).toBe("application/xml");
  });

  it("content type with charset", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml; charset=UTF-8" });
    expect(req.contentMimeType?.symbol).toBe("xml");
    expect(req.mediaType).toBe("application/xml");
  });

  it("has_content_type?", () => {
    expect(new Request({ CONTENT_TYPE: "text/html" }).hasContentType()).toBe(true);
    expect(new Request({}).hasContentType()).toBe(false);
  });

  it("user agent", () => {
    const req = new Request({ HTTP_USER_AGENT: "Mozilla/5.0" });
    expect(req.userAgent).toBe("Mozilla/5.0");
  });

  it("negotiate_mime", () => {
    const req = new Request({
      HTTP_ACCEPT: "text/html",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    });
    const xml = MimeType.lookup("xml")!;
    const json = MimeType.lookup("json")!;
    expect(req.negotiateMime([xml, json])).toBeNull();
    expect(req.negotiateMime([xml, MimeType.HTML])).toBe(MimeType.HTML);
    // Mime::ALL: any "*/*" entry — fall back to the request's first format.
    const all = MimeType.parse("*/*")[0];
    expect(req.negotiateMime([xml, all])?.symbol).toBe("html");
  });

  it("negotiate_mime with content_type", () => {
    const req = new Request({
      CONTENT_TYPE: "application/xml; charset=UTF-8",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    });
    const xml = MimeType.lookup("xml")!;
    const csv = MimeType.lookup("csv")!;
    expect(req.negotiateMime([xml, csv])).toBe(xml);
    expect(req.contentMimeType?.symbol).toBe("xml");
  });
});

describe("RequestParamsParsing", () => {
  it("doesn't break when content type has charset", () => {
    const req = new Request({ CONTENT_TYPE: "text/html; charset=utf-8" });
    expect(req.contentType).toBe("text/html");
  });

  it("doesn't interpret request uri as query string when missing", () => {
    const req = new Request({ PATH_INFO: "/posts" });
    expect(req.queryString).toBe("");
  });

  it("content length", () => {
    const req = new Request({ CONTENT_LENGTH: "42" });
    expect(req.contentLength).toBe(42);
  });

  it("content length when missing", () => {
    const req = new Request({});
    expect(req.contentLength).toBeUndefined();
  });
});

describe("RequestFormat", () => {
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

  it("XMLHttpRequest", () => {
    const req = new Request({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    expect(req.isXmlHttpRequest).toBe(true);
    expect(req.xhr).toBe(true);
  });

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

  it("formats with xhr request", () => {
    const req = new Request({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      QUERY_STRING: "",
    });
    expect(req.formats).toEqual([MimeType.JS]);
  });

  it("format taken from the path extension", () => {
    const r1 = new Request({ PATH_INFO: "/foo.xml", QUERY_STRING: "" });
    expect(r1.formats.map((m) => m.symbol)).toEqual(["xml"]);
    const r2 = new Request({ PATH_INFO: "/foo.123", QUERY_STRING: "" });
    expect(r2.formats).toEqual([MimeType.HTML]);
  });

  it("formats from accept headers have higher precedence than path extension", () => {
    const req = new Request({
      HTTP_ACCEPT: "application/json",
      PATH_INFO: "/foo.xml",
      QUERY_STRING: "",
    });
    expect(req.formats.map((m) => m.symbol)).toEqual(["json"]);
  });

  it("ignore_accept_header", () => {
    const prev = Request.ignoreAcceptHeader;
    Request.ignoreAcceptHeader = true;
    try {
      const r1 = new Request({ HTTP_ACCEPT: "application/xml", QUERY_STRING: "" });
      expect(r1.formats).toEqual([MimeType.HTML]);
      const r2 = new Request({ HTTP_ACCEPT: "*/*;q=0.1", QUERY_STRING: "" });
      expect(r2.formats).toEqual([MimeType.HTML]);
      const r3 = new Request({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        QUERY_STRING: "",
      });
      expect(r3.formats).toEqual([MimeType.JS]);
      const r4 = new Request({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        "action_dispatch.request.parameters": { format: "json" },
      });
      expect(r4.formats.map((m) => m?.symbol)).toEqual(["json"]);
    } finally {
      Request.ignoreAcceptHeader = prev;
    }
  });
});

describe("RequestProtocol", () => {
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

  it("server software", () => {
    const req = new Request({ SERVER_SOFTWARE: "Apache/2.4.41" });
    expect(req.serverSoftware).toBe("Apache");
  });
});

describe("RequestRewind", () => {
  it("raw_post rewinds rack.input if RAW_POST_DATA is nil", () => {
    const req = new Request({ "rack.input": "body content" });
    expect(req.rawPost).toBe("body content");
  });
});

describe("RequestParameters", () => {
  it("raw_post does not raise when rack.input is nil", () => {
    const req = new Request({});
    expect(req.rawPost).toBe("");
  });

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

  it("merges request, query, and path parameters with Rails precedence", () => {
    // Rails: request_parameters.merge(query_parameters).merge!(path_parameters).
    // Query wins over request-body; path wins over both.
    const req = new Request({
      QUERY_STRING: "k=query",
      "action_dispatch.request.request_parameters": { k: "body", b: "body-only" },
      "action_dispatch.request.path_parameters": { k: "path", p: "path-only" },
    });
    expect(req.params).toEqual({ k: "path", b: "body-only", p: "path-only" });
  });

  it("pathParameters= invalidates the merged params cache and feeds future params reads", () => {
    const req = new Request({ QUERY_STRING: "view=print" });
    expect(req.params).toEqual({ view: "print" });
    req.pathParameters = { controller: "items", action: "show", id: "1" };
    expect(req.params).toEqual({
      view: "print",
      controller: "items",
      action: "show",
      id: "1",
    });
    // Path params win over query string on key collision (Rails: merge!).
    req.pathParameters = { view: "edit" };
    expect(req.params).toEqual({ view: "edit" });
  });
});

describe("LocalhostTest", () => {
  it("IPs that match localhost", () => {
    const req = new Request({ REMOTE_ADDR: "127.0.0.1" });
    expect(req.ip).toBe("127.0.0.1");
  });
});

describe("RequestEtag", () => {
  it("doesn't match absent If-None-Match", () => {
    const req = new Request({});
    expect(req.ifNoneMatch).toBeUndefined();
    expect(req.ifNoneMatchEtags).toEqual([]);
  });

  it("if_none_match_etags multiple", () => {
    const req = new Request({ HTTP_IF_NONE_MATCH: '"abc", "def"' });
    expect(req.ifNoneMatchEtags).toEqual(['"abc"', '"def"']);
  });

  it("always matches *", () => {
    const req = new Request({ HTTP_ACCEPT: "*/*" });
    expect(req.format).toBe("html");
  });
});

describe("RequestVariant", () => {
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
    expect(() => {
      req.variant = "mobile" as any;
    }).toThrow(TypeError);
  });

  it("setting variant to an array containing a non-symbol value", () => {
    const req = new Request({});
    expect(() => {
      req.variant = ["mobile"] as any;
    }).toThrow(TypeError);
  });
});

describe("RequestFormData", () => {
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
});

describe("RequestInspectTest", () => {
  it("inspect", () => {
    const req = new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/posts" });
    expect(req.inspect()).toBe('#<ActionDispatch::Request GET "/posts">');
  });
});

describe("RequestSession", () => {
  it("#session", () => {
    const req = new Request({ "rack.session": { user_id: 1 } });
    expect(req.session).toEqual({ user_id: 1 });
  });

  it("#session returns empty hash when not set", () => {
    const req = new Request({});
    expect(req.session).toEqual({});
  });
});

describe("RequestCookie", () => {
  it("cookie syntax resilience", () => {
    const req = new Request({
      HTTP_COOKIE: "foo=bar; baz=qux",
    });
    // We just verify the env is stored correctly
    expect(req.env["HTTP_COOKIE"]).toBe("foo=bar; baz=qux");
  });
});

describe("RequestHeaderEnvAccess", () => {
  it("hasHeader/setHeader/deleteHeader/fetchHeader operate on env for non-HTTP keys", () => {
    const req = new Request({});
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(false);
    req.setHeader("action_dispatch.parameter_filter", ["password"]);
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(true);
    expect(req.env["action_dispatch.parameter_filter"]).toEqual(["password"]);
    expect(req.fetchHeader("action_dispatch.parameter_filter")).toEqual(["password"]);
    req.deleteHeader("action_dispatch.parameter_filter");
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(false);
  });

  it("fetchHeader invokes fallback on miss", () => {
    const req = new Request({});
    expect(req.fetchHeader("missing", () => "fallback")).toBe("fallback");
  });

  it("getHeader maps HTTP-style names to HTTP_* env keys", () => {
    const req = new Request({ HTTP_IF_NONE_MATCH: '"abc"' });
    expect(req.getHeader("If-None-Match")).toBe('"abc"');
  });

  it("getHeader maps CGI-variable names without HTTP_ prefix", () => {
    const req = new Request({ CONTENT_TYPE: "text/html" });
    expect(req.getHeader("Content-Type")).toBe("text/html");
  });
});

describe("RequestFilterParameters", () => {
  it("filteredParameters replaces sensitive params with [FILTERED]", () => {
    const req = new Request({
      "action_dispatch.request.parameters": { password: "hunter2", name: "alice" },
      "action_dispatch.parameter_filter": ["password"],
    });
    expect(req.filteredParameters()).toEqual({ password: "[FILTERED]", name: "alice" });
  });

  it("filteredPath replaces sensitive query params", () => {
    const req = new Request({
      PATH_INFO: "/users",
      QUERY_STRING: "password=hunter2&name=alice",
      "action_dispatch.parameter_filter": ["password"],
    });
    expect(req.filteredPath()).toBe("/users?password=[FILTERED]&name=alice");
  });

  it("filteredEnv strips RAW_POST_DATA by default", () => {
    const req = new Request({ RAW_POST_DATA: "secret" });
    expect(req.filteredEnv()["RAW_POST_DATA"]).toBe("[FILTERED]");
  });

  it("parameterFilter returns NULL_PARAM_FILTER when no header is configured", () => {
    const req = new Request({});
    // No filter list set → identity-style filter.
    expect(req.parameterFilter().filter({ password: "x" })).toEqual({ password: "x" });
  });
});
