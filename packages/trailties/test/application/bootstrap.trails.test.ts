import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import { Initializable, type Collection } from "../../lib/initializable.js";
import { Autoloaders } from "../../lib/autoloaders.js";
import {
  ActiveSupport,
  Logger,
  MemoryStore,
  NullStore,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import { FileStore } from "@blazetrails/activesupport/cache/file-store";
import { Runtime } from "@blazetrails/rack";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Bootstrap,
  type BootstrapConfig,
  type BootstrapHost,
} from "../../lib/application/bootstrap.js";
import { Configuration } from "../../lib/application/configuration.js";
import type { MiddlewareStackProxy } from "../../lib/configuration.js";
import { Trails } from "../../lib/trails.js";

const baseConfig = (): BootstrapConfig => ({
  root: null,
  activeSupport: {},
  logLevel: "debug",
  logFormatter: null,
  defaultLogFile: async () => ({ write() {} }),
  paths: () => ({ get: () => ({ first: () => "log/test.log" }) }),
  middleware: new Configuration(new Pathname("/app")).middleware,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface TestApp extends Included<typeof Initializable> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class TestApp implements BootstrapHost {
  get initializers(): Collection {
    return Bootstrap.initializersFor(this);
  }

  logger: Logger | null = null;
  config: BootstrapConfig = { ...baseConfig() };
  autoloaders = new Autoloaders();
}
include(TestApp, Initializable);

describe(":initialize_cache lookup_store arms", () => {
  beforeEach(() => {
    resetLoadHooks();
    Trails.cache = null;
  });
  afterEach(() => {
    resetLoadHooks();
    Trails.cache = null;
  });

  it("builds the store a Symbol names", async () => {
    const app = new TestApp();
    app.config = { ...baseConfig(), cacheStore: ":null_store" };
    await app.runInitializers("all");
    expect(Trails.cache).toBeInstanceOf(NullStore);
  });

  it("splats an Array store into the Symbol and its arguments", async () => {
    const app = new TestApp();
    app.config = { ...baseConfig(), cacheStore: [":file_store", "/app/tmp/cache/"] };
    await app.runInitializers("all");
    expect(Trails.cache).toBeInstanceOf(FileStore);
    expect((Trails.cache as FileStore).cachePath).toBe("/app/tmp/cache/");
  });

  it("falls back to a MemoryStore when cacheStore is unset", async () => {
    const app = new TestApp();
    await app.runInitializers("all");
    expect(Trails.cache).toBeInstanceOf(MemoryStore);
  });

  it("keeps a pre-existing cache", async () => {
    const app = new TestApp();
    const preset = new NullStore();
    Trails.cache = preset;
    app.config = { ...baseConfig(), cacheStore: ":memory_store" };
    await app.runInitializers("all");
    expect(Trails.cache).toBe(preset);
  });

  it("inserts the store's middleware before Rack::Runtime", async () => {
    const app = new TestApp();
    const middleware = class LocalCacheMiddleware {};
    const config = new Configuration(new Pathname("/app"));
    config.cacheStore = Object.assign(new NullStore(), { middleware: () => middleware });
    const insertBefore = vi.spyOn(config.middleware as MiddlewareStackProxy, "insertBefore");
    app.config = config as unknown as BootstrapConfig;
    await app.runInitializers("all");
    expect(insertBefore).toHaveBeenCalledWith(Runtime, middleware);
  });

  it("applies the cache format version loadDefaults(7.0) sets", async () => {
    const previous = ActiveSupport.cacheFormatVersion();
    try {
      ActiveSupport.setCacheFormatVersion(7.1);
      const app = new TestApp();
      const config = new Configuration(new Pathname("/app"));
      config.loadDefaults("7.0");
      app.config = config as unknown as BootstrapConfig;
      await app.runInitializers("all");
      expect(ActiveSupport.cacheFormatVersion()).toBe(7.0);
      expect(app.config.activeSupport).not.toHaveProperty("cacheFormatVersion");
    } finally {
      ActiveSupport.setCacheFormatVersion(previous);
    }
  });

  it("defaults config.cacheStore to a file store under root", () => {
    expect(new Configuration(new Pathname("/app")).cacheStore).toEqual([
      ":file_store",
      "/app/tmp/cache/",
    ]);
  });
});
