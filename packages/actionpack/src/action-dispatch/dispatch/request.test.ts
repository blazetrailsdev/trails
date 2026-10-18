import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { Request } from "../http/request.js";
import { URL } from "../http/url.js";
import { emptyRackBody } from "../http/request.js";
import { Session } from "../request/session.js";
import { Mime, MimeType, NullType } from "../http/mime-type.js";
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
  assertInstanceOf,
  assertEmpty,
  assertNot,
  assertKindOf,
  assertSame,
  ParameterFilter,
  assertRaise,
  assertNotNil,
  assertNothingRaised,
  stub,
} from "@blazetrails/activesupport";
import { MockRequest, release } from "@blazetrails/rack";
import { IpSpoofAttackError, RemoteIp, type Proxy } from "../middleware/remote-ip.js";

let additionalTrustedProxy: string | RegExp | null = null;

let originalTldLength: number;
beforeEach(() => {
  originalTldLength = URL.tldLength;
});
afterEach(() => {
  URL.tldLength = originalTldLength;
});

async function stubRequest(env: Record<string, unknown> = {}): Promise<Request> {
  const ipSpoofingCheck = ":ip_spoofing_check" in env ? env[":ip_spoofing_check"] : true;
  delete env[":ip_spoofing_check"];
  if (":tld_length" in env) {
    URL.tldLength = env[":tld_length"] as number;
    delete env[":tld_length"];
  }

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

function urlFor(options: Record<string, unknown> = {}): string {
  options = Object.assign({ host: "www.example.com" }, options);
  return URL.urlFor(options as never);
}

describe("RequestUrlFor", () => {
  it("url_for class method", async () => {
    const e = await assertRaise([ArgumentError], {}, () => urlFor({ host: null }));
    assertMatch(/Please provide the :host parameter/, e.message);

    assertEqual("/books", urlFor({ onlyPath: true, path: "/books" }));

    assertEqual("http://www.example.com", urlFor());
    assertEqual("http://api.example.com", urlFor({ subdomain: "api" }));
    assertEqual("http://example.com", urlFor({ subdomain: false }));
    assertEqual("http://www.ror.com", urlFor({ domain: "ror.com" }));
    assertEqual(
      "http://api.ror.co.uk",
      urlFor({ host: "www.ror.co.uk", subdomain: "api", tldLength: 2 }),
    );
    assertEqual("http://www.example.com:8080", urlFor({ port: 8080 }));
    assertEqual("https://www.example.com", urlFor({ protocol: "https" }));
    assertEqual("http://www.example.com/docs", urlFor({ path: "/docs" }));
    assertEqual("http://www.example.com#signup", urlFor({ anchor: "signup" }));
    assertEqual("http://www.example.com/", urlFor({ trailingSlash: true }));
    assertEqual(
      "http://dhh:supersecret@www.example.com",
      urlFor({ user: "dhh", password: "supersecret" }),
    );
    assertEqual("http://www.example.com?search=books", urlFor({ params: { search: "books" } }));
    assertEqual("http://www.example.com?params=", urlFor({ params: "" }));
    assertEqual("http://www.example.com?params=1", urlFor({ params: 1 }));
  });
});

describe("RequestIP", () => {
  afterEach(() => {
    additionalTrustedProxy = null;
  });

  it("remote ip", async () => {
    let request = await stubRequest({ REMOTE_ADDR: "1.2.3.4" });
    assertEqual("1.2.3.4", request.remoteIp);

    request = await stubRequest({ REMOTE_ADDR: "1.2.3.4,3.4.5.6" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ REMOTE_ADDR: "1.2.3.4", HTTP_X_FORWARDED_FOR: "3.4.5.6" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "3.4.5.6" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "127.0.0.1",
      HTTP_X_FORWARDED_FOR: "172.31.4.4, 10.0.0.1",
    });
    assertEqual("172.31.4.4", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6,unknown" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6,172.16.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6,192.168.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6,10.0.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "172.31.4.4, 10.0.0.1" });
    assertEqual("172.31.4.4", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6, 10.0.0.1, 10.0.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "3.4.5.6,127.0.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "unknown,192.168.0.1" });
    assertEqual("192.168.0.1", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "9.9.9.9, 3.4.5.6, 172.31.4.4, 10.0.0.1" });
    assertEqual("3.4.5.6", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "not_ip_address" });
    assertNil(request.remoteIp);

    request = await stubRequest({ REMOTE_ADDR: "1.2.3.4" });
    assertEqual("1.2.3.4", request.remoteIp);
    request.remoteIp = "2.3.4.5";
    assertEqual("2.3.4.5", request.remoteIp);
  });

  it("remote ip middleware not present still returns an IP", () => {
    const req = new Request({});
    expect(req.remoteIp).toBe("127.0.0.1");
  });

  it("remote ip v6", async () => {
    let request = await stubRequest({ REMOTE_ADDR: "2001:0db8:85a3:0000:0000:8a2e:0370:7334" });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR:
        "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    });
    assertEqual("2001:0db8:85a3:0000:0000:8a2e:0370:7334", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      REMOTE_ADDR: "::1",
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,unknown",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329,::1",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329, ::1, ::1",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "unknown,::1" });
    assertEqual("::1", request.remoteIp);

    request = await stubRequest({
      HTTP_X_FORWARDED_FOR:
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334, fe80:0000:0000:0000:0202:b3ff:fe1e:8329, ::1, fc00::, fc01::, fdff",
    });
    assertEqual("fe80:0000:0000:0000:0202:b3ff:fe1e:8329", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "FE00::, FDFF::" });
    assertEqual("FE00::", request.remoteIp);

    request = await stubRequest({ HTTP_X_FORWARDED_FOR: "not_ip_address" });
    assertNil(request.remoteIp);
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
  it("domains", async () => {
    let request = await stubRequest({ HTTP_HOST: "192.168.1.200" });
    assertNil(request.domain());

    request = await stubRequest({ HTTP_HOST: "foo.192.168.1.200" });
    assertNil(request.domain());

    request = await stubRequest({ HTTP_HOST: "192.168.1.200.com" });
    assertEqual("200.com", request.domain());

    request = await stubRequest({ HTTP_HOST: "www.rubyonrails.org" });
    assertEqual("rubyonrails.org", request.domain());

    request = await stubRequest({ HTTP_HOST: "www.rubyonrails.co.uk" });
    assertEqual("rubyonrails.co.uk", request.domain(2));

    request = await stubRequest({ HTTP_HOST: "www.rubyonrails.co.uk", ":tld_length": 2 });
    assertEqual("rubyonrails.co.uk", request.domain());
  });

  it("subdomains", async () => {
    let request = await stubRequest({ HTTP_HOST: "foobar.foobar.com" });
    assertEqual(["foobar"], request.subdomains());
    assertEqual("foobar", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "192.168.1.200" });
    assertEqual([], request.subdomains());
    assertEqual("", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "foo.192.168.1.200" });
    assertEqual([], request.subdomains());
    assertEqual("", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "192.168.1.200.com" });
    assertEqual(["192", "168", "1"], request.subdomains());
    assertEqual("192.168.1", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "" });
    assertEqual([], request.subdomains());
    assertEqual("", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "www.rubyonrails.org" });
    assertEqual(["www"], request.subdomains());
    assertEqual("www", request.subdomain());

    request = await stubRequest({ HTTP_HOST: "www.rubyonrails.co.uk" });
    assertEqual(["www"], request.subdomains(2));
    assertEqual("www", request.subdomain(2));

    request = await stubRequest({ HTTP_HOST: "dev.www.rubyonrails.co.uk" });
    assertEqual(["dev", "www"], request.subdomains(2));
    assertEqual("dev.www", request.subdomain(2));

    request = await stubRequest({ HTTP_HOST: "dev.www.rubyonrails.co.uk", ":tld_length": 2 });
    assertEqual(["dev", "www"], request.subdomains());
    assertEqual("dev.www", request.subdomain());
  });
});

describe("RequestPort", () => {
  it("standard_port", () => {
    const req = new Request({ "rack.url_scheme": "http" });
    expect(req.standardPort).toBe(80);
    const req2 = new Request({ "rack.url_scheme": "https" });
    expect(req2.standardPort).toBe(443);
  });

  it("standard_port?", async () => {
    let request = await stubRequest();
    assertNotPredicate(request, (r) => r.ssl);
    assertPredicate(request, (r) => r.isStandardPort);

    request = await stubRequest({ HTTPS: "on" });
    assertPredicate(request, (r) => r.ssl);
    assertPredicate(request, (r) => r.isStandardPort);

    request = await stubRequest({ HTTP_HOST: "www.example.org:8080" });
    assertNotPredicate(request, (r) => r.ssl);
    assertNotPredicate(request, (r) => r.isStandardPort);

    request = await stubRequest({ HTTP_HOST: "www.example.org:8443", HTTPS: "on" });
    assertPredicate(request, (r) => r.ssl);
    assertNotPredicate(request, (r) => r.isStandardPort);
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

  it("server port", async () => {
    let request = await stubRequest({ SERVER_PORT: "8080" });
    assertEqual(8080, request.serverPort);

    request = await stubRequest({ SERVER_PORT: "80" });
    assertEqual(80, request.serverPort);

    request = await stubRequest({ SERVER_PORT: "0" });
    assertEqual(0, request.serverPort);
  });
});

describe("RequestPath", () => {
  it("full path", async () => {
    let request = await stubRequest({
      SCRIPT_NAME: "",
      PATH_INFO: "/path/of/some/uri",
      QUERY_STRING: "mapped=1",
    });
    assertEqual("/path/of/some/uri?mapped=1", request.fullpath);
    assertEqual("/path/of/some/uri", request.pathInfo);

    request = await stubRequest({ SCRIPT_NAME: "", PATH_INFO: "/path/of/some/uri" });
    assertEqual("/path/of/some/uri", request.fullpath);
    assertEqual("/path/of/some/uri", request.pathInfo);

    request = await stubRequest({ SCRIPT_NAME: "", PATH_INFO: "/" });
    assertEqual("/", request.fullpath);
    assertEqual("/", request.pathInfo);

    request = await stubRequest({ SCRIPT_NAME: "", PATH_INFO: "/", QUERY_STRING: "m=b" });
    assertEqual("/?m=b", request.fullpath);
    assertEqual("/", request.pathInfo);

    request = await stubRequest({ SCRIPT_NAME: "/hieraki", PATH_INFO: "/" });
    assertEqual("/hieraki/", request.fullpath);
    assertEqual("/", request.pathInfo);

    request = await stubRequest({
      SCRIPT_NAME: "/collaboration/hieraki",
      PATH_INFO: "/books/edit/2",
    });
    assertEqual("/collaboration/hieraki/books/edit/2", request.fullpath);
    assertEqual("/books/edit/2", request.pathInfo);

    request = await stubRequest({
      SCRIPT_NAME: "/path",
      PATH_INFO: "/of/some/uri",
      QUERY_STRING: "mapped=1",
    });
    assertEqual("/path/of/some/uri?mapped=1", request.fullpath);
    assertEqual("/of/some/uri", request.pathInfo);
  });

  it("original_fullpath returns ORIGINAL_FULLPATH", async () => {
    const request = await stubRequest({ ORIGINAL_FULLPATH: "/foo?bar" });

    const path = request.originalFullpath;
    assertEqual("/foo?bar", path);
  });

  it("original_url returns URL built using ORIGINAL_FULLPATH", async () => {
    const request = await stubRequest({
      ORIGINAL_FULLPATH: "/foo?bar",
      HTTP_HOST: "example.org",
      "rack.url_scheme": "http",
    });

    const url = request.originalUrl;
    assertEqual("http://example.org/foo?bar", url);
  });

  it("original_fullpath returns fullpath if ORIGINAL_FULLPATH is not present", async () => {
    const request = await stubRequest({ PATH_INFO: "/foo", QUERY_STRING: "bar" });

    const path = request.originalFullpath;
    assertEqual("/foo?bar", path);
  });
});

describe("RequestHost", () => {
  it("host without specifying port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org" });
    assertEqual("rubyonrails.org", request.hostWithPort());
  });

  it("host with default port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org:80" });
    assertEqual("rubyonrails.org", request.hostWithPort());
  });

  it("host with non default port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org:81" });
    assertEqual("rubyonrails.org:81", request.hostWithPort());
  });

  it("raw without specifying port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org" });
    assertEqual("rubyonrails.org", request.rawHostWithPort);
  });

  it("raw host with default port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org:80" });
    assertEqual("rubyonrails.org:80", request.rawHostWithPort);
  });

  it("raw host with non default port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org:81" });
    assertEqual("rubyonrails.org:81", request.rawHostWithPort);
  });

  it("http host", async () => {
    let request = await stubRequest({ HTTP_HOST: "rubyonrails.org:8080" });
    assertEqual("rubyonrails.org", request.host);
    assertEqual("rubyonrails.org:8080", request.hostWithPort());

    request = await stubRequest({ HTTP_X_FORWARDED_HOST: "www.firsthost.org, www.secondhost.org" });
    assertEqual("www.secondhost.org", request.host);

    request = await stubRequest({ HTTP_X_FORWARDED_HOST: "", HTTP_HOST: "rubyonrails.org" });
    assertEqual("rubyonrails.org", request.host);
  });

  it("http host with default port overrides server port", async () => {
    const request = await stubRequest({ HTTP_HOST: "rubyonrails.org" });
    assertEqual("rubyonrails.org", request.hostWithPort());
  });

  it("host with port if http standard port is specified", async () => {
    const request = await stubRequest({ HTTP_X_FORWARDED_HOST: "glu.ttono.us:80" });
    assertEqual("glu.ttono.us", request.hostWithPort());
  });

  it("host with port if https standard port is specified", async () => {
    const request = await stubRequest({
      HTTP_X_FORWARDED_PROTO: "https",
      HTTP_X_FORWARDED_HOST: "glu.ttono.us:443",
    });
    assertEqual("glu.ttono.us", request.hostWithPort());
  });

  it("host if ipv6 reference", async () => {
    const request = await stubRequest({ HTTP_HOST: "[2001:1234:5678:9abc:def0::dead:beef]" });
    assertEqual("[2001:1234:5678:9abc:def0::dead:beef]", request.host);
  });

  it("host if ipv6 reference with port", async () => {
    const request = await stubRequest({ HTTP_HOST: "[2001:1234:5678:9abc:def0::dead:beef]:8008" });
    assertEqual("[2001:1234:5678:9abc:def0::dead:beef]", request.host);
  });

  it("proxy request", async () => {
    const request = await stubRequest({ HTTP_HOST: "glu.ttono.us:80" });
    assertEqual("glu.ttono.us", request.hostWithPort());
  });
});

describe("RequestMethod", () => {
  it("method returns environment's request method when it has not been overridden by middleware", async () => {
    for (const method of Request.HTTP_METHODS) {
      const request = await stubRequest({ REQUEST_METHOD: method });

      assertEqual(method, request.method);
      assertEqual(underscore(method), request.methodSymbol);
    }
  });

  it("allow request method hacking", async () => {
    const request = await stubRequest({ REQUEST_METHOD: "POST" });

    assertEqual("POST", request.requestMethod);
    assertEqual("POST", request.env["REQUEST_METHOD"]);

    request.requestMethod = "GET";

    assertEqual("GET", request.requestMethod);
    assertEqual("GET", request.env["REQUEST_METHOD"]);
    assertPredicate(request, (r) => r.isGet());
  });

  it("method returns original value of environment request method on POST", () => {
    const req = new Request({ "rack.methodoverride.original_method": "POST" });
    expect(req.method).toBe("POST");
  });

  it("post masquerading as patch", async () => {
    const request = await stubRequest({
      REQUEST_METHOD: "PATCH",
      "rack.methodoverride.original_method": "POST",
    });

    assertEqual("POST", request.method);
    assertEqual("PATCH", request.requestMethod);
    assertPredicate(request, (r) => r.isPatch());
  });

  it("post masquerading as put", async () => {
    const request = await stubRequest({
      REQUEST_METHOD: "PUT",
      "rack.methodoverride.original_method": "POST",
    });
    assertEqual("POST", request.method);
    assertEqual("PUT", request.requestMethod);
    assertPredicate(request, (r) => r.isPut());
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
  it("content type", async () => {
    const request = await stubRequest({ CONTENT_TYPE: "text/html" });

    assertEqual(Mime.get(":html")!, request.contentMimeType);
    assertEqual("text/html", request.mediaType);
    assertNil(request.contentCharset);
    assertEqual({}, request.mediaTypeParams);
    assertEqual("text/html", request.contentType);
  });

  it("no content type", async () => {
    const request = await stubRequest();

    assertNil(request.contentMimeType);
    assertNil(request.mediaType);
    assertNil(request.contentCharset);
    assertEqual({}, request.mediaTypeParams);
    assertNil(request.contentType);
  });

  it("content type is XML", async () => {
    const request = await stubRequest({ CONTENT_TYPE: "application/xml" });

    assertEqual(Mime.get(":xml")!, request.contentMimeType);
    assertEqual("application/xml", request.mediaType);
    assertNil(request.contentCharset);
    assertEqual({}, request.mediaTypeParams);
    assertEqual("application/xml", request.contentType);
  });

  it("content type with charset", async () => {
    const request = await stubRequest({ CONTENT_TYPE: "application/xml; charset=UTF-8" });

    assertEqual(Mime.get(":xml")!, request.contentMimeType);
    assertEqual("application/xml", request.mediaType);
    assertEqual("UTF-8", request.contentCharset);
    assertEqual({ charset: "UTF-8" }, request.mediaTypeParams);
    assertEqual("application/xml; charset=UTF-8", request.contentType);
  });

  it("user agent", async () => {
    assertEqual("TestAgent", (await stubRequest({ HTTP_USER_AGENT: "TestAgent" })).userAgent);
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

  it("negotiate_mime with content_type", async () => {
    const request = await stubRequest({
      CONTENT_TYPE: "application/xml; charset=UTF-8",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
    });

    assertEqual(Mime.get(":xml")!, request.negotiateMime([Mime.get(":xml")!, Mime.get(":csv")!]));
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

  it("formats XMLHttpRequest with accept header", async () => {
    const request = await stubRequest({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    assertEqual([Mime.get(":js")!], request.formats);
  });

  it("formats application/xml with accept header", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml" });
    expect(req.format.symbol).toBe(":xml");
  });

  it("XMLHttpRequest", async () => {
    const request = await stubRequest({
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      HTTP_ACCEPT: [
        Mime.get(":js")!,
        Mime.get(":html")!,
        Mime.get(":xml")!,
        "text/xml",
        "*/*",
      ].join(","),
      QUERY_STRING: "",
    });

    assertPredicate(request, (r) => r.xhr);
    assertEqual(Mime.get(":js")!, request.format);
  });

  it("format is not nil with unknown format", () => {
    const req = new Request({ QUERY_STRING: "format=hello" });
    assertNil(req.format);
    assertNotPredicate(req.format, (f) => f.isHtml!());
    assertNotPredicate(req.format, (f) => f.isXml!());
    assertNotPredicate(req.format, (f) => f.isJson!());
  });

  it("can override format with parameter positive", async () => {
    const request = await stubRequest({ QUERY_STRING: "format=xml" });

    assertPredicate(request.format, (r) => r.isXml!());
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

  it("can override format with parameter negative", async () => {
    const request = await stubRequest({ QUERY_STRING: "format=txt" });

    assertNotPredicate(request.format, (r) => r.isXml!());
  });

  it("formats format:text with accept header", () => {
    const req = new Request({ QUERY_STRING: "format=txt" });
    expect(req.formats.map((m) => m.symbol)).toEqual([":text"]);
  });

  it("formats format:unknown with accept header", async () => {
    const request = await stubRequest({ QUERY_STRING: "format=unknown" });

    assertInstanceOf(NullType as unknown as abstract new () => NullType, request.format);
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

  it("ignore_accept_header", async () => {
    const oldIgnoreAcceptHeader = Request.ignoreAcceptHeader;
    Request.ignoreAcceptHeader = true;

    try {
      let request = await stubRequest({ HTTP_ACCEPT: "application/xml", QUERY_STRING: "" });

      assertEqual([Mime.get(":html")!], request.formats);

      request = await stubRequest({ HTTP_ACCEPT: "koz-asked/something-wild", QUERY_STRING: "" });

      assertEqual([Mime.get(":html")!], request.formats);

      request = await stubRequest({ HTTP_ACCEPT: "*/*;q=0.1", QUERY_STRING: "" });

      assertEqual([Mime.get(":html")!], request.formats);

      request = await stubRequest({ HTTP_ACCEPT: "application/jxw", QUERY_STRING: "" });

      assertEqual([Mime.get(":html")!], request.formats);

      request = await stubRequest({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        QUERY_STRING: "",
      });

      assertEqual([Mime.get(":js")!], request.formats);

      request = await stubRequest({
        HTTP_ACCEPT: "application/xml",
        HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
        QUERY_STRING: "format=json",
      });

      assertEqual([Mime.get(":json")!], request.formats);
    } finally {
      Request.ignoreAcceptHeader = oldIgnoreAcceptHeader;
    }
  });
});

describe("RequestProtocol", () => {
  it("reports ssl", async () => {
    assertNotPredicate(await stubRequest(), (r) => r.ssl);
    assertPredicate(await stubRequest({ HTTPS: "on" }), (r) => r.ssl);
  });

  it("reports ssl when proxied via lighttpd", async () => {
    assertPredicate(await stubRequest({ HTTP_X_FORWARDED_PROTO: "https" }), (r) => r.ssl);
  });

  it("scheme returns https when proxied", async () => {
    let request = await stubRequest({ "rack.url_scheme": "http" });
    assertNotPredicate(request, (r) => r.ssl);
    assertEqual("http", request.scheme);

    request = await stubRequest({ "rack.url_scheme": "http", HTTP_X_FORWARDED_PROTO: "https" });
    assertPredicate(request, (r) => r.ssl);
    assertEqual("https", request.scheme);
  });

  it("server software", async () => {
    assertEqual(
      "lighttpd",
      (await stubRequest({ SERVER_SOFTWARE: "lighttpd/1.4.5" })).serverSoftware,
    );
    assertEqual("apache", (await stubRequest({ SERVER_SOFTWARE: "Apache3.422" })).serverSoftware);
  });

  it("xml http request", async () => {
    let request = await stubRequest();

    assertNotPredicate(request, (r) => r.isXmlHttpRequest);
    assertNotPredicate(request, (r) => r.xhr);

    request = await stubRequest({ HTTP_X_REQUESTED_WITH: "DefinitelyNotAjax1.0" });
    assertNotPredicate(request, (r) => r.isXmlHttpRequest);
    assertNotPredicate(request, (r) => r.xhr);

    request = await stubRequest({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" });
    assertPredicate(request, (r) => r.isXmlHttpRequest);
    assertPredicate(request, (r) => r.xhr);
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

    assertPredicate(err.message, (m) =>
      isValidEncoding(String.fromCharCode(...bytes(m)), Encoding.UTF_8),
    );
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
  it("IPs that match localhost", async () => {
    const request = await stubRequest({ REMOTE_IP: "127.1.1.1", REMOTE_ADDR: "127.1.1.1" });
    assertPredicate(request, (r) => r.isLocal);
  });
});

describe("RequestEtag", () => {
  it("doesn't match absent If-None-Match", async () => {
    const request = await stubRequest();

    assertNil(request.ifNoneMatch);
    assertEqual([], request.ifNoneMatchEtags);

    assertNot(request.etagMatches("foo"));
    assertNot(request.etagMatches(null));
  });

  it("if_none_match_etags multiple", async () => {
    const header = 'etag1, etag2, "third etag", "etag4"';
    const expected = ["etag1", "etag2", '"third etag"', '"etag4"'];
    const request = await stubRequest({ HTTP_IF_NONE_MATCH: header });

    assertEqual(header, request.ifNoneMatch);
    assertEqual(expected, request.ifNoneMatchEtags);
    for (const etag of expected) {
      assert(request.etagMatches(etag), `Etag ${etag} did not match HTTP_IF_NONE_MATCH values`);
    }
  });

  it("always matches *", async () => {
    const request = await stubRequest({ HTTP_IF_NONE_MATCH: "*" });

    assertEqual("*", request.ifNoneMatch);
    assertEqual(["*"], request.ifNoneMatchEtags);

    assert(request.etagMatches('"strong"'));
    assert(request.etagMatches('W/"weak"'));
    assertNot(request.etagMatches(null));
  });

  it("matches opaque ETag validators without unquoting", async () => {
    const header = '"the-etag"';
    const request = await stubRequest({ HTTP_IF_NONE_MATCH: header });

    assertEqual(header, request.ifNoneMatch);
    assertEqual(['"the-etag"'], request.ifNoneMatchEtags);

    assert(request.etagMatches('"the-etag"'));
    assertNot(request.etagMatches("the-etag"));
  });
});

describe("RequestVariant", () => {
  let request: Request;

  beforeEach(async () => {
    request = await stubRequest();
  });

  it("setting variant to a symbol", async () => {
    request.variant = "phone";

    assertPredicate(request.variant, (v) => v["phone?"]());
    assertNotPredicate(request.variant, (v) => v["tablet?"]());
    assert(request.variant.any("phone", "tablet"));
    assertNot(request.variant.any("tablet", "desktop"));
  });

  it("setting variant to an array of symbols", async () => {
    request.variant = ["phone", "tablet"];

    assertPredicate(request.variant, (v) => v["phone?"]());
    assertPredicate(request.variant, (v) => v["tablet?"]());
    assertNotPredicate(request.variant, (v) => v["desktop?"]());
    assert(request.variant.any("tablet", "desktop"));
    assertNot(request.variant.any("desktop", "watch"));
  });

  it("clearing variant", async () => {
    request.variant = null;

    assertEmpty(request.variant);
    assertNotPredicate(request.variant, (v) => v["phone?"]());
    assertNot(request.variant.any("phone", "tablet"));
  });

  it("setting variant to a non-symbol value", async () => {
    await assertRaise([ArgumentError], {}, () => {
      request.variant = 123 as never;
    });
  });

  it("setting variant to an array containing a non-symbol value", async () => {
    await assertRaise([ArgumentError], {}, () => {
      request.variant = ["phone", 123] as never;
    });
  });
});

describe("RequestFormData", () => {
  it("media_type is from the FORM_DATA_MEDIA_TYPES array", async () => {
    assertPredicate(
      await stubRequest({ CONTENT_TYPE: "application/x-www-form-urlencoded" }),
      (r) => r.formData,
    );
    assertPredicate(await stubRequest({ CONTENT_TYPE: "multipart/form-data" }), (r) => r.formData);
  });

  it("media_type is not from the FORM_DATA_MEDIA_TYPES array", async () => {
    assertNotPredicate(await stubRequest({ CONTENT_TYPE: "application/xml" }), (r) => r.formData);
    assertNotPredicate(await stubRequest({ CONTENT_TYPE: "multipart/related" }), (r) => r.formData);
  });

  it("no Content-Type header is provided and the request_method is POST", async () => {
    const request = await stubRequest({ REQUEST_METHOD: "POST" });

    assertNil(request.mediaType);
    assertEqual("POST", request.requestMethod);
    assertNotPredicate(request, (r) => r.formData);
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
  it("#session", async () => {
    const request = await stubRequest();
    void request.session;

    assertNotPredicate(Session.find(request)!, (s) => s.isEnabled());
    assertInstanceOf(Session.Options, Session.Options.find(request));
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
  it("CGI environment variables", async () => {
    const request = await stubRequest({
      AUTH_TYPE: "Basic",
      GATEWAY_INTERFACE: "CGI/1.1",
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

    assertEqual("Basic", request.authType);
    assertEqual(0, request.contentLength);
    assertNil(request.contentMimeType);
    assertEqual("CGI/1.1", request.gatewayInterface);
    assertEqual("*/*", request.accept);
    assertEqual("UTF-8", request.acceptCharset);
    assertEqual("gzip, deflate", request.acceptEncoding);
    assertEqual("en", request.acceptLanguage);
    assertEqual("no-cache, max-age=0", request.cacheControl);
    assertEqual("googlebot", request.from);
    assertEqual("glu.ttono.us", request.host);
    assertEqual("trans", request.negotiate);
    assertEqual("no-cache", request.pragma);
    assertEqual("http://www.google.com/search?q=glu.ttono.us", request.referer);
    assertEqual("Mozilla/5.0 (Macintosh; U; PPC Mac OS X; en)", request.userAgent);
    assertEqual("/homepage/", request.pathInfo);
    assertEqual("/home/kevinc/sites/typo/public/homepage/", request.pathTranslated);
    assertEqual("", request.queryString);
    assertEqual("207.7.108.53", request.remoteAddr);
    assertEqual("google.com", request.remoteHost);
    assertEqual("kevin", request.remoteIdent);
    assertEqual("kevin", request.remoteUser);
    assertEqual("GET", request.requestMethod);
    assertEqual("/dispatch.fcgi", request.scriptName);
    assertEqual("glu.ttono.us", request.serverName);
    assertEqual(8007, request.serverPort);
    assertEqual("HTTP/1.1", request.serverProtocol);
    assertEqual("lighttpd", request.serverSoftware);
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

  it("filtered_path should not unescape a genuine '[FILTERED]' value", async () => {
    const request = await stubRequest({
      QUERY_STRING: "secret=bd4f21f&genuine=%5BFILTERED%5D",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = request.filteredPath();
    assertEqual(
      request.scriptName + "/authenticate?secret=[FILTERED]&genuine=%5BFILTERED%5D",
      path,
    );
  });

  it("filtered_path should preserve duplication of keys in query string", async () => {
    const request = await stubRequest({
      QUERY_STRING: "username=sikachu&secret=bd4f21f&username=fxn",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = request.filteredPath();
    assertEqual(
      request.scriptName + "/authenticate?username=sikachu&secret=[FILTERED]&username=fxn",
      path,
    );
  });

  it("filtered_path should ignore searchparts", async () => {
    const request = await stubRequest({
      QUERY_STRING: "secret",
      PATH_INFO: "/authenticate",
      "action_dispatch.parameter_filter": ["secret"],
    });

    const path = request.filteredPath();
    assertEqual(request.scriptName + "/authenticate?secret", path);
  });

  it("parameter_filter returns the same instance of ActiveSupport::ParameterFilter", async () => {
    const request = await stubRequest({
      "action_dispatch.parameter_filter": ["secret"],
    });

    const filter = request.parameterFilter();

    assertKindOf(ParameterFilter, filter);
    assertEqual(
      { secret: "[FILTERED]", something: "bar" },
      filter.filter({ secret: "foo", something: "bar" }),
    );
    assertSame(filter, request.parameterFilter());
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
