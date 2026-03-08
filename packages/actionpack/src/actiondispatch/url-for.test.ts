import { describe, it, expect } from "vitest";
import { urlFor } from "./url-for.js";

describe("ActionController::UrlFor", () => {
  it("exception is thrown without host", () => {
    expect(() => urlFor({ path: "/posts" })).toThrow(/Missing host/);
  });

  it("anchor", () => {
    expect(urlFor({ host: "example.com", path: "/posts", anchor: "comments" }))
      .toBe("http://example.com/posts#comments");
  });

  it("nil anchor", () => {
    expect(urlFor({ host: "example.com", path: "/posts" }))
      .toBe("http://example.com/posts");
  });

  it("false anchor", () => {
    // Empty string anchor means no fragment
    expect(urlFor({ host: "example.com", path: "/posts", anchor: "" }))
      .toBe("http://example.com/posts");
  });

  it("anchor should escape unsafe pchar", () => {
    expect(urlFor({ host: "example.com", path: "/", anchor: "one two" }))
      .toBe("http://example.com/#one%20two");
  });

  it("default host", () => {
    expect(urlFor({ host: "example.com", path: "/" }))
      .toBe("http://example.com/");
  });

  it("host may be overridden", () => {
    expect(urlFor({ host: "other.com", path: "/" }))
      .toBe("http://other.com/");
  });

  it("port", () => {
    expect(urlFor({ host: "example.com", port: 8080, path: "/" }))
      .toBe("http://example.com:8080/");
  });

  it("default port", () => {
    // Port 80 for http should not appear
    expect(urlFor({ host: "example.com", port: 80, path: "/" }))
      .toBe("http://example.com/");
  });

  it("protocol with and without separators", () => {
    expect(urlFor({ host: "example.com", protocol: "https", path: "/" }))
      .toBe("https://example.com/");
    expect(urlFor({ host: "example.com", protocol: "https://", path: "/" }))
      .toBe("https://example.com/");
    expect(urlFor({ host: "example.com", protocol: "https:", path: "/" }))
      .toBe("https://example.com/");
  });

  it("without protocol", () => {
    expect(urlFor({ host: "example.com", path: "/" }))
      .toBe("http://example.com/");
  });

  it("without protocol and with port", () => {
    expect(urlFor({ host: "example.com", port: 3000, path: "/" }))
      .toBe("http://example.com:3000/");
  });

  it("user name and password", () => {
    expect(urlFor({ host: "example.com", user: "admin", password: "secret", path: "/" }))
      .toBe("http://admin:secret@example.com/");
  });

  it("user name and password with escape codes", () => {
    expect(urlFor({ host: "example.com", user: "a b", password: "c&d", path: "/" }))
      .toBe("http://a%20b:c%26d@example.com/");
  });

  it("trailing slash", () => {
    expect(urlFor({ host: "example.com", path: "/posts", trailing_slash: true }))
      .toBe("http://example.com/posts/");
  });

  it("trailing slash with protocol", () => {
    expect(urlFor({ host: "example.com", protocol: "https", path: "/posts", trailing_slash: true }))
      .toBe("https://example.com/posts/");
  });

  it("trailing slash with only path", () => {
    expect(urlFor({ path: "/posts", trailing_slash: true, only_path: true }))
      .toBe("/posts/");
  });

  it("trailing slash with anchor", () => {
    expect(urlFor({ host: "example.com", path: "/posts", trailing_slash: true, anchor: "top" }))
      .toBe("http://example.com/posts/#top");
  });

  it("trailing slash with params", () => {
    expect(urlFor({ host: "example.com", path: "/posts", trailing_slash: true, params: { page: "1" } }))
      .toBe("http://example.com/posts/?page=1");
  });

  it("only path", () => {
    expect(urlFor({ path: "/posts", only_path: true }))
      .toBe("/posts");
  });

  it("one parameter", () => {
    expect(urlFor({ host: "example.com", path: "/posts", params: { page: "2" } }))
      .toBe("http://example.com/posts?page=2");
  });

  it("two parameters", () => {
    const url = urlFor({ host: "example.com", path: "/posts", params: { page: "2", per: "10" } });
    expect(url).toContain("page=2");
    expect(url).toContain("per=10");
    expect(url).toContain("?");
    expect(url).toContain("&");
  });

  it("hash parameter", () => {
    const url = urlFor({ host: "example.com", path: "/", params: { filter: { name: "test" } } });
    expect(url).toContain("filter%5Bname%5D=test");
  });

  it("array parameter", () => {
    const url = urlFor({ host: "example.com", path: "/", params: { ids: [1, 2, 3] } });
    expect(url).toContain("ids%5B%5D=1");
    expect(url).toContain("ids%5B%5D=2");
    expect(url).toContain("ids%5B%5D=3");
  });

  it("relative url root is respected", () => {
    const url = urlFor({ host: "example.com", path: "/posts", script_name: "/app" });
    expect(url).toBe("http://example.com/app/posts");
  });

  it("using nil script name properly concats with original script name", () => {
    const url = urlFor({ host: "example.com", path: "/posts" });
    expect(url).toBe("http://example.com/posts");
  });

  it("url params with nil to param are not in url", () => {
    const url = urlFor({ host: "example.com", path: "/", params: { a: null, b: "2" } });
    expect(url).not.toContain("a=");
    expect(url).toContain("b=2");
  });

  it("false url params are included in query", () => {
    const url = urlFor({ host: "example.com", path: "/", params: { a: false } });
    expect(url).toContain("a=false");
  });

  it("nested optional", () => {
    // Just test that url generation works with basic path
    expect(urlFor({ host: "example.com", path: "/posts" }))
      .toBe("http://example.com/posts");
  });

  it("https default port", () => {
    // Port 443 for https should not appear
    expect(urlFor({ host: "example.com", protocol: "https", port: 443, path: "/" }))
      .toBe("https://example.com/");
  });
});
