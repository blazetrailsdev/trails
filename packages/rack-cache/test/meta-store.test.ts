import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { MockRequest } from "@blazetrails/rack";
import { File, NotImplementedError, StringIO } from "@blazetrails/ruby-compat";
import { EntityStore, Heap as EntityHeap } from "../lib/entity-store.js";
import { createTempDirectory, removeEntrySecure } from "./support/test-helper.js";
import { MetaStore } from "../lib/meta-store.js";
import { Request } from "../lib/request.js";
import { Response } from "../lib/response.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Store = any;

export function rackCacheMetaStoreImplementation(
  stores: () =>
    | { store: Store; entityStore: Store }
    | Promise<{ store: Store; entityStore: Store }>,
): void {
  let store: Store;
  let entityStore: Store;
  let request: Request;
  let response: Response;

  function mockRequest(uri: string, opts: Record<string, unknown> | null): Request {
    const env = MockRequest.envFor(uri, opts ?? {});
    return new Request(env);
  }

  function mockResponse(status: number, headers: unknown, body: unknown): Response {
    headers ??= {};
    return new Response(status, headers, body);
  }

  async function slurp(body: Iterable<string> | File): Promise<string> {
    let buf = "";
    for await (const part of body instanceof File ? body.eachAsync() : body) {
      buf += typeof part === "string" ? part : new TextDecoder().decode(part);
    }
    return buf;
  }

  async function storeSimpleEntry(
    path: string | null = null,
    headers: Record<string, unknown> | null = null,
    body: unknown = ["test"],
  ): Promise<string> {
    request = mockRequest(path ?? "/test", headers ?? {});
    response = mockResponse(200, { "cache-control": "max-age=420" }, body);
    body = response.body;
    const cacheKey = await store.store(request, response, entityStore);

    expect(response.body).not.toBe(body);

    return cacheKey;
  }

  beforeEach(async () => {
    ({ store, entityStore } = await stores());
    request = mockRequest("/", {});
    response = mockResponse(200, {}, ["hello world"]);
  });

  afterEach(() => {
    store = null;
    entityStore = null;
  });

  it("writes a list of negotation tuples with #write", async () => {
    await store.write("/test", [[{}, {}]]);
  });

  it("reads a list of negotation tuples with #read", async () => {
    await store.write("/test", [
      [{}, {}],
      [{}, {}],
    ]);
    const tuples = await store.read("/test");
    expect(tuples).toEqual([
      [{}, {}],
      [{}, {}],
    ]);
  });

  it("reads an empty list with #read when nothing cached at key", async () => {
    expect((await store.read("/nothing")).length === 0).toBeTruthy();
  });

  it("removes entries for key with #purge", async () => {
    await store.write("/test", [[{}, {}]]);
    expect((await store.read("/test")).length === 0).toBeFalsy();

    await store.purge("/test");
    expect((await store.read("/test")).length === 0).toBeTruthy();
  });

  it("succeeds when purging non-existing entries", async () => {
    expect((await store.read("/test")).length === 0).toBeTruthy();
    await store.purge("/test");
  });

  it("returns nil from #purge", async () => {
    await store.write("/test", [[{}, {}]]);
    expect(await store.purge("/test")).toBeNull();
    expect(await store.read("/test")).toEqual([]);
  });

  for (const key of ["/test", "http://example.com:8080/", "/test?x=y", "/test?x=y&p=q"]) {
    it(`can read and write key: '${key}'`, async () => {
      await store.write(key, [[{}, {}]]);
      expect(await store.read(key)).toEqual([[{}, {}]]);
    });
  }

  it("can read and write fairly large keys", async () => {
    const key = "b".repeat(4096);
    await store.write(key, [[{}, {}]]);
    expect(await store.read(key)).toEqual([[{}, {}]]);
  });

  it("allows custom cache keys from block", () => {
    const request = mockRequest("/test", {});
    request.env["rack-cache.cache_key"] = (request: Request) =>
      [...request.pathInfo].reverse().join("");
    expect(store.cacheKey(request)).toBe("tset/");
  });

  it("allows custom cache keys from class", () => {
    const request = mockRequest("/test", {});
    request.env["rack-cache.cache_key"] = class {
      static call(request: Request) {
        return [...request.pathInfo].reverse().join("");
      }
    };
    expect(store.cacheKey(request)).toBe("tset/");
  });

  it("does not blow up when given a non-marhsalable object with an ALL_CAPS key", async () => {
    await storeSimpleEntry("/bad", { SOME_THING: () => {} });
  });

  it("supports a ttl parameter for #write", async () => {
    await store.write(
      "/test",
      [
        [{}, {}],
        [{}, {}],
      ],
      0,
    );
    const tuples = await store.read("/test");
    expect(tuples).toEqual([
      [{}, {}],
      [{}, {}],
    ]);
  });

  it("stores a cache entry", async () => {
    const cacheKey = await storeSimpleEntry();
    expect((await store.read(cacheKey)).length === 0).toBeFalsy();
  });

  it("can handle objects that can only be read once", async () => {
    const io = new StringIO("TEST");
    await storeSimpleEntry(null, null, io);

    const key = response.headers.fetch("x-content-digest");
    const data = await entityStore.read(key);
    expect(data instanceof Uint8Array ? new TextDecoder().decode(data) : data).toBe("TEST");

    expect(io.isClosed()).toBeTruthy();

    expect([await slurp(response.body as string[])]).toEqual(["TEST"]);
  });

  it("sets the x-content-digest response header before storing", async () => {
    const cacheKey = await storeSimpleEntry();
    const [, res] = (await store.read(cacheKey))[0];
    expect(res.get("x-content-digest")).toBe("a94a8fe5ccb19ba61c4c0873d391e987982fbbd3");
  });

  it("finds a stored entry with #lookup", async () => {
    await storeSimpleEntry();
    const response = await store.lookup(request, entityStore);
    expect(response == null).toBeFalsy();
    expect(response.constructor).toBe(Response);
  });

  it("does not find an entry with #lookup when none exists", async () => {
    const req = mockRequest("/test", { HTTP_FOO: "Foo", HTTP_BAR: "Bar" });
    expect(await store.lookup(req, entityStore)).toBeNull();
  });

  it("canonizes urls for cache keys", async () => {
    const path = "/test?x=y&p=q";
    await storeSimpleEntry(path);

    const hitsReq = mockRequest(path, {});
    const missReq = mockRequest("/test?p=x", {});

    expect(await store.lookup(hitsReq, entityStore)).not.toEqual(null);
    expect(await store.lookup(missReq, entityStore)).toBeNull();
  });

  it("does not find an entry with #lookup when the body does not exist", async () => {
    await storeSimpleEntry();
    expect(response.headers.get("x-content-digest") == null).toBeFalsy();
    await entityStore.purge(response.headers.get("x-content-digest"));
    expect(await store.lookup(request, entityStore)).toBeNull();
  });

  it("purges meta store entry when the body does not exist", async () => {
    await storeSimpleEntry();
    await entityStore.purge(response.headers.get("x-content-digest"));
    const mock = vi.spyOn(store, "purge").mockResolvedValue(null);
    await store.lookup(request, entityStore);
    expect(mock).toHaveBeenCalledWith(store.cacheKey(request));
  });

  it("purges meta store entry when the entry does not contain the digest header", async () => {
    const cacheKey = await storeSimpleEntry();
    const metaEntry = await store.read(cacheKey);
    for (const [, h] of metaEntry) h.delete("x-content-digest");
    await store.write(cacheKey, metaEntry);
    const mock = vi.spyOn(store, "purge").mockResolvedValue(null);
    await store.lookup(request, null);
    expect(mock).toHaveBeenCalledWith(store.cacheKey(request));
  });

  it("warns once if purge is not implemented", async () => {
    await storeSimpleEntry();
    expect(response.headers.get("x-content-digest")).toBeTruthy();
    await entityStore.purge(response.headers.get("x-content-digest"));
    store.purge = async () => {
      throw new NotImplementedError();
    };
    expect(await store.lookup(request, entityStore)).toBeNull();
    expect(await store.lookup(request, entityStore)).toBeNull();
  });

  it("restores response headers properly with #lookup", async () => {
    await storeSimpleEntry();
    const lookedUp = await store.lookup(request, entityStore);
    expect(lookedUp.headers).toEqual(response.headers.merge({ "content-length": "4" }));
  });

  it("restores response body from entity store with #lookup", async () => {
    await storeSimpleEntry();
    const lookedUp = await store.lookup(request, entityStore);
    const body = await slurp(lookedUp.body);
    expect(body).toBe("test");
  });

  it("invalidates meta and entity store entries with #invalidate", async () => {
    await storeSimpleEntry();
    await store.invalidate(request, entityStore);
    const lookedUp = await store.lookup(request, entityStore);
    expect(lookedUp.constructor).toBe(Response);
    expect(lookedUp.isFresh()).toBeFalsy();
  });

  it("succeeds quietly when #invalidate called with no matching entries", async () => {
    const req = mockRequest("/test", {});
    await store.invalidate(req, entityStore);
    expect(await store.lookup(request, entityStore)).toBeNull();
  });

  it("does not remove response x-status with #invalidate", async () => {
    const request = mockRequest("/test", {});
    let response = mockResponse(
      200,
      { Expires: (Time.now().minus(3600) as Time).httpdate(), vary: "Foo" },
      ["test"],
    );
    const cacheKey = await store.store(request, response, entityStore);
    response = mockResponse(200, { Expires: Time.now().plus(3600).httpdate(), vary: "Bar" }, [
      "test",
    ]);
    await store.store(request, response, entityStore);

    await store.invalidate(request, entityStore);
    for (const [, res] of await store.read(cacheKey)) {
      expect(res).toInclude("x-status");
    }
  });

  it("gracefully degrades if the cache store stops working", async () => {
    store = new (class extends MetaStore {
      override async purge(..._args: unknown[]) {
        return null;
      }
      override async read(..._args: unknown[]) {
        return [];
      }
      override async write(..._args: unknown[]) {
        return null;
      }
    })();
    entityStore = new (class extends EntityStore {
      async isExist(..._args: unknown[]) {
        return false;
      }
      async open(..._args: unknown[]) {
        return null;
      }
      async read(..._args: unknown[]) {
        return null;
      }
      async write(..._args: unknown[]) {
        return null;
      }
      async purge(..._args: unknown[]) {
        return null;
      }
    })();

    const request = mockRequest("/test", {});
    const response = mockResponse(200, {}, ["test"]);
    await store.store(request, response, entityStore);
    expect(response.body).toEqual(["test"]);
  });

  for (const vary of ["Vary", "vary"]) {
    it("does not return entries that Vary with #lookup", async () => {
      const req1 = mockRequest("/test", { HTTP_FOO: "Foo", HTTP_BAR: "Bar" });
      const req2 = mockRequest("/test", { HTTP_FOO: "Bling", HTTP_BAR: "Bam" });
      const res = mockResponse(200, { [vary]: "Foo Bar" }, ["test"]);
      await store.store(req1, res, entityStore);

      expect(await store.lookup(req2, entityStore)).toBeNull();
    });

    it("stores multiple responses for each Vary combination", async () => {
      const req1 = mockRequest("/test", { HTTP_FOO: "Foo", HTTP_BAR: "Bar" });
      const res1 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 1"]);
      const key = await store.store(req1, res1, entityStore);

      const req2 = mockRequest("/test", { HTTP_FOO: "Bling", HTTP_BAR: "Bam" });
      const res2 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 2"]);
      await store.store(req2, res2, entityStore);

      const req3 = mockRequest("/test", { HTTP_FOO: "Baz", HTTP_BAR: "Boom" });
      const res3 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 3"]);
      await store.store(req3, res3, entityStore);

      expect(await slurp((await store.lookup(req3, entityStore)).body)).toBe("test 3");
      expect(await slurp((await store.lookup(req1, entityStore)).body)).toBe("test 1");
      expect(await slurp((await store.lookup(req2, entityStore)).body)).toBe("test 2");

      expect((await store.read(key)).length).toBe(3);
    });

    it("overwrites non-varying responses with #store", async () => {
      const req1 = mockRequest("/test", { HTTP_FOO: "Foo", HTTP_BAR: "Bar" });
      const res1 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 1"]);
      const key = await store.store(req1, res1, entityStore);
      expect(await slurp((await store.lookup(req1, entityStore)).body)).toBe("test 1");

      const req2 = mockRequest("/test", { HTTP_FOO: "Bling", HTTP_BAR: "Bam" });
      const res2 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 2"]);
      await store.store(req2, res2, entityStore);
      expect(await slurp((await store.lookup(req2, entityStore)).body)).toBe("test 2");

      const req3 = mockRequest("/test", { HTTP_FOO: "Foo", HTTP_BAR: "Bar" });
      const res3 = mockResponse(200, { [vary]: "Foo Bar" }, ["test 3"]);
      await store.store(req3, res3, entityStore);
      expect(await slurp((await store.lookup(req1, entityStore)).body)).toBe("test 3");

      expect((await store.read(key)).length).toBe(2);
    });
  }

  for (const age of ["Age", "age"]) {
    it("removes the Age response header before storing", async () => {
      const response = mockResponse(200, { [age]: "100" }, ["foo"]);
      await store.store(request, response, entityStore);
      expect((await store.lookup(request, entityStore)).headers.get("age")).toBeUndefined();
    });
  }

  describe("logging writes", () => {
    it("passes a TTL to the stores is use_native_ttl is truthy", async () => {
      const request = mockRequest("/test", { "rack-cache.use_native_ttl": true });
      const response = mockResponse(200, { "cache-control": "max-age=42" }, ["foo"]);

      const entityWrite = vi.spyOn(entityStore, "write").mockResolvedValue(["foobar"]);
      const storeWrite = vi.spyOn(store, "write").mockResolvedValue(["foobar"]);

      await store.store(request, response, entityStore);

      expect(entityWrite).toHaveBeenCalledWith(["foo"], 42);
      expect(storeWrite).toHaveBeenCalledWith(expect.anything(), expect.anything(), 42);
    });
  });
}

describe("Rack::Cache::MetaStore", () => {
  for (const [method, args] of [
    ["read", [1]],
    ["write", [1, 2]],
    ["purge", [1]],
  ] as const) {
    it(`has not implemented ${method}`, async () => {
      await expect((new MetaStore() as Store)[method](...args)).rejects.toThrow(
        NotImplementedError,
      );
    });
  }

  describe("Heap", () => {
    rackCacheMetaStoreImplementation(() => ({
      store: new MetaStore.Heap(),
      entityStore: new EntityHeap(),
    }));
  });

  describe("Disk", () => {
    let tempDir: string;
    beforeEach(async () => {
      tempDir = await createTempDirectory();
    });
    afterEach(async () => {
      await removeEntrySecure(tempDir);
    });
    rackCacheMetaStoreImplementation(async () => ({
      store: await MetaStore.Disk.new(`${tempDir}/meta`),
      entityStore: await EntityStore.Disk.new(`${tempDir}/entity`),
    }));
  });
});
