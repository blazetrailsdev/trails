import { describe, expect, it } from "vitest";
import {
  BadURIError,
  Error as URIError,
  Generic,
  HTTP,
  HTTPS,
  InvalidComponentError,
  DEFAULT_PARSER,
  InvalidURIError,
  RFC2396_PARSER,
  URI,
} from "./uri.js";

describe("URI.parse", () => {
  it("answers the registered scheme class, and URI::Generic for a scheme-less reference", () => {
    expect(URI.parse("http://example.com/a") instanceof HTTP).toBe(true);
    expect(URI.parse("https://example.com/a") instanceof HTTPS).toBe(true);
    expect(URI.parse("//example.com/").constructor).toBe(Generic);
    expect(URI.parse("foo://example.com/") instanceof Generic).toBe(true);
  });

  it("splits the components a URI carries", () => {
    const uri = URI.parse("http://john:pw@example.com:8080/a/b?q=1#top");
    expect([uri.scheme, uri.userinfo, uri.host, uri.port]).toEqual([
      "http",
      "john:pw",
      "example.com",
      8080,
    ]);
    expect([uri.path, uri.query, uri.fragment]).toEqual(["/a/b", "q=1", "top"]);
    expect(uri.toString()).toBe("http://john:pw@example.com:8080/a/b?q=1#top");
  });

  it("raises URI::InvalidURIError on a string that is not a URI", () => {
    expect(() => URI.parse("http://example.com/\\")).toThrow(InvalidURIError);
    expect(new InvalidURIError("x")).toBeInstanceOf(URIError);
  });

  it("rejects a long almost-matching authority without backtracking", () => {
    const started = Date.now();
    expect(() => URI.parse(`http://${"a".repeat(50000)}\\`)).toThrow(InvalidURIError);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("URI::Generic", () => {
  it("answers the scheme's default port, and nil for a scheme it does not know", () => {
    expect(URI.parse("http://example.com/").port).toBe(80);
    expect(URI.parse("https://example.com/").port).toBe(443);
    expect(URI.parse("https://example.com/").defaultPort).toBe(443);
    expect(URI.parse("//example.com/").port).toBe(null);
    expect(URI.parse("//example.com/").defaultPort).toBe(null);
  });

  it("leaves the default port out of to_s and keeps a non-default one", () => {
    expect(URI.parse("http://example.com:80/x").toString()).toBe("http://example.com/x");
    expect(URI.parse("http://example.com:8080/x").toString()).toBe("http://example.com:8080/x");
  });

  it("is mutable: scheme, host, port and path re-serialize", () => {
    const uri = URI.parse("/foo");
    expect(uri.host).toBe(null);
    uri.path = "/" + uri.path;
    uri.host ??= "example.org";
    uri.scheme ??= "http";
    expect(uri.toString()).toBe("http://example.org//foo");
    expect(uri.port).toBe(null);
    expect(uri.defaultPort).toBe(null);
  });

  it("converts a port string with String#to_i, so a whitespace-only one is 0", () => {
    const uri = URI.parse("http://example.com/x");
    uri.port = "   ";
    expect(uri.port).toBe(0);
    uri.port = 8080;
    expect(uri.port).toBe(8080);
    expect(() => {
      uri.port = "8080abc";
    }).toThrow(InvalidComponentError);
  });

  it("does not normalize the case of the host or path, as a WHATWG URL would", () => {
    expect(URI.parse("HTTP://E.com/X").toString()).toBe("http://E.com/X");
    expect(new URL("HTTP://E.com/X").toString()).toBe("http://e.com/X");
  });
});

describe("URI::Generic#merge", () => {
  it("merges a relative reference against the base path", () => {
    expect(URI.parse("http://e.com/a/b").merge("c").toString()).toBe("http://e.com/a/c");
    expect(URI.parse("http://a/b/c/d;p?q").merge("../../g").toString()).toBe("http://a/g");
    expect(URI.parse("http://a/b#f").merge("g#h").toString()).toBe("http://a/g#h");
    expect(URI.parse("http://a/b").merge("//other/z").toString()).toBe("http://other/z");
  });

  it("returns an absolute other unchanged, and raises when both are relative", () => {
    expect(URI.parse("http://a/b").merge("http://c/d").toString()).toBe("http://c/d");
    expect(() => URI.parse("/a").merge("b")).toThrow(BadURIError);
  });

  it("drops the base query where the WHATWG URL resolver keeps the base path", () => {
    expect(URI.parse("http://e.com/a/b?x=1").merge("?y=2").toString()).toBe("http://e.com/a/b?y=2");
    expect(URI.parse("http://e.com/a/b").merge("").toString()).toBe("http://e.com/a/b");
    expect(new URL("", "http://e.com/a/b").toString()).toBe("http://e.com/a/b");
    expect(URI.parse("http://e.com/a/b").merge("..").toString()).toBe("http://e.com/");
  });

  it("does not mutate the receiver", () => {
    const base = URI.parse("http://e.com/a/b");
    base.merge("c");
    expect(base.toString()).toBe("http://e.com/a/b");
  });
});

describe("URI::RFC2396_Parser#escape", () => {
  it("escapes only what is neither unreserved nor reserved", () => {
    expect(RFC2396_PARSER.escape("a b/c?d=e&f[]")).toBe("a%20b/c?d=e&f[]");
    expect(encodeURI("a b/c?d=e&f[]")).toBe("a%20b/c?d=e&f%5B%5D");
    expect(RFC2396_PARSER.escape("a#b")).toBe("a%23b");
  });

  it("escapes a multibyte character one UTF-8 byte at a time", () => {
    expect(RFC2396_PARSER.escape("é")).toBe("%C3%A9");
  });

  it("takes a String unsafe set as well as a Regexp", () => {
    expect(RFC2396_PARSER.escape("a@b:c/d", "@:/")).toBe("a%40b%3Ac%2Fd");
  });
});

describe("URI::RFC2396_Parser#split", () => {
  it("splits an absolute URI against regexp[:ABS_URI]", () => {
    const abs = ["http", null, "a.example.com", "8080", null, "/p", null, "q", "f"];
    expect(DEFAULT_PARSER.split("http://a.example.com:8080/p?q#f")).toEqual(abs);
  });

  it("splits an opaque URI into the opaque slot", () => {
    const opaque = ["mailto", null, null, null, null, null, "x@y.com", null, null];
    expect(DEFAULT_PARSER.split("mailto:x@y.com")).toEqual(opaque);
  });

  it("raises InvalidURIError on a string that is not a URI", () => {
    expect(() => DEFAULT_PARSER.split("http://")).toThrow(InvalidURIError);
  });

  it("parses through URI.for, answering the registered scheme class", () => {
    expect(DEFAULT_PARSER.parse("http://example.com/x")).toBeInstanceOf(HTTP);
  });
});

describe("URI::Generic with the default parser", () => {
  function generic(): Generic {
    return new Generic(null, null, null, null, null, null, null, null, null);
  }

  it("defaults its parser to DEFAULT_PARSER", () => {
    expect(generic().parser).toBe(DEFAULT_PARSER);
  });

  it("checks scheme= against regexp[:SCHEME]", () => {
    const u = generic();
    u.scheme = "http";
    expect(u.scheme).toBe("http");
    expect(() => (u.scheme = "1bad")).toThrow(
      new InvalidComponentError("bad component(expected scheme component): 1bad"),
    );
  });

  it("checks host= against regexp[:HOST]", () => {
    const u = generic();
    u.host = "example.com";
    expect(u.host).toBe("example.com");
    expect(() => (u.host = "bad host")).toThrow(
      new InvalidComponentError("bad component(expected host component): bad host"),
    );
  });

  it("checks port= against regexp[:PORT]", () => {
    const u = generic();
    u.port = "8080";
    expect(u.port).toBe(8080);
    expect(() => (u.port = "80a")).toThrow(
      new InvalidComponentError('bad component(expected port component): "80a"'),
    );
  });

  it("checks path= against regexp[:ABS_PATH] and regexp[:REL_PATH]", () => {
    const u = generic();
    u.scheme = "http";
    u.path = "/a/b";
    expect(u.path).toBe("/a/b");
    expect(() => (u.path = "rel")).toThrow(
      new InvalidComponentError("bad component(expected absolute path component): rel"),
    );
  });

  it("checks fragment= against regexp[:FRAGMENT]", () => {
    const u = generic();
    u.fragment = "x";
    expect(u.fragment).toBe("x");
  });
});
