import { describe, it, expect } from "vitest";
import { CacheControl } from "../lib/cache-control.js";

describe("Rack::Cache::CacheControl", () => {
  it("takes no args and initializes with an empty set of values", () => {
    const cacheControl = new CacheControl();
    expect(cacheControl.isEmpty()).toBeTruthy();
    expect(cacheControl.toString()).toBe("");
  });

  it("takes a String and parses it into a Hash when created", () => {
    const cacheControl = new CacheControl("max-age=600, foo");
    expect(cacheControl.get("max-age")).toBe("600");
    expect(cacheControl.get("foo")).toBe(true);
  });

  it("takes a String with a single name=value pair", () => {
    const cacheControl = new CacheControl("max-age=600");
    expect(cacheControl.get("max-age")).toBe("600");
  });

  it("takes a String with multiple name=value pairs", () => {
    const cacheControl = new CacheControl("max-age=600, max-stale=300, min-fresh=570");
    expect(cacheControl.get("max-age")).toBe("600");
    expect(cacheControl.get("max-stale")).toBe("300");
    expect(cacheControl.get("min-fresh")).toBe("570");
  });

  it("takes a String with a single flag value", () => {
    const cacheControl = new CacheControl("no-cache");
    expect([...cacheControl.keys()]).toContain("no-cache");
    expect(cacheControl.get("no-cache")).toBe(true);
  });

  it("takes a String with a bunch of all kinds of stuff", () => {
    const cacheControl = new CacheControl("max-age=600,must-revalidate,min-fresh=3000,foo=bar,baz");
    expect(cacheControl.get("max-age")).toBe("600");
    expect(cacheControl.get("must-revalidate")).toBe(true);
    expect(cacheControl.get("min-fresh")).toBe("3000");
    expect(cacheControl.get("foo")).toBe("bar");
    expect(cacheControl.get("baz")).toBe(true);
  });

  it("strips leading and trailing spaces from header value", () => {
    const cacheControl = new CacheControl("   public,   max-age =   600  ");
    expect([...cacheControl.keys()]).toContain("public");
    expect([...cacheControl.keys()]).toContain("max-age");
    expect(cacheControl.get("max-age")).toBe("600");
  });

  it("strips blank segments", () => {
    const cacheControl = new CacheControl("max-age=600,,max-stale=300");
    expect(cacheControl.get("max-age")).toBe("600");
    expect(cacheControl.get("max-stale")).toBe("300");
  });

  it("removes all directives with #clear", () => {
    const cacheControl = new CacheControl("max-age=600, must-revalidate");
    cacheControl.clear();
    expect(cacheControl.isEmpty()).toBeTruthy();
  });

  it("converts self into header String with #to_s", () => {
    const cacheControl = new CacheControl();
    cacheControl.set("public", true);
    cacheControl.set("max-age", "600");
    expect(cacheControl.toString().split(", ").sort()).toEqual(["max-age=600", "public"]);
  });

  it("sorts alphabetically with boolean directives before value directives", () => {
    const cacheControl = new CacheControl("foo=bar, z, x, y, bling=baz, zoom=zib, b, a");
    expect(cacheControl.toString()).toBe("a, b, x, y, z, bling=baz, foo=bar, zoom=zib");
  });

  it("responds to #max_age with an integer when max-age directive present", () => {
    const cacheControl = new CacheControl("public, max-age=600");
    expect(cacheControl.maxAge()).toBe(600);
  });

  it("responds to #max_age with nil when no max-age directive present", () => {
    const cacheControl = new CacheControl("public");
    expect(cacheControl.maxAge()).toBeNull();
  });

  it("responds to #shared_max_age with an integer when s-maxage directive present", () => {
    const cacheControl = new CacheControl("public, s-maxage=600");
    expect(cacheControl.sharedMaxAge()).toBe(600);
  });

  it("responds to #shared_max_age with nil when no s-maxage directive present", () => {
    const cacheControl = new CacheControl("public");
    expect(cacheControl.sharedMaxAge()).toBeNull();
  });

  it("responds to #reverse_max_age with an integer when r-maxage directive present", () => {
    const cacheControl = new CacheControl("public, r-maxage=600");
    expect(cacheControl.reverseMaxAge()).toBe(600);
  });

  it("responds to #reverse_max_age with nil when no r-maxage directive present", () => {
    const cacheControl = new CacheControl("public");
    expect(cacheControl.reverseMaxAge()).toBeNull();
  });

  it("responds to #public? truthfully when public directive present", () => {
    const cacheControl = new CacheControl("public");
    expect(cacheControl.isPublic()).toBeTruthy();
  });

  it("responds to #public? non-truthfully when no public directive present", () => {
    const cacheControl = new CacheControl("private");
    expect(cacheControl.isPublic()).toBeFalsy();
  });

  it("responds to #private? truthfully when private directive present", () => {
    const cacheControl = new CacheControl("private");
    expect(cacheControl.isPrivate()).toBeTruthy();
  });

  it("responds to #private? non-truthfully when no private directive present", () => {
    const cacheControl = new CacheControl("public");
    expect(cacheControl.isPrivate()).toBeFalsy();
  });

  it("responds to #no_cache? truthfully when no-cache directive present", () => {
    const cacheControl = new CacheControl("no-cache");
    expect(cacheControl.isNoCache()).toBeTruthy();
  });

  it("responds to #no_cache? non-truthfully when no no-cache directive present", () => {
    const cacheControl = new CacheControl("max-age=600");
    expect(cacheControl.isNoCache()).toBeFalsy();
  });

  it("responds to #must_revalidate? truthfully when must-revalidate directive present", () => {
    const cacheControl = new CacheControl("must-revalidate");
    expect(cacheControl.isMustRevalidate()).toBeTruthy();
  });

  it("responds to #must_revalidate? non-truthfully when no must-revalidate directive present", () => {
    const cacheControl = new CacheControl("max-age=600");
    expect(cacheControl.isNoCache()).toBeFalsy();
  });

  it("responds to #proxy_revalidate? truthfully when proxy-revalidate directive present", () => {
    const cacheControl = new CacheControl("proxy-revalidate");
    expect(cacheControl.isProxyRevalidate()).toBeTruthy();
  });

  it("responds to #proxy_revalidate? non-truthfully when no proxy-revalidate directive present", () => {
    const cacheControl = new CacheControl("max-age=600");
    expect(cacheControl.isNoCache()).toBeFalsy();
  });
});
