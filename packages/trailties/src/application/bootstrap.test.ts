import {
  type CacheStore,
  Logger,
  NullLogger,
  NullStore,
  onLoad,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Initializable } from "../initializable.js";
import { Bootstrap, type BootstrapConfig, type BootstrapHost } from "./bootstrap.js";

class TestApp extends Bootstrap implements BootstrapHost {
  logger: Logger | null = null;
  cache: CacheStore | null = null;
  config: BootstrapConfig = {};
}

describe("Bootstrap", () => {
  beforeEach(() => {
    resetLoadHooks();
  });
  afterEach(() => {
    resetLoadHooks();
  });

  describe("class shape", () => {
    it("extends Initializable", () => {
      expect(new TestApp()).toBeInstanceOf(Initializable);
    });
  });

  describe(":initialize_logger", () => {
    it("uses config.logger when provided", () => {
      const app = new TestApp();
      const custom = new Logger(null);
      app.config = { logger: custom };
      app.runInitializers("all");
      expect(app.logger).toBe(custom);
    });

    it("falls back to a NullLogger when config.logger is unset", () => {
      const app = new TestApp();
      app.runInitializers("all");
      expect(app.logger).toBeInstanceOf(NullLogger);
    });

    it("applies config.logLevel to the resulting logger", () => {
      const app = new TestApp();
      app.config = { logLevel: "warn" };
      app.runInitializers("all");
      expect(app.logger?.level).toBe(Logger.WARN);
    });

    it("preserves a pre-existing logger", () => {
      const app = new TestApp();
      const preset = new Logger(null);
      app.logger = preset;
      app.runInitializers("all");
      expect(app.logger).toBe(preset);
    });
  });

  describe(":initialize_cache", () => {
    it("uses config.cacheStore when provided", () => {
      const app = new TestApp();
      const store = new NullStore();
      app.config = { cacheStore: store };
      app.runInitializers("all");
      expect(app.cache).toBe(store);
    });

    it("invokes config.cacheStore when given as a factory", () => {
      const app = new TestApp();
      const store = new NullStore();
      app.config = { cacheStore: () => store };
      app.runInitializers("all");
      expect(app.cache).toBe(store);
    });

    it("falls back to a NullStore when cacheStore is unset", () => {
      const app = new TestApp();
      app.runInitializers("all");
      expect(app.cache).toBeInstanceOf(NullStore);
    });
  });

  describe(":bootstrap_hook", () => {
    it("runs the :before_initialize load hooks against the app", () => {
      const app = new TestApp();
      let captured: unknown = null;
      onLoad("before_initialize", (base) => {
        captured = base;
      });
      app.runInitializers("all");
      expect(captured).toBe(app);
    });
  });

  describe("initializer order", () => {
    const expected = [
      "load_environment_config",
      "initialize_logger",
      "initialize_cache",
      "bootstrap_hook",
    ];

    it("declares the four initializers in Rails order", () => {
      expect(Bootstrap._ownInitializers().map((i) => i.name)).toEqual(expected);
    });

    it("tsorts to the same Rails order via implicit chaining", () => {
      const app = new TestApp();
      expect(app.initializers.tsort().map((i) => i.name)).toEqual(expected);
    });

    it("places every initializer in the :all group", () => {
      for (const init of Bootstrap._ownInitializers()) {
        expect(init.belongsTo("all")).toBe(true);
      }
    });
  });
});
