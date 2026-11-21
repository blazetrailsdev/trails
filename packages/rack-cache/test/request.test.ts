import { describe, it, expect } from "vitest";
import { Request } from "../lib/request.js";

describe("Rack::Cache::Request", () => {
  it("is marked as no_cache when the cache-control header includes the no-cache directive", () => {
    const request = new Request({ HTTP_CACHE_CONTROL: "public, no-cache" });
    expect(request.isNoCache()).toBeTruthy();
  });

  it("is marked as no_cache when request should not be loaded from cache", () => {
    const request = new Request({ HTTP_PRAGMA: "no-cache" });
    expect(request.isNoCache()).toBeTruthy();
  });

  it("is not marked as no_cache when neither no-cache directive is specified", () => {
    const request = new Request({ HTTP_CACHE_CONTROL: "public" });
    expect(request.isNoCache()).toBeFalsy();
  });
});
