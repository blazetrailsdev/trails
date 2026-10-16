import { afterEach, describe, it, expect } from "vitest";
import { Request } from "../http/request.js";
import { emptyRackBody } from "../http/request.js";
import { Session } from "../request/session.js";
import { Mime, MimeType } from "../http/mime-type.js";
import { BadRequest, UnknownHttpMethod } from "../../action-controller/metal/exceptions.js";
import {
  ArgumentError,
  Encoding,
  bytes,
  Hash,
  StringIO,
  excBacktrace,
  isValidEncoding,
  rbFSend,
  rbObjMethod,
} from "@blazetrails/ruby-compat";
import {
  I18n,
  Logger,
  assert,
  assertEqual,
  assertMatch,
  assertPredicate,
  assertRaises,
  inflections,
  isBlank,
  underscore,
  assertNil,
  assertNotPredicate,
  assertRaise,
  assertNotNil,
  assertNothingRaised,
  stub,
} from "@blazetrails/activesupport";
import { MockRequest, release } from "@blazetrails/rack";
import { IpSpoofAttackError, RemoteIp, type Proxy } from "../middleware/remote-ip.js";

let additionalTrustedProxy: string | RegExp | null = null;

async function stubRequest(env: Record<string, unknown> = {}): Promise<Request> {
  const ipSpoofingCheck = ":ip_spoofing_check" in env ? env[":ip_spoofing_check"] : true;
  delete env[":ip_spoofing_check"];

  const uri = env["HTTPS"] === "on" ? "https://www.example.org" : "http://www.example.org";

  env = MockRequest.envFor(uri, env);
  const trustedProxies = [...RemoteIp.TRUSTED_PROXIES, additionalTrustedProxy] as Proxy[];

  const ipApp = new RemoteIp(
    async () => [200, {}, emptyRackBody()],
    ipSpoofingCheck as boolean,
    trustedProxies,
  );
  await ipApp.call(env);

  return new Request(env);
}

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
  afterEach(() => {
    additionalTrustedProxy = null;
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

  it("remote ip spoof detection", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "1.1.1.1",
      HTTP_CLIENT_IP: "2.2.2.2",
    });
    const e = await assertRaise([IpSpoofAttackError], {}, () => request.remoteIp);
    assertMatch(/IP spoofing attack/, e.message);
    assertMatch(/HTTP_X_FORWARDED_FOR="1\.1\.1\.1"/, e.message);
    assertMatch(/HTTP_CLIENT_IP="2\.2\.2\.2"/, e.message);
  });

  it("remote ip with spoof detection disabled", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "1.1.1.1",
      HTTP_CLIENT_IP: "2.2.2.2",
      ":ip_spoofing_check": false,
    });
    assertEqual("1.1.1.1", request.remoteIp);
  });

  it("remote ip spoof protection ignores private addresses", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "172.17.19.51",
      HTTP_CLIENT_IP: "172.17.19.51",
      REMOTE_ADDR: "1.1.1.1",
      HTTP_X_BLUECOAT_VIA: "de462e07a2db325e",
    });
    assertEqual("1.1.1.1", request.remoteIp);
  });

  it("remote ip v6 spoof detection", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
      HTTP_CLIENT_IP: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    });
    const e = await assertRaise([IpSpoofAttackError], {}, () => request.remoteIp);
    assertMatch(/IP spoofing attack/, e.message);
    assertMatch(/HTTP_X_FORWARDED_FOR="fe80:0000:0000:0000:0202:b3ff:fe1e:8329"/, e.message);
    assertMatch(/HTTP_CLIENT_IP="2001:0db8:85a3:0000:0000:8a2e:0370:7334"/, e.message);
  });

  it("remote ip v6 spoof detection disabled", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
      HTTP_CLIENT_IP: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      ":ip_spoofing_check": false,
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);
  });

  it("remote ip with user specified trusted proxies String", async () => {
    additionalTrustedProxy = "67.205.106.73";

    let request = await stubRequest({
      REMOTE_ADDR: "3.4.5.6",
      HTTP_X_FORWARDED_FOR: "67.205.106.73",
    });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "172.16.0.1,67.205.106.73",
      HTTP_X_FORWARDED_FOR: "67.205.106.73",
    });
    assertEqual("67.205.106.73", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "67.205.106.73,3.4.5.6",
      HTTP_X_FORWARDED_FOR: "67.205.106.73",
    });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "67.205.106.73,unknown" });
    assertEqual("67.205.106.73", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "9.9.9.9, 3.4.5.6, 10.0.0.1, 67.205.106.73",
    });
    assertEqual("3.4.5.6", request.remoteIp);
  });

  it("remote ip v6 with user specified trusted proxies String", async () => {
    additionalTrustedProxy = "fe80:0000:0000:0000:0202:b3ff:fe1e:8329";

    let request = await stubRequest({
      REMOTE_ADDR: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR:
        "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,::1",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "unknown,fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR:
        "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);
  });

  it("remote ip with user specified trusted proxies Regexp", async () => {
    additionalTrustedProxy = /^67\.205\.106\.73$/i;

    let request = await stubRequest({
      REMOTE_ADDR: "67.205.106.73",
      HTTP_X_FORWARDED_FOR: "3.4.5.6",
    });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "10.0.0.1, 9.9.9.9, 3.4.5.6, 67.205.106.73",
    });
    assertEqual("3.4.5.6", request.remoteIp);
  });

  it("remote ip v6 with user specified trusted proxies Regexp", async () => {
    additionalTrustedProxy = /^fe80:0000:0000:0000:0202:b3ff:fe1e:8329$/i;

    let request = await stubRequest({
      REMOTE_ADDR: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR:
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334, fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);
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
    const req = new Request({ HTTP_HOST: "www.example.org:80" });
    assertNil(req.optionalPort);
    const req2 = new Request({ HTTP_HOST: "www.example.org:8080" });
    expect(req2.optionalPort).toBe(8080);
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
    const req = new Request({ HTTP_HOST: "example.com" });
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
    expect(req.rawHostWithPort).toBe("example.com:80");
  });

  it("raw host with default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:80" });
    expect(req.rawHostWithPort).toBe("example.com:80");
  });

  it("raw host with non default port", () => {
    const req = new Request({ HTTP_HOST: "example.com:3000" });
    expect(req.rawHostWithPort).toBe("example.com:3000");
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
    expect(req.hostWithPort()).toBe("example.com");
  });

  it("host with port if https standard port is specified", () => {
    const req = new Request({
      HTTP_HOST: "example.com:443",
      "rack.url_scheme": "https",
    });
    expect(req.hostWithPort()).toBe("example.com");
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
    const req = new Request({ REQUEST_METHOD: "POST" });

    expect(req.requestMethod).toBe("POST");
    expect(req.env["REQUEST_METHOD"]).toBe("POST");

    req.requestMethod = "GET";

    expect(req.requestMethod).toBe("GET");
    expect(req.env["REQUEST_METHOD"]).toBe("GET");
    expect(req.isGet()).toBe(true);
  });

  it("method returns original value of environment request method on POST", () => {
    const req = new Request({ "rack.methodoverride.original_method": "POST" });
    expect(req.method).toBe("POST");
  });

  it("post masquerading as patch", () => {
    const req = new Request({
      REQUEST_METHOD: "PATCH",
      "rack.methodoverride.original_method": "POST",
    });

    expect(req.method).toBe("POST");
    expect(req.requestMethod).toBe("PATCH");
    expect(req.isPatch()).toBe(true);
  });

  it("post masquerading as put", () => {
    const req = new Request({
      REQUEST_METHOD: "PUT",
      "rack.methodoverride.original_method": "POST",
    });
    expect(req.method).toBe("POST");
    expect(req.requestMethod).toBe("PUT");
    expect(req.isPut()).toBe(true);
  });

  it("invalid http method raises exception", () => {
    expect(() => new Request({ REQUEST_METHOD: "RANDOM_METHOD" }).requestMethod).toThrow(
      UnknownHttpMethod,
    );
  });

  it("method raises exception on invalid HTTP method", () => {
    expect(
      () => new Request({ "rack.methodoverride.original_method": "_RANDOM_METHOD" }).method,
    ).toThrow(UnknownHttpMethod);

    expect(() => new Request({ REQUEST_METHOD: "_RANDOM_METHOD" }).method).toThrow(
      UnknownHttpMethod,
    );
  });
  it("exception on invalid HTTP method unaffected by I18n settings", async () => {
    const oldLocales = I18n.availableLocales();
    const oldEnforce = I18n.enforceAvailableLocales();

    try {
      I18n.setAvailableLocales(["nl"]);
      I18n.setEnforceAvailableLocales(true);
      const request = await stubRequest({ REQUEST_METHOD: "_RANDOM_METHOD" });
      await assertRaise([UnknownHttpMethod], {}, () => request.method);
    } finally {
      I18n.setAvailableLocales(oldLocales);
      I18n.setEnforceAvailableLocales(oldEnforce);
    }
  });

  it("post uneffected by local inflections", async () => {
    const existingAcronyms = new Map(inflections().acronyms);
    try {
      inflections(undefined, (inflect) => {
        inflect.acronym("POS");
      });
      assertEqual("pos_t", underscore("POST"));
      const request = await stubRequest({ REQUEST_METHOD: "POST" });
      assertEqual("post", Request.HTTP_METHOD_LOOKUP["POST"]);
      assertEqual("post", request.methodSymbol);
      assertPredicate(request, (r) => r.isPost());
    } finally {
      inflections(undefined, (inflect) => {
        inflect.acronyms = existingAcronyms;
        rbFSend(inflect, "defineAcronymRegexPatterns");
      });
    }
  });
  it("delegates to Object#method if an argument is passed", async () => {
    const request = await stubRequest();

    await assertNothingRaised(() => {
      rbObjMethod(request, ":POST");
    });
  });
});

describe("RequestMimeType", () => {
  it("content type", () => {
    const req = new Request({ CONTENT_TYPE: "text/html" });
    expect(req.contentMimeType).toBe(Mime.get(":html")!);
    expect(req.mediaType).toBe("text/html");
    expect(req.contentType).toBe("text/html");
  });

  it("no content type", () => {
    const req = new Request({});
    assertNil(req.contentMimeType);
    expect(req.mediaType).toBeUndefined();
    assertNil(req.contentType);
  });

  it("content type is XML", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml" });
    expect(req.contentMimeType?.symbol).toBe(":xml");
    expect(req.mediaType).toBe("application/xml");
    expect(req.contentType).toBe("application/xml");
  });

  it("content type with charset", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml; charset=UTF-8" });
    expect(req.contentMimeType?.symbol).toBe(":xml");
    expect(req.mediaType).toBe("application/xml");
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
    const xml = Mime.get(":xml")!;
    const json = Mime.get(":json")!;
    assertNil(req.negotiateMime([xml, json]));
    expect(req.negotiateMime([xml, Mime.get(":html")!])).toBe(Mime.get(":html")!);
    const all = MimeType.parse("*/*")[0];
    expect(req.negotiateMime([xml, all])?.symbol).toBe(":html");
  });

  it("negotiate_mime with content_type", () => {
    const req = new Request({
      CONTENT_TYPE: "application/xml; charset=UTF-8",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    });
    const xml = Mime.get(":xml")!;
    const csv = Mime.get(":csv")!;
    expect(req.negotiateMime([xml, csv])).toBe(xml);
    expect(req.contentMimeType?.symbol).toBe(":xml");
  });
});

describe("RequestParamsParsing", () => {
  it("doesn't break when content type has charset", () => {
    const req = new Request({ CONTENT_TYPE: "text/html; charset=utf-8" });
    expect(req.mediaType).toBe("text/html");
  });

  it("doesn't interpret request uri as query string when missing", () => {
    const req = new Request({ PATH_INFO: "/posts" });
    expect(req.queryString).toBe("");
  });

  it("request_parameters raises BadRequest when content length lower than actual data length for a multipart request", async () => {
    const request = await stubRequest({
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      CONTENT_LENGTH: "9",
      REQUEST_METHOD: "POST",
      ":input": "0123456789",
    });

    const err = await assertRaises([BadRequest], {}, () => request.requestParameters);

    assertMatch("Invalid request parameters:", err.message);
  });

  it("request_parameters raises BadRequest when content length is higher than actual data length", async () => {
    const request = await stubRequest({
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      CONTENT_LENGTH: "11",
      REQUEST_METHOD: "POST",
      ":input": "0123456789",
    });

    const err = await assertRaises([BadRequest], {}, () => request.requestParameters);

    assertEqual("Invalid request parameters: bad content body", err.message);
  });
});

describe("RequestFormat", () => {
  it("xml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format.symbol).toBe(":xml");
  });

  it("xhtml format", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xhtml+xml" });
    expect(req.format.symbol).toBe(":html");
  });

  it("txt format", () => {
    const req = new Request({ HTTP_ACCEPT: "text/plain" });
    expect(req.format.symbol).toBe(":text");
  });

  it("formats text/html with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "text/html" });
    expect(req.format.symbol).toBe(":html");
  });

  it("formats blank with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "" });
    expect(req.format.symbol).toBe(":html");
  });

  it("formats XMLHttpRequest with accept header", () => {
    const req = new Request({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      HTTP_ACCEPT: "application/json",
    });
    expect(req.xhr).toBe(true);
    expect(req.format.symbol).toBe(":json");
  });

  it("formats application/xml with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format.symbol).toBe(":xml");
  });

  it("XMLHttpRequest", () => {
    const req = new Request({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    expect(req.isXmlHttpRequest).toBe(true);
    expect(req.xhr).toBe(true);
  });

  it("format is not nil with unknown format", () => {
    const req = new Request({ QUERY_STRING: "format=hello" });
    assertNil(req.format);
    assertNotPredicate(req.format, (f) => f.isHtml!());
    assertNotPredicate(req.format, (f) => f.isXml!());
    assertNotPredicate(req.format, (f) => f.isJson!());
  });

  it("can override format with parameter positive", () => {
    const req = new Request({
      HTTP_ACCEPT: "text/html",
      "action_dispatch.request.parameters": { format: "json" },
    });
    expect(req.format.symbol).toBe(":json");
  });

  it("formats with xhr request", () => {
    const req = new Request({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      QUERY_STRING: "",
    });
    expect(req.formats).toEqual([Mime.get(":js")!]);
  });

  it("format taken from the path extension", () => {
    const r1 = new Request({ PATH_INFO: "/foo.xml", QUERY_STRING: "" });
    expect(r1.formats.map((m) => m.symbol)).toEqual([":xml"]);
    const r2 = new Request({ PATH_INFO: "/foo.123", QUERY_STRING: "" });
    expect(r2.formats).toEqual([Mime.get(":html")!]);
  });

  it("formats from accept headers have higher precedence than path extension", () => {
    const req = new Request({
      HTTP_ACCEPT: "application/json",
      PATH_INFO: "/foo.xml",
      QUERY_STRING: "",
    });
    expect(req.formats.map((m) => m.symbol)).toEqual([":json"]);
  });

  it("can override format with parameter negative", () => {
    const req = new Request({ QUERY_STRING: "format=txt" });
    expect(req.format.symbol).not.toBe(":xml");
  });

  it("formats format:text with accept header", () => {
    const req = new Request({ QUERY_STRING: "format=txt" });
    expect(req.formats.map((m) => m.symbol)).toEqual([":text"]);
  });

  it("formats format:unknown with accept header", () => {
    const req = new Request({ QUERY_STRING: "format=unknown" });
    expect(req.format.symbol).toBeNull();
  });

  it("format does not throw exceptions when malformed GET parameters", async () => {
    const request = await stubRequest({ QUERY_STRING: "x[y]=1&x[y][][w]=2" });
    assert(request.formats);
    assertPredicate(request.format, (f) => f.isHtml!());
  });

  it("format does not throw exceptions when invalid POST parameters", async () => {
    const body = "{record:{content:127.0.0.1}}";

    const output = new StringIO();
    const request = await stubRequest({
      REQUEST_METHOD: "POST",
      CONTENT_LENGTH: String(body.length),
      CONTENT_TYPE: "application/json",
      ":input": body,
      "action_dispatch.logger": new Logger(output),
    });
    assert(request.formats);
    assertPredicate(request.format, (f) => f.isHtml!());

    output.rewind();
    const err = output.read();
    assertMatch(/Error occurred while parsing request parameters/, err);
  });

  it("ignore_accept_header", () => {
    const prev = Request.ignoreAcceptHeader;
    Request.ignoreAcceptHeader = true;
    try {
      const r1 = new Request({ HTTP_ACCEPT: "application/xml", QUERY_STRING: "" });
      expect(r1.formats).toEqual([Mime.get(":html")!]);
      const r2 = new Request({ HTTP_ACCEPT: "*/*;q=0.1", QUERY_STRING: "" });
      expect(r2.formats).toEqual([Mime.get(":html")!]);
      const r3 = new Request({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        QUERY_STRING: "",
      });
      expect(r3.formats).toEqual([Mime.get(":js")!]);
      const r4 = new Request({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        "action_dispatch.request.parameters": { format: "json" },
      });
      expect(r4.formats.map((m) => m?.symbol)).toEqual([":json"]);
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

describe.skipIf(!(release() < "3"))("RequestRewind", () => {
  it("body should be rewound", async () => {
    const data = "rewind";
    const env = {
      ":input": data,
      CONTENT_LENGTH: String(data.length),
      CONTENT_TYPE: "application/x-www-form-urlencoded; charset=utf-8",
    };

    const request = await stubRequest(env);
    void request.requestParameters;

    assertEqual("rewind", request.body.read());
  });

  it("raw_post rewinds rack.input if RAW_POST_DATA is nil", async () => {
    const request = await stubRequest({
      ":input": "raw",
      CONTENT_LENGTH: "3",
    });
    assertEqual("raw", request.rawPost);
    assertEqual("raw", (request.env["rack.input"] as StringIO).read());
  });
});

describe("RequestParameters", () => {
  it("raw_post does not raise when rack.input is nil", () => {
    const req = new Request({});
    assertPredicate(req.rawPost, isBlank);
  });

  it("parameters", async () => {
    const request = await stubRequest({
      CONTENT_TYPE: "application/json",
      CONTENT_LENGTH: "9",
      RAW_POST_DATA: '{"foo":1}',
      QUERY_STRING: "bar=2",
    });

    assertEqual({ foo: 1, bar: "2" }, request.parameters);
    assertEqual({ foo: 1 }, request.requestParameters);
    assertEqual({ bar: "2" }, request.queryParameters);
  });

  it("parameters not accessible after rack parse error", async () => {
    const request = await stubRequest({ QUERY_STRING: "x[y]=1&x[y][][w]=2" });

    for (let i = 0; i < 2; i++) {
      await assertRaises([BadRequest], {}, () => request.parameters);
    }
  });

  it("path parameters with invalid UTF8 encoding", async () => {
    const request = await stubRequest();

    const err = await assertRaises([BadRequest], {}, () => {
      request.pathParameters = { foo: "\udcbe" };
    });

    assertEqual("Invalid path parameters: Invalid encoding for parameter: \ufffd", err.message);
  });
  // PERMANENT-SKIP: CLAUDE.md § "A String has no encoding tag either" — both assertions read `String#encoding`.
  it.skip("path parameters don't re-encode frozen strings", async () => {
    const request = await stubRequest();

    stub(
      Request.Utils.CustomParamEncoder,
      "actionEncodingTemplate",
      new Hash<string, Encoding>(() => Encoding.BINARY),
      [],
      () => {
        request.pathParameters = { foo: "frozen", bar: "mutable", controller: "test_controller" };
      },
    );
  });
  it("parameters containing an invalid UTF8 character", async () => {
    const request = await stubRequest({ QUERY_STRING: "foo=%81E" });
    await assertRaises([BadRequest], {}, () => request.parameters);
  });

  it("parameters containing a deeply nested invalid UTF8 character", async () => {
    const request = await stubRequest({ QUERY_STRING: "foo[bar]=%81E" });
    await assertRaises([BadRequest], {}, () => request.parameters);
  });

  it("POST parameters containing invalid UTF8 character", async () => {
    const data = "foo=%81E";
    const request = await stubRequest({
      REQUEST_METHOD: "POST",
      CONTENT_LENGTH: String(data.length),
      CONTENT_TYPE: "application/x-www-form-urlencoded; charset=utf-8",
      ":input": data,
    });

    const err = await assertRaises([BadRequest], {}, () => request.parameters);

    assertPredicate(err.message, (m) =>
      isValidEncoding(String.fromCharCode(...bytes(m)), Encoding.UTF_8),
    );
    assertEqual("Invalid request parameters: Invalid encoding for parameter: \ufffdE", err.message);
  });

  it("query parameters specified as ASCII_8BIT encoded do not raise InvalidParameterError", async () => {
    const request = await stubRequest({ QUERY_STRING: "foo=%81E" });

    await stub(
      Request.Utils.CustomParamEncoder,
      "actionEncodingTemplate",
      new Hash<string, Encoding>().merge({ foo: Encoding.ASCII_8BIT }),
      [],
      async () => {
        await assertNothingRaised(() => {
          void request.parameters;
        });
      },
    );
  });

  it("POST parameters specified as ASCII_8BIT encoded do not raise InvalidParameterError", async () => {
    const data = "foo=%81E";
    const request = await stubRequest({
      REQUEST_METHOD: "POST",
      CONTENT_LENGTH: String(data.length),
      CONTENT_TYPE: "application/x-www-form-urlencoded; charset=utf-8",
      ":input": data,
    });

    await stub(
      Request.Utils.CustomParamEncoder,
      "actionEncodingTemplate",
      new Hash<string, Encoding>().merge({ foo: Encoding.ASCII_8BIT }),
      [],
      async () => {
        await assertNothingRaised(() => {
          void request.parameters;
        });
      },
    );
  });
  it("parameters not accessible after rack parse error 1", async () => {
    const request = await stubRequest({
      REQUEST_METHOD: "POST",
      CONTENT_LENGTH: String("a%=".length),
      CONTENT_TYPE: "application/x-www-form-urlencoded; charset=utf-8",
      ":input": "a%=",
    });

    await assertRaises([BadRequest], {}, () => request.parameters);
  });
  it("we have access to the original exception", async () => {
    const request = await stubRequest({ QUERY_STRING: "x[y]=1&x[y][][w]=2" });

    const e = await assertRaises([BadRequest], {}, () => {
      void request.parameters;
    });

    assertNotNil(e.cause);
    assertEqual(excBacktrace(e.cause as Error), excBacktrace(e));
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
    expect(req.variant["phone?"]()).toBe(true);
    expect(req.variant["tablet?"]()).toBe(false);
    expect(req.variant.any("phone", "tablet")).toBe(true);
    expect(req.variant.any("tablet", "desktop")).toBe(false);
  });

  it("setting variant to an array of symbols", () => {
    const req = new Request({});
    req.variant = ["phone", "tablet"];
    expect(req.variant["phone?"]()).toBe(true);
    expect(req.variant["tablet?"]()).toBe(true);
    expect(req.variant["desktop?"]()).toBe(false);
    expect(req.variant.any("tablet", "desktop")).toBe(true);
    expect(req.variant.any("desktop", "watch")).toBe(false);
  });

  it("clearing variant", () => {
    const req = new Request({});
    req.variant = null;
    expect(req.variant.length).toBe(0);
    expect(req.variant["phone?"]()).toBe(false);
    expect(req.variant.any("phone", "tablet")).toBe(false);
  });

  it("setting variant to a non-symbol value", () => {
    const req = new Request({});
    expect(() => {
      req.variant = 123 as any;
    }).toThrow(ArgumentError);
  });

  it("setting variant to an array containing a non-symbol value", () => {
    const req = new Request({});
    expect(() => {
      req.variant = ["phone", 123] as any;
    }).toThrow(ArgumentError);
  });
});

describe("RequestFormData", () => {
  it("media_type is from the FORM_DATA_MEDIA_TYPES array", () => {
    expect(new Request({ CONTENT_TYPE: "application/x-www-form-urlencoded" }).formData).toBe(true);
    expect(new Request({ CONTENT_TYPE: "multipart/form-data" }).formData).toBe(true);
  });

  it("media_type is not from the FORM_DATA_MEDIA_TYPES array", () => {
    expect(new Request({ CONTENT_TYPE: "application/xml" }).formData).toBe(false);
    expect(new Request({ CONTENT_TYPE: "multipart/related" }).formData).toBe(false);
  });

  it("no Content-Type header is provided and the request_method is POST", () => {
    const req = new Request({ REQUEST_METHOD: "POST" });
    expect(req.mediaType).toBeUndefined();
    expect(req.requestMethod).toBe("POST");
    expect(req.formData).toBe(false);
  });
});

describe("RequestInspectTest", () => {
  it("inspect", () => {
    const request = new Request({
      REQUEST_METHOD: "POST",
      REMOTE_ADDR: "1.2.3.4",
      HTTP_X_FORWARDED_PROTO: "https",
      HTTP_X_FORWARDED_HOST: "example.com:443",
      PATH_INFO: "/path/",
      QUERY_STRING: "q=1",
    });
    expect(request.inspect()).toMatch(
      /#<ActionDispatch::Request POST "https:\/\/example.com\/path\/\?q=1" for 1.2.3.4>/,
    );
  });
});

describe("RequestSession", () => {
  it("#session", () => {
    const req = new Request({});
    void req.session;

    expect(Session.find(req)!.isEnabled()).toBe(false);
    expect(Session.Options.find(req)).toBeInstanceOf(Session.Options);
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
