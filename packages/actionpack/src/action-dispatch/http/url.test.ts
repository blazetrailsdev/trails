import { describe, it, expect, beforeEach } from "vitest";
import { URL } from "./url.js";

beforeEach(() => {
  URL.secureProtocol = false;
  URL.tldLength = 1;
});

describe("URL.extractDomain", () => {
  it("returns the domain at tld_length 1", () => {
    expect(URL.extractDomain("www.example.com", 1)).toBe("example.com");
  });

  it("returns the domain at tld_length 2", () => {
    expect(URL.extractDomain("dev.www.example.co.uk", 2)).toBe("example.co.uk");
  });

  it("returns null for an IP host", () => {
    expect(URL.extractDomain("192.168.1.1", 1)).toBeNull();
  });
});

describe("URL.extractSubdomains", () => {
  it("returns subdomains at tld_length 1", () => {
    expect(URL.extractSubdomains("www.example.com", 1)).toEqual(["www"]);
  });

  it("returns subdomains at tld_length 2", () => {
    expect(URL.extractSubdomains("dev.www.example.co.uk", 2)).toEqual(["dev", "www"]);
  });

  it("returns [] for an IP host", () => {
    expect(URL.extractSubdomains("192.168.1.1", 1)).toEqual([]);
  });
});

describe("URL.extractSubdomain", () => {
  it("joins subdomains with .", () => {
    expect(URL.extractSubdomain("dev.www.example.co.uk", 2)).toBe("dev.www");
  });
});

describe("URL.urlFor / pathFor", () => {
  it("only_path uses pathFor", () => {
    expect(URL.urlFor({ onlyPath: true, path: "/foo" })).toBe("/foo");
  });

  it("pathFor strips trailing slash from scriptName and appends path", () => {
    expect(URL.pathFor({ scriptName: "/app/", path: "/foo" })).toBe("/app/foo");
  });

  it("pathFor trailing_slash on blank path → /", () => {
    expect(URL.pathFor({ trailingSlash: true })).toBe("/");
  });

  it("pathFor appends params as query", () => {
    expect(URL.pathFor({ path: "/foo", params: { a: "1", b: "2" } })).toBe("/foo?a=1&b=2");
  });

  it("pathFor wraps non-hash params under :params", () => {
    expect(URL.pathFor({ path: "/foo", params: "x" })).toBe("/foo?params=x");
  });

  it("pathFor appends anchor with fragment escaping", () => {
    expect(URL.pathFor({ path: "/foo", anchor: "bar baz" })).toBe("/foo#bar%20baz");
  });

  it("pathFor skips nil-valued params", () => {
    expect(URL.pathFor({ path: "/foo", params: { a: "1", b: null } })).toBe("/foo?a=1");
  });
});

describe("URL.fullUrlFor", () => {
  it("raises when host is missing", () => {
    expect(() => URL.fullUrlFor({})).toThrow(/Missing host/);
  });

  it("builds a basic url with default http", () => {
    expect(URL.fullUrlFor({ host: "example.com", path: "/foo" })).toBe("http://example.com/foo");
  });

  it("respects secureProtocol when protocol is nil", () => {
    URL.secureProtocol = true;
    expect(URL.fullUrlFor({ host: "example.com", path: "/" })).toBe("https://example.com/");
  });

  it("protocol false → //", () => {
    expect(URL.fullUrlFor({ host: "example.com", protocol: false, path: "/" })).toBe(
      "//example.com/",
    );
  });

  it("normalizes a bare protocol string", () => {
    expect(URL.fullUrlFor({ host: "example.com", protocol: "ftp", path: "/" })).toBe(
      "ftp://example.com/",
    );
  });

  it("omits port when standard for protocol", () => {
    expect(URL.fullUrlFor({ host: "example.com", port: 80, path: "/" })).toBe(
      "http://example.com/",
    );
    expect(URL.fullUrlFor({ host: "example.com", protocol: "https", port: 443, path: "/" })).toBe(
      "https://example.com/",
    );
  });

  it("includes non-standard port", () => {
    expect(URL.fullUrlFor({ host: "example.com", port: 8080, path: "/" })).toBe(
      "http://example.com:8080/",
    );
  });

  it("parses protocol/port from host", () => {
    expect(URL.fullUrlFor({ host: "https://example.com:8443", path: "/" })).toBe(
      "https://example.com:8443/",
    );
  });

  it("encodes user/password in userinfo", () => {
    expect(URL.fullUrlFor({ host: "example.com", user: "a b", password: "p@ss", path: "/" })).toBe(
      "http://a+b:p%40ss@example.com/",
    );
  });

  it("rebuilds host from subdomain + domain options", () => {
    expect(URL.fullUrlFor({ host: "www.example.com", subdomain: "api", path: "/" })).toBe(
      "http://api.example.com/",
    );
  });

  it("strips subdomain when subdomain: false", () => {
    expect(URL.fullUrlFor({ host: "www.example.com", subdomain: false, path: "/" })).toBe(
      "http://example.com/",
    );
  });

  it("invalid protocol option raises", () => {
    expect(() =>
      URL.fullUrlFor({ host: "example.com", protocol: "::" as unknown as string }),
    ).toThrow(/Invalid :protocol/);
  });
});
