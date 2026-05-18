import { describe, expect, it } from "vitest";
import { ParameterFilter } from "@blazetrails/activesupport";
import {
  FILTERED,
  type FilterRedirectHost,
  type FilterRedirectRequest,
  filteredLocation,
} from "./filter-redirect.js";

function makeRequest(
  redirectFilter: Array<string | RegExp> | undefined,
  paramFilters: Array<string | RegExp> = [],
): FilterRedirectRequest {
  return {
    getHeader: (k) => (k === "action_dispatch.redirect_filter" ? redirectFilter : undefined),
    parameterFilter: () => new ParameterFilter(paramFilters),
  };
}

function makeHost(
  location: string,
  request: FilterRedirectRequest | null = null,
): FilterRedirectHost {
  return { location, request };
}

describe("filteredLocation", () => {
  it("returns FILTERED when a string redirect_filter substring matches", () => {
    const host = makeHost("https://example.com/admin/secret", makeRequest(["admin"]));
    expect(filteredLocation.call(host)).toBe(FILTERED);
  });

  it("returns FILTERED when a regexp redirect_filter matches", () => {
    const host = makeHost("https://example.com/u/42", makeRequest([/\/u\/\d+/]));
    expect(filteredLocation.call(host)).toBe(FILTERED);
  });

  it("returns FILTERED when the URL cannot be parsed", () => {
    // `http://[invalid` triggers a WHATWG URL parse error (invalid IPv6 host).
    const host = makeHost("http://[invalid", makeRequest([]));
    expect(filteredLocation.call(host)).toBe(FILTERED);
  });

  it("returns the URL unchanged when there are no filters and no query string", () => {
    const host = makeHost("https://example.com/path", makeRequest([]));
    expect(filteredLocation.call(host)).toBe("https://example.com/path");
  });

  it("filters sensitive query parameters using the request parameter filter", () => {
    const host = makeHost(
      "https://example.com/login?password=hunter2&name=alice",
      makeRequest([], ["password"]),
    );
    expect(filteredLocation.call(host)).toBe(
      "https://example.com/login?password=[FILTERED]&name=alice",
    );
  });

  it("returns the URL unchanged when there is no request", () => {
    const host = makeHost("https://example.com/path?foo=1", null);
    expect(filteredLocation.call(host)).toBe("https://example.com/path?foo=1");
  });

  it("handles relative URLs (Rails URI.parse parity)", () => {
    const host = makeHost("/login?password=hunter2&name=alice", makeRequest([], ["password"]));
    expect(filteredLocation.call(host)).toBe("/login?password=[FILTERED]&name=alice");
  });

  it("treats absent redirect_filter as an empty list", () => {
    const host = makeHost("https://example.com/path", makeRequest(undefined));
    expect(filteredLocation.call(host)).toBe("https://example.com/path");
  });
});
