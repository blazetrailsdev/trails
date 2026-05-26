import { describe, it, expect } from "vitest";
import { Request, PassNotFound } from "../request.js";
import { MimeType } from "../http/mime-type.js";
import { X_CASCADE } from "../constants.js";

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

  it.skip("remote ip spoof detection", () => {}); // needs RemoteIp middleware
  it.skip("remote ip with spoof detection disabled", () => {}); // needs RemoteIp middleware
  it.skip("remote ip spoof protection ignores private addresses", () => {}); // needs RemoteIp middleware
  it.skip("remote ip v6 spoof detection", () => {}); // needs RemoteIp middleware
  it.skip("remote ip v6 spoof detection disabled", () => {}); // needs RemoteIp middleware
  it.skip("remote ip with user specified trusted proxies String", () => {}); // needs RemoteIp middleware
  it.skip("remote ip v6 with user specified trusted proxies String", () => {}); // needs RemoteIp middleware
  it.skip("remote ip with user specified trusted proxies Regexp", () => {}); // needs RemoteIp middleware
  it.skip("remote ip v6 with user specified trusted proxies Regexp", () => {}); // needs RemoteIp middleware
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

  it.skip("invalid http method raises exception", () => {}); // checkMethod not wired into requestMethod getter
  it.skip("method raises exception on invalid HTTP method", () => {}); // checkMethod not wired into method getter
  it.skip("exception on invalid HTTP method unaffected by I18n settings", () => {}); // no I18n
  it.skip("post uneffected by local inflections", () => {}); // no Inflector integration
  it.skip("delegates to Object#method if an argument is passed", () => {}); // TS getter cannot accept arguments
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

  it.skip("request_parameters raises BadRequest when content length lower than actual data length for a multipart request", () => {}); // needs Rack multipart parsing
  it.skip("request_parameters raises BadRequest when content length is higher than actual data length", () => {}); // needs Rack multipart parsing
});

describe("RequestFormat", () => {
  it("xml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format.symbol).toBe("xml");
  });

  it("xhtml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xhtml+xml" });
    expect(req.format.symbol).toBe("html");
  });

  it("txt format", () => {
    const req = new Request({ HTTP_ACCEPT: "text/plain" });
    expect(req.format.symbol).toBe("text");
  });

  it("formats text/html with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "text/html" });
    expect(req.format.symbol).toBe("html");
  });

  it("formats blank with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "" });
    expect(req.format.symbol).toBe("html");
  });

  it("formats XMLHttpRequest with accept header", () => {
    const req = new Request({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      HTTP_ACCEPT: "application/json",
    });
    expect(req.xhr).toBe(true);
    expect(req.format.symbol).toBe("json");
  });

  it("formats application/xml with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format.symbol).toBe("xml");
  });

  it("XMLHttpRequest", () => {
    const req = new Request({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    expect(req.isXmlHttpRequest).toBe(true);
    expect(req.xhr).toBe(true);
  });

  it("format is not nil with unknown format", () => {
    // Rails: stub_request("QUERY_STRING" => "format=hello") + assert_nil request.format.
    // Unknown format extension yields an empty `formats` array → NullType.instance,
    // whose `.symbol` is null and `.nil?` is true.
    const req = new Request({ QUERY_STRING: "format=hello" });
    expect(req.format.symbol).toBeNull();
  });

  it("can override format with parameter positive", () => {
    const req = new Request({
      HTTP_ACCEPT: "text/html",
      "action_dispatch.request.parameters": { format: "json" },
    });
    expect(req.format.symbol).toBe("json");
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

  it("can override format with parameter negative", () => {
    const req = new Request({ QUERY_STRING: "format=txt" });
    expect(req.format.symbol).not.toBe("xml");
  });

  it("formats format:text with accept header", () => {
    const req = new Request({ QUERY_STRING: "format=txt" });
    expect(req.formats.map((m) => m.symbol)).toEqual(["text"]);
  });

  it("formats format:unknown with accept header", () => {
    const req = new Request({ QUERY_STRING: "format=unknown" });
    expect(req.format.symbol).toBeNull();
  });

  it.skip("format does not throw exceptions when malformed GET parameters", () => {}); // ParameterTypeError not caught in formats path
  it.skip("format does not throw exceptions when invalid POST parameters", () => {}); // needs Rack body parsing

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

  it("xml http request", () => {
    const req1 = new Request({});
    expect(req1.isXmlHttpRequest).toBe(false);
    expect(req1.xhr).toBe(false);

    const req2 = new Request({ HTTP_X_REQUESTED_WITH: "DefinitelyNotAjax1.0" });
    expect(req2.isXmlHttpRequest).toBe(false);
    expect(req2.xhr).toBe(false);

    const req3 = new Request({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    expect(req3.isXmlHttpRequest).toBe(true);
    expect(req3.xhr).toBe(true);
  });
});

describe("RequestRewind", () => {
  it("raw_post rewinds rack.input if RAW_POST_DATA is nil", () => {
    const req = new Request({ "rack.input": "body content" });
    expect(req.rawPost).toBe("body content");
  });

  it.skip("body should be rewound", () => {}); // Rack < 3 only
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

  it.skip("parameters", () => {}); // needs Rack body parsing (JSON POST + query merge)
  it.skip("parameters not accessible after rack parse error", () => {}); // needs Rack parse error path
  it.skip("path parameters with invalid UTF8 encoding", () => {}); // needs encoding validation
  it.skip("path parameters don't re-encode frozen strings", () => {}); // needs CustomParamEncoder
  it.skip("parameters containing an invalid UTF8 character", () => {}); // needs encoding validation
  it.skip("parameters containing a deeply nested invalid UTF8 character", () => {}); // needs encoding validation
  it.skip("POST parameters containing invalid UTF8 character", () => {}); // needs Rack body parsing
  it.skip("query parameters specified as ASCII_8BIT encoded do not raise InvalidParameterError", () => {}); // needs CustomParamEncoder
  it.skip("POST parameters specified as ASCII_8BIT encoded do not raise InvalidParameterError", () => {}); // needs CustomParamEncoder
  it.skip("parameters not accessible after rack parse error 1", () => {}); // needs Rack body parsing
  it.skip("we have access to the original exception", () => {}); // needs Rack parse error path
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
    // Rails: stub_request("HTTP_IF_NONE_MATCH" => "*") then etag_matches?("\"strong\"") etc.
    // The previous body tested `req.format` with HTTP_ACCEPT="*/*" — unrelated to
    // the Rails test of the same name (request_test.rb:1297-1306).
    const req = new Request({ HTTP_IF_NONE_MATCH: "*" });
    expect(req.ifNoneMatch).toBe("*");
    expect(req.ifNoneMatchEtags).toEqual(["*"]);
    expect(req.etagMatches('"strong"')).toBe(true);
    expect(req.etagMatches('W/"weak"')).toBe(true);
    expect(req.etagMatches(undefined)).toBe(false);
  });

  it("matches opaque ETag validators without unquoting", () => {
    const header = '"the-etag"';
    const req = new Request({ HTTP_IF_NONE_MATCH: header });

    expect(req.ifNoneMatch).toBe(header);
    expect(req.ifNoneMatchEtags).toEqual(['"the-etag"']);

    expect(req.etagMatches('"the-etag"')).toBe(true);
    expect(req.etagMatches("the-etag")).toBe(false);
  });
});

describe("RequestVariant", () => {
  it("setting variant to a symbol", () => {
    const req = new Request({});
    req.variant = "phone";
    expect(req.variant.phone()).toBe(true);
    expect(req.variant.tablet()).toBe(false);
    expect(req.variant.any("phone", "tablet")).toBe(true);
    expect(req.variant.any("tablet", "desktop")).toBe(false);
  });

  it("setting variant to an array of symbols", () => {
    const req = new Request({});
    req.variant = ["phone", "tablet"];
    expect(req.variant.phone()).toBe(true);
    expect(req.variant.tablet()).toBe(true);
    expect(req.variant.desktop()).toBe(false);
    expect(req.variant.any("tablet", "desktop")).toBe(true);
    expect(req.variant.any("desktop", "watch")).toBe(false);
  });

  it("clearing variant", () => {
    const req = new Request({});
    req.variant = null;
    expect(req.variant.length).toBe(0);
    expect(req.variant.phone()).toBe(false);
    expect(req.variant.any("phone", "tablet")).toBe(false);
  });

  it("setting variant to a non-symbol value", () => {
    const req = new Request({});
    expect(() => {
      req.variant = 123 as any;
    }).toThrow();
  });

  it("setting variant to an array containing a non-symbol value", () => {
    const req = new Request({});
    expect(() => {
      req.variant = ["phone", 123] as any;
    }).toThrow();
  });
});

describe("RequestFormData", () => {
  it("media_type is from the FORM_DATA_MEDIA_TYPES array", () => {
    expect(new Request({ CONTENT_TYPE: "application/x-www-form-urlencoded" }).isFormData).toBe(
      true,
    );
    expect(new Request({ CONTENT_TYPE: "multipart/form-data" }).isFormData).toBe(true);
  });

  it("media_type is not from the FORM_DATA_MEDIA_TYPES array", () => {
    expect(new Request({ CONTENT_TYPE: "application/xml" }).isFormData).toBe(false);
    expect(new Request({ CONTENT_TYPE: "multipart/related" }).isFormData).toBe(false);
  });

  it("no Content-Type header is provided and the request_method is POST", () => {
    const req = new Request({ REQUEST_METHOD: "POST" });
    expect(req.mediaType).toBeUndefined();
    expect(req.requestMethod).toBe("POST");
    expect(req.isFormData).toBe(false);
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
      HTTP_COOKIE: "_session_id=c84ace84796670c052c6ceb2451fb0f2; is_admin=yes",
    });
    expect(req.cookies["_session_id"]).toBe("c84ace84796670c052c6ceb2451fb0f2");
    expect(req.cookies["is_admin"]).toBe("yes");
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

describe("RequestContentSecurityPolicy", () => {
  it("reads and writes the policy under the env header", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicy).toBeUndefined();
    const policy = { build: () => "default-src 'self'" };

    req.contentSecurityPolicy = policy as any;
    expect(req.env["action_dispatch.content_security_policy"]).toBe(policy);
    expect(req.contentSecurityPolicy).toBe(policy);
  });

  it("reportOnly toggles the report-only env flag", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyReportOnly).toBeUndefined();
    req.contentSecurityPolicyReportOnly = true;
    expect(req.contentSecurityPolicyReportOnly).toBe(true);
  });

  it("nonce is undefined without a generator and memoizes on read", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyNonce).toBeUndefined();
    let calls = 0;
    req.contentSecurityPolicyNonceGenerator = () => `nonce-${++calls}`;
    expect(req.contentSecurityPolicyNonce).toBe("nonce-1");
    expect(req.contentSecurityPolicyNonce).toBe("nonce-1");
  });

  it("nonce directives default to undefined and round-trip arrays", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyNonceDirectives).toBeUndefined();
    req.contentSecurityPolicyNonceDirectives = ["script-src"];
    expect(req.contentSecurityPolicyNonceDirectives).toEqual(["script-src"]);
  });

  it("null assignments persist as null on the env (matches Rails setter)", () => {
    const req = new Request({});
    req.contentSecurityPolicyNonceGenerator = null;
    expect(req.env["action_dispatch.content_security_policy_nonce_generator"]).toBeNull();
    expect(req.contentSecurityPolicyNonceGenerator).toBeNull();
  });
});

describe("RequestControllerClass", () => {
  it("controllerClassFor returns PassNotFound when name is absent", () => {
    const req = new Request({});
    expect(req.controllerClassFor(null)).toBe(PassNotFound);
    expect(req.controllerClassFor(undefined)).toBe(PassNotFound);
  });

  it("controllerClassFor throws when a controller name is supplied", () => {
    const req = new Request({});
    expect(() => req.controllerClassFor("posts")).toThrow(/no global controller constant table/);
  });

  it("controllerClass defaults action to 'index' and returns PassNotFound without a controller", () => {
    const req = new Request({});
    expect(req.controllerClass()).toBe(PassNotFound);
    expect(req.pathParameters["action"]).toBe("index");
  });

  it("PassNotFound.call returns 404 with x-cascade pass", async () => {
    const [status, headers, body] = PassNotFound.call({});
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
    const chunks: unknown[] = [];
    for await (const c of body) chunks.push(c);
    expect(chunks).toEqual([]);
  });

  it("PassNotFound.action returns the sentinel itself", () => {
    expect(PassNotFound.action("show")).toBe(PassNotFound);
    expect(PassNotFound.actionEncodingTemplate("show")).toBe(false);
  });
});

describe("RequestParametersList", () => {
  it("returns rack.request.form_pairs verbatim when present", () => {
    const pairs: Array<[string, unknown]> = [["a", "1"]];
    const req = new Request({ "rack.request.form_pairs": pairs });
    expect(req.requestParametersList()).toBe(pairs);
  });

  it("parses rack.request.form_vars via QueryParser.eachPair", () => {
    const req = new Request({ "rack.request.form_vars": "a=1&b=2" });
    expect(req.requestParametersList()).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("returns [] when no body has been parsed", () => {
    const req = new Request({});
    expect(req.requestParametersList()).toEqual([]);
  });
});

describe("RequestPermissionsPolicy", () => {
  it("round-trips through the env header", () => {
    const req = new Request({});
    expect(req.permissionsPolicy).toBeUndefined();
    const policy = { build: () => "geolocation=()" };

    req.permissionsPolicy = policy as any;
    expect(req.env["action_dispatch.permissions_policy"]).toBe(policy);
    expect(req.permissionsPolicy).toBe(policy);
  });
});

describe("RequestCGI", () => {
  it("CGI environment variables", () => {
    const req = new Request({
      HTTP_ACCEPT: "*/*",
      HTTP_ACCEPT_CHARSET: "UTF-8",
      HTTP_ACCEPT_ENCODING: "gzip, deflate",
      HTTP_ACCEPT_LANGUAGE: "en",
      HTTP_CACHE_CONTROL: "no-cache, max-age=0",
      HTTP_FROM: "googlebot",
      HTTP_HOST: "glu.ttono.us:8007",
      HTTP_NEGOTIATE: "trans",
      HTTP_PRAGMA: "no-cache",
      HTTP_REFERER: "http://www.google.com/search?q=glu.ttono.us",
      HTTP_USER_AGENT: "Mozilla/5.0 (Macintosh; U; PPC Mac OS X; en)",
      PATH_INFO: "/homepage/",
      PATH_TRANSLATED: "/home/kevinc/sites/typo/public/homepage/",
      QUERY_STRING: "",
      REMOTE_ADDR: "207.7.108.53",
      REMOTE_HOST: "google.com",
      REMOTE_IDENT: "kevin",
      REMOTE_USER: "kevin",
      REQUEST_METHOD: "GET",
      SCRIPT_NAME: "/dispatch.fcgi",
      SERVER_NAME: "glu.ttono.us",
      SERVER_PORT: "8007",
      SERVER_PROTOCOL: "HTTP/1.1",
      SERVER_SOFTWARE: "lighttpd/1.4.5",
    });

    expect(req.accept).toBe("*/*");
    expect(req.getHeader("Accept-Charset")).toBe("UTF-8");
    expect(req.getHeader("Accept-Encoding")).toBe("gzip, deflate");
    expect(req.getHeader("Accept-Language")).toBe("en");
    expect(req.getHeader("Cache-Control")).toBe("no-cache, max-age=0");
    expect(req.getHeader("From")).toBe("googlebot");
    expect(req.host).toBe("glu.ttono.us");
    expect(req.getHeader("Negotiate")).toBe("trans");
    expect(req.getHeader("Pragma")).toBe("no-cache");
    expect(req.getHeader("Referer")).toBe("http://www.google.com/search?q=glu.ttono.us");
    expect(req.userAgent).toBe("Mozilla/5.0 (Macintosh; U; PPC Mac OS X; en)");
    expect(req.env["PATH_INFO"]).toBe("/homepage/");
    expect(req.env["PATH_TRANSLATED"]).toBe("/home/kevinc/sites/typo/public/homepage/");
    expect(req.queryString).toBe("");
    expect(req.env["REMOTE_ADDR"]).toBe("207.7.108.53");
    expect(req.env["REMOTE_HOST"]).toBe("google.com");
    expect(req.env["REMOTE_IDENT"]).toBe("kevin");
    expect(req.env["REMOTE_USER"]).toBe("kevin");
    expect(req.requestMethod).toBe("GET");
    expect(req.env["SCRIPT_NAME"]).toBe("/dispatch.fcgi");
    expect(req.env["SERVER_NAME"]).toBe("glu.ttono.us");
    expect(req.serverPort).toBe(8007);
    expect(req.env["SERVER_PROTOCOL"]).toBe("HTTP/1.1");
    expect(req.serverSoftware).toBe("lighttpd");
  });
});

describe("RequestParameterFilter", () => {
  it("filtered_parameters returns params filtered", () => {
    const req = new Request({
      "action_dispatch.request.parameters": {
        lifo: "Pratik",
        amount: "420",
        step: "1",
      },
      "action_dispatch.parameter_filter": ["lifo", "amount"],
    });

    const params = req.filteredParameters();
    expect(params["lifo"]).toBe("[FILTERED]");
    expect(params["amount"]).toBe("[FILTERED]");
    expect(params["step"]).toBe("1");
  });

  it("filtered_env filters env as a whole", () => {
    const req = new Request({
      "action_dispatch.request.parameters": {
        amount: "420",
        step: "1",
      },
      RAW_POST_DATA: "yada yada",
      "action_dispatch.parameter_filter": ["lifo", "amount"],
    });
    const filtered = req.filteredEnv();
    const req2 = new Request(filtered);

    expect(req2.rawPost).toBe("[FILTERED]");
    expect(req2.params["amount"]).toBe("[FILTERED]");
    expect(req2.params["step"]).toBe("1");
  });

  it("filtered_path returns path with filtered query string", () => {
    for (const sep of [";", "&"]) {
      const req = new Request({
        QUERY_STRING: ["username=sikachu", "secret=bd4f21f", "api_key=b1bc3b3cd352f68d79d7"].join(
          sep,
        ),
        PATH_INFO: "/authenticate",
        "action_dispatch.parameter_filter": ["secret", "api_key"],
      });

      const path = req.filteredPath();
      expect(path).toBe(
        `/authenticate?username=sikachu${sep}secret=[FILTERED]${sep}api_key=[FILTERED]`,
      );
    }
  });

  it("filtered_path should not unescape a genuine '[FILTERED]' value", () => {
    const req = new Request({
      QUERY_STRING: "secret=bd4f21f&genuine=%5BFILTERED%5D",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = req.filteredPath();
    expect(path).toContain("secret=[FILTERED]");
    expect(path).toContain("genuine=%5BFILTERED%5D");
  });

  it("filtered_path should preserve duplication of keys in query string", () => {
    const req = new Request({
      QUERY_STRING: "username=sikachu&secret=bd4f21f&username=fxn",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = req.filteredPath();
    expect(path).toContain("username=sikachu");
    expect(path).toContain("secret=[FILTERED]");
    expect(path).toContain("username=fxn");
  });

  it("filtered_path should ignore searchparts", () => {
    const req = new Request({
      QUERY_STRING: "secret",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = req.filteredPath();
    expect(path).toContain("secret");
  });

  it("parameter_filter returns the same instance of ActiveSupport::ParameterFilter", () => {
    const req = new Request({
      "action_dispatch.parameter_filter": ["secret"],
    });

    const filter = req.parameterFilter();
    expect(filter.filter({ secret: "foo", something: "bar" })).toEqual({
      secret: "[FILTERED]",
      something: "bar",
    });
    expect(req.parameterFilter()).toBe(filter);
  });
});

describe("EarlyHintsRequestTest", () => {
  it("when early hints is set in the env link headers are sent", () => {
    let received: Record<string, string> | undefined;
    const req = new Request({
      "rack.early_hints": (links: Record<string, string>) => {
        received = links;
      },
    });

    req.sendEarlyHints({
      link: "</style.css>; rel=preload; as=style,</script.js>; rel=preload",
    });
    expect(received).toEqual({
      link: "</style.css>; rel=preload; as=style,</script.js>; rel=preload",
    });
  });
});
