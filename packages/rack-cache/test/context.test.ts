import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import * as H from "./support/test-helper.js";
import {
  get,
  post,
  respondWith,
  setupCacheContext,
  teardownCacheContext,
} from "./support/test-helper.js";

describe("Rack::Cache::Context", () => {
  beforeEach(() => setupCacheContext());
  afterEach(() => teardownCacheContext());

  it("passes on non-GET/HEAD requests", async () => {
    respondWith(200);
    await post("/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("pass");
    expect(H.response!.headers).not.toInclude("age");
  });

  it("fetches response from backend when cache misses", async () => {
    respondWith(200, { expires: new Date(Date.now() + 5000).toUTCString() });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.response!.headers).toInclude("age");
  });
});
