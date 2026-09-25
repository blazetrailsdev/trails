import {
  type CacheStore,
  Logger,
  MemoryStore,
  NullStore,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import { FileStore } from "@blazetrails/activesupport/cache/file-store";
import { Runtime } from "@blazetrails/rack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bootstrap, type BootstrapConfig, type BootstrapHost } from "./bootstrap.js";
import { Configuration } from "./configuration.js";

class TestApp extends Bootstrap implements BootstrapHost {
  logger: Logger | null = null;
  cache: CacheStore | null = null;
  config: BootstrapConfig = {};
}

describe(":initialize_cache lookup_store arms", () => {
  beforeEach(() => resetLoadHooks());
  afterEach(() => resetLoadHooks());

  it("builds the store a Symbol names", async () => {
    const app = new TestApp();
    app.config = { cacheStore: ":null_store" };
    await app.runInitializers("all");
    expect(app.cache).toBeInstanceOf(NullStore);
  });

  it("splats an Array store into the Symbol and its arguments", async () => {
    const app = new TestApp();
    app.config = { cacheStore: [":file_store", "/app/tmp/cache/"] };
    await app.runInitializers("all");
    expect(app.cache).toBeInstanceOf(FileStore);
    expect((app.cache as FileStore).cachePath).toBe("/app/tmp/cache/");
  });

  it("falls back to a MemoryStore when cacheStore is unset", async () => {
    const app = new TestApp();
    await app.runInitializers("all");
    expect(app.cache).toBeInstanceOf(MemoryStore);
  });

  it("keeps a pre-existing cache", async () => {
    const app = new TestApp();
    const preset = new NullStore();
    app.cache = preset;
    app.config = { cacheStore: ":memory_store" };
    await app.runInitializers("all");
    expect(app.cache).toBe(preset);
  });

  it("inserts the store's middleware before Rack::Runtime", async () => {
    const app = new TestApp();
    const middleware = class LocalCacheMiddleware {};
    const store = Object.assign(new NullStore(), { middleware });
    const inserted: unknown[][] = [];
    app.config = {
      cacheStore: store,
      middleware: { insertBefore: (...args: unknown[]) => inserted.push(args) },
    };
    await app.runInitializers("all");
    expect(inserted).toEqual([[Runtime, middleware]]);
  });

  it("defaults config.cacheStore to a file store under root", () => {
    expect(new Configuration("/app").cacheStore).toEqual([":file_store", "/app/tmp/cache/"]);
  });
});
