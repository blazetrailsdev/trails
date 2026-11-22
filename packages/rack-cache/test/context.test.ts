import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import type { Headers } from "@blazetrails/rack";
import { Marshal, Timeout, rbObjIvarGet } from "@blazetrails/ruby-compat";
import { Context } from "../lib/context.js";
import type { Heap } from "../lib/meta-store.js";
import * as H from "./support/test-helper.js";
import {
  FakeApp,
  get,
  head,
  post,
  request,
  respondWith,
  setupCacheContext,
  teardownCacheContext,
} from "./support/test-helper.js";

describe("Rack::Cache::Context", () => {
  beforeEach(() => setupCacheContext());
  afterEach(() => teardownCacheContext());

  it("passes options to the underlying stores", async () => {
    const app = new FakeApp(200, {}, ["foo"]);
    const context = new Context(app, { foo: "bar" });
    const entityOptions = rbObjIvarGet(await context.entitystore(), "@options") as Record<
      string,
      unknown
    >;
    const metaOptions = rbObjIvarGet(await context.metastore(), "@options") as Record<
      string,
      unknown
    >;

    expect(entityOptions.foo).toEqual("bar");
    expect(metaOptions.foo).toEqual("bar");
  });

  it("passes on non-GET/HEAD requests", async () => {
    respondWith(200);
    await post("/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("pass");
    expect(H.response!.headers).not.toInclude("age");
  });

  it("passes on rack-cache.force-pass", async () => {
    respondWith(200);
    await get("/", { "rack-cache.force-pass": true });

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toEqual(["pass"]);
    expect(H.response!.headers).not.toInclude("age");
  });

  it("passes on options requests", async () => {
    respondWith(200);
    await request("options", "/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("pass");
  });

  it("doesnt invalidate on options requests", async () => {
    respondWith(200);
    await request("options", "/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).not.toContain("invalidate");
  });

  for (const requestMethod of ["post", "put", "delete"]) {
    it(`invalidates on ${requestMethod} requests`, async () => {
      respondWith(200);
      await request(requestMethod, "/");

      expect(H.app!.isCalled()).toBeTruthy();
      expect(H.response!.isOk).toBeTruthy();
      expect(H.cache!.trace).toContain("invalidate");
      expect(H.cache!.trace).toContain("pass");
    });
  }

  it("does not cache with Authorization request header and non public response", async () => {
    respondWith(200, { etag: '"FOO"' });
    await get("/", { HTTP_AUTHORIZATION: "basic foobarbaz" });

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers["cache-control"]).toEqual("private");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.headers).not.toInclude("age");
  });

  it("does cache with Authorization request header and public response", async () => {
    respondWith(200, { "cache-control": "public", etag: '"FOO"' });
    await get("/", { HTTP_AUTHORIZATION: "basic foobarbaz" });

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).not.toContain("ignore");
    expect(H.response!.headers).toInclude("age");
    expect(H.response!.headers["cache-control"]).toEqual("public");
  });

  it("does not cache with Cookie header and non public response", async () => {
    respondWith(200, { etag: '"FOO"' });
    await get("/", { HTTP_COOKIE: "foo=bar" });

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers["cache-control"]).toEqual("private");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.headers).not.toInclude("age");
  });

  it("does not cache requests with a Cookie header", async () => {
    respondWith(200);
    await get("/", { HTTP_COOKIE: "foo=bar" });

    expect(H.response!.isOk).toBeTruthy();
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).not.toContain("store");
    expect(H.response!.headers).not.toInclude("age");
    expect(H.response!.headers["cache-control"]).toEqual("private");
  });

  it("does remove set-cookie response header from a cacheable response", async () => {
    respondWith(200, {
      "cache-control": "public",
      etag: '"FOO"',
      "set-cookie": "TestCookie=OK",
    });
    await get("/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).toContain("ignore");
    expect(H.response!.headers["set-cookie"] == null).toBeTruthy();
  });

  it("does remove all configured ignore_headers from a cacheable response", async () => {
    respondWith(200, {
      "cache-control": "public",
      etag: '"FOO"',
      "set-cookie": "TestCookie=OK",
      "x-strip-me": "Secret",
    });
    await get("/", { "rack-cache.ignore_headers": ["set-cookie", "x-strip-me"] });

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).toContain("ignore");
    expect(H.response!.headers["set-cookie"] == null).toBeTruthy();
    expect(H.response!.headers["x-strip-me"] == null).toBeTruthy();
  });

  it("does not remove set-cookie response header from a private response", async () => {
    respondWith(200, { "cache-control": "private", "set-cookie": "TestCookie=OK" });
    await get("/");

    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).not.toContain("store");
    expect(H.cache!.trace).not.toContain("ignore");
    expect(H.response!.headers["set-cookie"]).toEqual("TestCookie=OK");
  });

  it("responds with 304 when if-modified-since matches last-modified", async () => {
    const timestamp = new Date().toUTCString();
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.status = 200;
      res.setHeader("last-modified", timestamp);
      res.setHeader("content-type", "text/plain");
      res.body = ["Hello World"];
    });

    await get("/", { HTTP_IF_MODIFIED_SINCE: timestamp });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(304);
    expect(H.response!.originalHeaders).not.toInclude("content-length");
    expect(H.response!.originalHeaders).not.toInclude("content-type");
    expect(H.response!.body).toEqual("");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
  });

  it("responds with 304 when if-none-match matches etag", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.status = 200;
      res.setHeader("etag", "12345");
      res.setHeader("content-type", "text/plain");
      res.body = ["Hello World"];
    });

    await get("/", { HTTP_IF_NONE_MATCH: "12345" });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(304);
    expect(H.response!.originalHeaders).not.toInclude("content-length");
    expect(H.response!.originalHeaders).not.toInclude("content-type");
    expect(H.response!.headers).toInclude("etag");
    expect(H.response!.body).toEqual("");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
  });

  it("responds with 304 only if if-none-match and if-modified-since both match", async () => {
    const timestamp = new Date();

    respondWith(undefined, undefined, undefined, (req, res) => {
      res.status = 200;
      res.setHeader("etag", "12345");
      res.setHeader("last-modified", timestamp.toUTCString());
      res.setHeader("content-type", "text/plain");
      res.body = ["Hello World"];
    });

    await get("/", {
      HTTP_IF_NONE_MATCH: "12345",
      HTTP_IF_MODIFIED_SINCE: new Date(timestamp.getTime() - 1000).toUTCString(),
    });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(200);

    await get("/", {
      HTTP_IF_NONE_MATCH: "1234",
      HTTP_IF_MODIFIED_SINCE: timestamp.toUTCString(),
    });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(200);

    await get("/", {
      HTTP_IF_NONE_MATCH: "12345",
      HTTP_IF_MODIFIED_SINCE: timestamp.toUTCString(),
    });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(304);
  });

  it("validates private responses cached on the client", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      const etags = String(req.env["HTTP_IF_NONE_MATCH"] ?? "").split(/\s*,\s*/);
      if (req.env["HTTP_COOKIE"] === "authenticated") {
        res.setHeader("cache-control", "private, no-store");
        res.setHeader("etag", '"private tag"');
        if (etags.includes('"private tag"')) {
          res.status = 304;
        } else {
          res.status = 200;
          res.setHeader("content-type", "text/plain");
          res.body = ["private data"];
        }
      } else {
        res.setHeader("etag", '"public tag"');
        if (etags.includes('"public tag"')) {
          res.status = 304;
        } else {
          res.status = 200;
          res.setHeader("content-type", "text/plain");
          res.body = ["public data"];
        }
      }
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(200);
    expect(H.response!.headers["etag"]).toEqual('"public tag"');
    expect(H.response!.body).toEqual("public data");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");

    await get("/", { HTTP_COOKIE: "authenticated" });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(200);
    expect(H.response!.headers["etag"]).toEqual('"private tag"');
    expect(H.response!.body).toEqual("private data");
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("invalid");
    expect(H.cache!.trace).not.toContain("store");

    await get("/", { HTTP_IF_NONE_MATCH: '"public tag"' });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(304);
    expect(H.response!.headers["etag"]).toEqual('"public tag"');
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("valid");
    expect(H.cache!.trace).toContain("store");

    await get("/", { HTTP_IF_NONE_MATCH: '"private tag"', HTTP_COOKIE: "authenticated" });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(304);
    expect(H.response!.headers["etag"]).toEqual('"private tag"');
    expect(H.cache!.trace).toContain("valid");
    expect(H.cache!.trace).not.toContain("store");
  });

  it("stores responses when no-cache request directive present", async () => {
    respondWith(200, { expires: new Date(Date.now() + 5000).toUTCString() });

    await get("/", { HTTP_CACHE_CONTROL: "no-cache" });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.headers).toInclude("age");
  });

  it(
    "reloads responses when cache hits but no-cache request directive present " +
      "when allow_reload is set true",
    async () => {
      let count = 0;
      respondWith(200, { "cache-control": "max-age=10000" }, undefined, (req, res) => {
        count += 1;
        res.body = count === 1 ? ["Hello World"] : ["Goodbye World"];
      });

      await get("/");
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("store");

      await get("/");
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("fresh");

      await get("/", { "rack-cache.allow_reload": true, HTTP_CACHE_CONTROL: "no-cache" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Goodbye World");
      expect(H.cache!.trace).toContain("reload");
      expect(H.cache!.trace).toContain("store");
    },
  );

  it("does not reload responses when allow_reload is set false (default)", async () => {
    let count = 0;
    respondWith(200, { "cache-control": "max-age=10000" }, undefined, (req, res) => {
      count += 1;
      res.body = count === 1 ? ["Hello World"] : ["Goodbye World"];
    });

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("store");

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("fresh");

    await get("/", { "rack-cache.allow_reload": false, HTTP_CACHE_CONTROL: "no-cache" });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).not.toContain("reload");

    await get("/", { HTTP_CACHE_CONTROL: "no-cache" });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).not.toContain("reload");
  });

  it(
    "revalidates fresh cache entry when max-age request directive is exceeded " +
      "when allow_revalidate option is set true",
    async () => {
      let count = 0;
      respondWith(undefined, undefined, undefined, (req, res) => {
        count += 1;
        res.setHeader("cache-control", "max-age=10000");
        res.setHeader("etag", String(count));
        res.body = count === 1 ? ["Hello World"] : ["Goodbye World"];
      });

      await get("/");
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("store");

      await get("/");
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("fresh");

      await get("/", { "rack-cache.allow_revalidate": true, HTTP_CACHE_CONTROL: "max-age=0" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Goodbye World");
      expect(H.cache!.trace).toContain("stale");
      expect(H.cache!.trace).toContain("invalid");
      expect(H.cache!.trace).toContain("store");
    },
  );

  it(
    "returns a stale cache entry when max-age request directive is exceeded " +
      "when allow_revalidate and fault_tolerant options are set to true and " +
      "the remote server returns a connection error",
    async () => {
      let count = 0;
      respondWith(undefined, undefined, undefined, (req, res) => {
        count += 1;
        if (count === 2) throw new Timeout.Error("Connection failed");
        res.setHeader("cache-control", "max-age=10000");
        res.setHeader("etag", String(count));
        res.body = count === 1 ? ["Hello World"] : ["Goodbye World"];
      });

      await get("/");
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("store");

      await get("/", {
        "rack-cache.allow_revalidate": true,
        "rack-cache.fault_tolerant": true,
        HTTP_CACHE_CONTROL: "max-age=0",
      });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Hello World");
      expect(H.cache!.trace).toContain("stale");
      expect(H.cache!.trace).toContain("connnection_failed");

      await get("/", { "rack-cache.allow_revalidate": true, HTTP_CACHE_CONTROL: "max-age=0" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Goodbye World");
      expect(H.cache!.trace).toContain("stale");
      expect(H.cache!.trace).toContain("invalid");
      expect(H.cache!.trace).toContain("store");
    },
  );

  it("does not revalidate fresh cache entry when enable_revalidate option is set false (default)", async () => {
    let count = 0;
    respondWith(undefined, undefined, undefined, (req, res) => {
      count += 1;
      res.setHeader("cache-control", "max-age=10000");
      res.setHeader("etag", String(count));
      res.body = count === 1 ? ["Hello World"] : ["Goodbye World"];
    });

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("store");

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("fresh");

    await get("/", { "rack-cache.allow_revalidate": false, HTTP_CACHE_CONTROL: "max-age=0" });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).not.toContain("stale");
    expect(H.cache!.trace).not.toContain("invalid");
    expect(H.cache!.trace).toContain("fresh");

    await get("/", { HTTP_CACHE_CONTROL: "max-age=0" });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).not.toContain("stale");
    expect(H.cache!.trace).not.toContain("invalid");
    expect(H.cache!.trace).toContain("fresh");
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

  it("fetches full response when cache stale and no validators present", async () => {
    respondWith(200, { expires: new Date(Date.now() + 5000).toUTCString() });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("date");
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(H.response!.headers).toInclude("age");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");

    const hash = ((await H.cache!.metastore()) as Heap).toHash();
    expect(Object.values(hash).length).toEqual(1);
    const entries = Marshal.load(Object.values(hash)[0]) as [unknown, Headers][];
    expect(entries.length).toEqual(1);
    const [req, res] = entries[0];
    res.set("expires", new Date(Date.now() - 1000).toUTCString());
    hash[Object.keys(hash)[0]] = Marshal.dump([[req, res]]);

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(Number.parseInt(H.response!.get("age"), 10)).toEqual(0);
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).not.toContain("fresh");
    expect(H.cache!.trace).not.toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.response!.body).toEqual("Hello World");
  });

  it("validates cached responses with last-modified and no freshness information", async () => {
    const timestamp = new Date().toUTCString();
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.setHeader("last-modified", timestamp);
      if (req.env["HTTP_IF_MODIFIED_SINCE"] === timestamp) {
        res.status = 304;
        res.body = [];
      }
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("last-modified");
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).not.toContain("stale");

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("last-modified");
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(Number.parseInt(H.response!.get("age"), 10)).toEqual(0);
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("valid");
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).not.toContain("miss");
  });

  it("validates cached responses with etag and no freshness information", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.setHeader("ETAG", '"12345"');
      if (req.env["HTTP_IF_NONE_MATCH"] === res.get("etag")) {
        res.status = 304;
        res.body = [];
      }
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("etag");
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.headers).toInclude("etag");
    expect(H.response!.headers).toInclude("x-content-digest");
    expect(Number.parseInt(H.response!.get("age"), 10)).toEqual(0);
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("valid");
    expect(H.cache!.trace).toContain("store");
    expect(H.cache!.trace).not.toContain("miss");
  });

  it("replaces cached responses when validation results in non-304 response", async () => {
    const timestamp = new Date().toUTCString();
    let count = 0;
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.setHeader("last-modified", timestamp);
      switch ((count += 1)) {
        case 1:
          res.body = ["first response"];
          break;
        case 2:
          res.body = ["second response"];
          break;
        case 3:
          res.body = [];
          res.status = 304;
          break;
      }
    });

    await get("/");
    expect(H.response!.status).toEqual(200);
    expect(H.response!.body).toEqual("first response");

    await get("/");
    expect(H.response!.status).toEqual(200);
    expect(H.response!.body).toEqual("second response");

    await get("/");
    expect(H.response!.status).toEqual(200);
    expect(H.response!.body).toEqual("second response");

    expect(count).toEqual(3);
  });

  it("stores HEAD as original_method on HEAD requests", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.status = 200;
      res.body = [];
      expect(req.requestMethod).toEqual("GET");
      expect(req.env["rack.methodoverride.original_method"]).toEqual("HEAD");
    });

    await head("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.body).toEqual("");
  });

  it("passes HEAD requests through directly on pass", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.status = 200;
      res.body = [];
      expect(req.requestMethod).toEqual("HEAD");
    });

    await head("/", { HTTP_EXPECT: "something ..." });
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.body).toEqual("");
  });

  it("uses cache to respond to HEAD requests when fresh", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      res.setHeader("cache-control", "max-age=10");
      res.body = ["Hello World"];
      expect(req.requestMethod).not.toEqual("HEAD");
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.status).toEqual(200);
    expect(H.response!.body).toEqual("Hello World");

    await head("/");
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.response!.status).toEqual(200);
    expect(H.response!.body).toEqual("");
    expect(H.response!.get("content-length")).toEqual(String("Hello World".length));
  });

  it("invalidates cached responses on POST", async () => {
    respondWith(undefined, undefined, undefined, (req, res) => {
      if (req.requestMethod === "GET") {
        res.status = 200;
        res.setHeader("cache-control", "public, max-age=500");
        res.body = ["Hello World"];
      } else if (req.requestMethod === "POST") {
        res.status = 303;
        res.setHeader("Location", "/");
        delete res.headers["cache-control"];
        res.body = [];
      }
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");

    await get("/");
    expect(H.app!.isCalled()).toBeFalsy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("fresh");

    await post("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isRedirect).toBeTruthy();
    expect(H.response!.get("Location")).toEqual("/");
    expect(H.cache!.trace).toContain("invalidate");
    expect(H.cache!.trace).toContain("pass");
    expect(H.response!.body).toEqual("");

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("invalid");
    expect(H.cache!.trace).toContain("store");
  });

  describe("with responses that include a Vary header", () => {
    beforeEach(() => {
      let count = 0;
      respondWith(200, undefined, undefined, (req, res) => {
        res.setHeader("vary", "accept user-agent Foo");
        res.setHeader("cache-control", "max-age=10");
        res.setHeader("x-response-count", String((count += 1)));
        res.body = [req.env["HTTP_USER_AGENT"]];
      });
    });

    it("serves from cache when headers match", async () => {
      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/1.0" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Bob/1.0");
      expect(H.cache!.trace).toContain("miss");
      expect(H.cache!.trace).toContain("store");

      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/1.0" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Bob/1.0");
      expect(H.cache!.trace).toContain("fresh");
      expect(H.cache!.trace).not.toContain("store");
      expect(H.response!.headers).toInclude("x-content-digest");
    });

    it("stores multiple responses when headers differ", async () => {
      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/1.0" });
      expect(H.response!.isOk).toBeTruthy();
      expect(H.response!.body).toEqual("Bob/1.0");
      expect(H.response!.get("x-response-count")).toEqual("1");

      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/2.0" });
      expect(H.cache!.trace).toContain("miss");
      expect(H.cache!.trace).toContain("store");
      expect(H.response!.body).toEqual("Bob/2.0");
      expect(H.response!.get("x-response-count")).toEqual("2");

      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/1.0" });
      expect(H.cache!.trace).toContain("fresh");
      expect(H.response!.body).toEqual("Bob/1.0");
      expect(H.response!.get("x-response-count")).toEqual("1");

      await get("/", { HTTP_ACCEPT: "text/html", HTTP_USER_AGENT: "Bob/2.0" });
      expect(H.cache!.trace).toContain("fresh");
      expect(H.response!.body).toEqual("Bob/2.0");
      expect(H.response!.get("x-response-count")).toEqual("2");

      await get("/", { HTTP_USER_AGENT: "Bob/2.0" });
      expect(H.cache!.trace).toContain("miss");
      expect(H.response!.body).toEqual("Bob/2.0");
      expect(H.response!.get("x-response-count")).toEqual("3");
    });
  });

  it("passes if there was a metastore exception", async () => {
    respondWith(200, { "cache-control": "max-age=10000" }, undefined, (req, res) => {
      res.body = ["Hello World"];
    });

    await get("/");
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("store");

    await get("/", {}, (cache) => {
      cache.metastore = () => Promise.reject(new Timeout.Error("Timeout::Error"));
    });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("pass");

    await post("/", {}, (cache) => {
      cache.metastore = () => Promise.reject(new Timeout.Error("Timeout::Error"));
    });
    expect(H.response!.isOk).toBeTruthy();
    expect(H.response!.body).toEqual("Hello World");
    expect(H.cache!.trace).toContain("pass");
  });

  it("does not cache when cache-control response header changed to private (reset @cache_control on dup)", async () => {
    let count = 0;
    respondWith(undefined, undefined, undefined, (req, res) => {
      count += 1;
      res.setHeader("cache-control", count === 1 ? "public" : "private, no-store");
      res.setHeader("etag", String(count));
      res.status = count === 1 ? 200 : 304;
    });

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("miss");
    expect(H.cache!.trace).toContain("store");

    await get("/");
    expect(H.app!.isCalled()).toBeTruthy();
    expect(H.response!.isOk).toBeTruthy();
    expect(H.cache!.trace).toContain("stale");
    expect(H.cache!.trace).toContain("valid");
    expect(H.cache!.trace).not.toContain("store");
  });

  it("logs to rack.logger if available", async () => {
    const logger = new (class {
      loggedLevel: string | undefined;

      info(_message: string): void {
        this.loggedLevel = "info";
      }
    })();

    respondWith(200);
    await get("/", { "rack.logger": logger });
    expect(H.response!.isOk).toBeTruthy();
    expect(logger.loggedLevel).toEqual("info");
  });
});
