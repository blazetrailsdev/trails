import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import type { Heap } from "../lib/meta-store.js";
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
  for (const range of [
    [201, 202],
    [204, 206],
    [303, 305],
    [400, 403],
    [405, 409],
    [411, 417],
    [500, 505],
  ]) {
    for (let responseCode = range[0]; responseCode <= range[1]; responseCode++) {
      it(`does not cache ${responseCode} responses`, async () => {
        respondWith(responseCode, { expires: new Date(Date.now() + 5000).toUTCString() });
        await get("/");

        expect(H.cache!.trace).not.toContain("store");
        expect(H.response!.status).toEqual(responseCode);
        expect(H.response!.headers).not.toInclude("age");
      });
    }
  }

  it("does not cache responses with explicit no-store directive", async () => {
    respondWith(200, {
      expires: new Date(Date.now() + 5000).toUTCString(),
      "cache-control": "no-store",
    });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.headers).not.toInclude("age");
  });

  it("does not cache responses without freshness information or a validator", async () => {
    respondWith(200);
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).not.toContain("store");
  });

  it("caches responses with explicit no-cache directive", async () => {
    respondWith(200, {
      expires: new Date(Date.now() + 5000).toUTCString(),
      "cache-control": "no-cache",
    });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.headers).toInclude("age");
  });

  it("caches responses with an Expiration header", async () => {
    respondWith(200, { expires: new Date(Date.now() + 5000).toUTCString() });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.response!.headers).toInclude("date");
    expect(H.response!.get("age") == null).toBeFalsy();
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(Object.keys(((await H.cache!.metastore()) as Heap).toHash()).length).toEqual(1);
  });

  it("caches responses with a max-age directive", async () => {
    respondWith(200, { "cache-control": "max-age=5" });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.response!.headers).toInclude("date");
    expect(H.response!.get("age") == null).toBeFalsy();
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(Object.keys(((await H.cache!.metastore()) as Heap).toHash()).length).toEqual(1);
  });

  it("caches responses with a s-maxage directive", async () => {
    respondWith(200, { "cache-control": "s-maxage=5" });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.response!.headers).toInclude("date");
    expect(H.response!.get("age") == null).toBeFalsy();
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(Object.keys(((await H.cache!.metastore()) as Heap).toHash()).length).toEqual(1);
  });

  it("caches responses with a last-modified validator but no freshness information", async () => {
    respondWith(200, { "last-modified": new Date().toUTCString() });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
  });

  it("caches responses with an etag validator but no freshness information", async () => {
    respondWith(200, { etag: '"123456"' });
    await get("/");

    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
  });

  it("hits cached response with expires header", async () => {
    respondWith(200, {
      date: new Date(Date.now() - 5000).toUTCString(),
      expires: new Date(Date.now() + 5000).toUTCString(),
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("date");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.response!.get("date")).toEqual(H.responses[0].get("date"));
    expect(Number.parseInt(H.response!.get("age"), 10)).toBeGreaterThan(0);
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("fresh");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.body).toEqual("Hello World");
  });

  it("hits cached response with max-age directive", async () => {
    respondWith(200, {
      date: new Date(Date.now() - 5000).toUTCString(),
      "cache-control": "max-age=10",
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("date");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.response!.get("date")).toEqual(H.responses[0].get("date"));
    expect(Number.parseInt(H.response!.get("age"), 10)).toBeGreaterThan(0);
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("fresh");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.body).toEqual("Hello World");
  });

  it("hits cached response with s-maxage directive", async () => {
    respondWith(200, {
      date: new Date(Date.now() - 5000).toUTCString(),
      "cache-control": "s-maxage=10, max-age=0",
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("date");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.response!.get("date")).toEqual(H.responses[0].get("date"));
    expect(Number.parseInt(H.response!.get("age"), 10)).toBeGreaterThan(0);
    expect(H.response!.get("x-content-digest") == null).toBeFalsy();
    expect(H.cache!.trace).toContain("fresh");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.body).toEqual("Hello World");
  });

  it("assigns default_ttl when response has no freshness information", async () => {
    respondWith(200);

    await get("/", { "rack-cache.default_ttl": 10 });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");
    expect(H.response!.get("cache-control")).toContain("s-maxage=10");

    await get("/", { "rack-cache.default_ttl": 10 });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.cache!.trace).toContain("fresh");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.body).toEqual("Hello World");
  });

  it("does not assign default_ttl when response has must-revalidate directive", async () => {
    respondWith(200, {
      "cache-control": "must-revalidate",
    });

    await get("/", { "rack-cache.default_ttl": 10 });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.get("cache-control")).not.toContain("s-maxage");
    expect(H.response!.body).toEqual("Hello World");
  });
});
