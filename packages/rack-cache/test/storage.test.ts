import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rbObjIvarGet } from "@blazetrails/ruby-compat";
import { EntityStore, Noop } from "../lib/entity-store.js";
import { MetaStore } from "../lib/meta-store.js";
import { Storage } from "../lib/storage.js";
import {
  createTempDirectory,
  haveDalli,
  MEMCACHED,
  removeEntrySecure,
} from "./support/test-helper.js";

const HAVE_DALLI = await haveDalli();

describe("Rack::Cache::Storage", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage();
  });

  it("fails when an unknown URI scheme is provided", async () => {
    await expect(storage.resolveMetastoreUri("foo:/")).rejects.toThrow();
  });

  it("passes options to the underlying stores", async () => {
    expect(
      (
        rbObjIvarGet(
          (await storage.resolveMetastoreUri("heap:/", { foo: "bar" })) as object,
          "@options",
        ) as Record<string, unknown>
      ).foo,
    ).toEqual("bar");
    expect(
      (
        rbObjIvarGet(
          (await storage.resolveEntitystoreUri("heap:/", { foo: "bar" })) as object,
          "@options",
        ) as Record<string, unknown>
      ).foo,
    ).toEqual("bar");
  });

  it("creates a new MetaStore for URI if none exists", async () => {
    expect(await storage.resolveMetastoreUri("heap:/")).toBeInstanceOf(MetaStore);
  });

  it("returns an existing MetaStore instance for URI that exists", async () => {
    const store = await storage.resolveMetastoreUri("heap:/");
    expect(await storage.resolveMetastoreUri("heap:/")).toBe(store);
  });

  it("creates a new EntityStore for URI if none exists", async () => {
    expect(await storage.resolveEntitystoreUri("heap:/")).toBeInstanceOf(EntityStore);
  });

  it("returns an existing EntityStore instance for URI that exists", async () => {
    const store = await storage.resolveEntitystoreUri("heap:/");
    expect(await storage.resolveEntitystoreUri("heap:/")).toBe(store);
  });

  it("clears all URI -> store mappings with #clear", async () => {
    const meta = await storage.resolveMetastoreUri("heap:/");
    const entity = await storage.resolveEntitystoreUri("heap:/");
    storage.clear();
    expect(await storage.resolveMetastoreUri("heap:/")).not.toBe(meta);
    expect(await storage.resolveEntitystoreUri("heap:/")).not.toBe(entity);
  });

  describe("Noop Store URIs", () => {
    it("resolves Noop meta store URIs", async () => {
      expect(await storage.resolveEntitystoreUri("noop:/")).toBeInstanceOf(Noop);
    });
  });

  describe("Heap Store URIs", () => {
    for (const uri of ["heap:/", "mem:/"]) {
      it(`resolves ${uri} meta store URIs`, async () => {
        expect(await storage.resolveMetastoreUri(uri)).toBeInstanceOf(MetaStore);
      });
      it(`resolves ${uri} entity store URIs`, async () => {
        expect(await storage.resolveEntitystoreUri(uri)).toBeInstanceOf(EntityStore);
      });
    }
  });

  describe("Disk Store URIs", () => {
    let tempDir: string | null;

    beforeEach(async () => {
      tempDir = await createTempDirectory();
    });

    afterEach(async () => {
      await removeEntrySecure(tempDir!);
      tempDir = null;
    });

    for (const uri of ["file:", "disk:"]) {
      it(`resolves ${uri} meta store URIs`, async () => {
        expect(await storage.resolveMetastoreUri(uri + tempDir)).toBeInstanceOf(MetaStore);
      });

      it(`resolves ${uri} entity store URIs`, async () => {
        expect(await storage.resolveEntitystoreUri(uri + tempDir)).toBeInstanceOf(EntityStore);
      });
    }
  });

  describe.runIf(HAVE_DALLI)("MemCache Store URIs", () => {
    for (const scheme of ["memcache:", "memcached:"]) {
      it(`resolves ${scheme} meta store URIs`, async () => {
        const uri = scheme + "//" + MEMCACHED;
        expect(await storage.resolveMetastoreUri(uri)).toBeInstanceOf(MetaStore);
      });

      it(`resolves ${scheme} entity store URIs`, async () => {
        const uri = scheme + "//" + MEMCACHED;
        expect(await storage.resolveEntitystoreUri(uri)).toBeInstanceOf(EntityStore);
      });
    }

    it("supports namespaces in memcached: URIs", async () => {
      const uri = "memcached://" + MEMCACHED + "/namespace";
      expect(await storage.resolveMetastoreUri(uri)).toBeInstanceOf(MetaStore);
    });
  });
});
