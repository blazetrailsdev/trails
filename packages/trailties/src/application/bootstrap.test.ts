import {
  BroadcastLogger,
  Logger,
  NullStore,
  onLoad,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Initializable } from "../initializable.js";
import { Bootstrap, type BootstrapConfig, type BootstrapHost } from "./bootstrap.js";
import { Trails } from "../rails.js";

const baseConfig = (): BootstrapConfig => ({
  activeSupport: {},
  logLevel: "debug",
  logFormatter: null,
  defaultLogFile: async () => ({ write() {} }),
  paths: () => ({ get: () => ({ first: async () => "log/test.log" }) }),
});

class TestApp extends Bootstrap implements BootstrapHost {
  config: BootstrapConfig = { ...baseConfig() };
}

describe("Bootstrap", () => {
  beforeEach(() => {
    resetLoadHooks();
    Trails.cache = null;
    Trails.logger = null;
  });
  afterEach(() => {
    resetLoadHooks();
    Trails.cache = null;
    Trails.logger = null;
  });

  describe("class shape", () => {
    it("extends Initializable", () => {
      expect(new TestApp()).toBeInstanceOf(Initializable);
    });
  });

  describe(":initialize_logger", () => {
    it("broadcasts to config.logger when provided", async () => {
      const app = new TestApp();
      const custom = new Logger(null);
      app.config = { ...baseConfig(), logger: custom };
      await app.runInitializers("all");
      expect(Trails.logger).toBeInstanceOf(BroadcastLogger);
      expect((Trails.logger as BroadcastLogger).broadcasts).toEqual([custom]);
    });

    it("logs to config.defaultLogFile when config.logger is unset", async () => {
      const app = new TestApp();
      const lines: string[] = [];
      app.config = {
        ...baseConfig(),
        defaultLogFile: async () => ({ write: (s) => lines.push(s) }),
      };
      await app.runInitializers("all");
      Trails.logger!.error("boom");
      expect(lines.join("")).toContain("boom");
    });

    it("applies config.logLevel to the resulting logger", async () => {
      const app = new TestApp();
      app.config = { ...baseConfig(), logLevel: "warn" };
      await app.runInitializers("all");
      expect(Trails.logger?.level).toBe(Logger.WARN);
    });

    it("preserves a pre-existing broadcast logger", async () => {
      const app = new TestApp();
      const preset = new BroadcastLogger(new Logger(null));
      Trails.logger = preset;
      await app.runInitializers("all");
      expect(Trails.logger).toBe(preset);
    });
  });

  describe(":initialize_cache", () => {
    it("uses config.cacheStore when provided", async () => {
      const app = new TestApp();
      const store = new NullStore();
      app.config = { ...baseConfig(), cacheStore: store };
      await app.runInitializers("all");
      expect(Trails.cache).toBe(store);
    });
  });

  describe(":bootstrap_hook", () => {
    it("runs the :before_initialize load hooks against the app", async () => {
      const app = new TestApp();
      let captured: unknown = null;
      onLoad("before_initialize", (base) => {
        captured = base;
      });
      await app.runInitializers("all");
      expect(captured).toBe(app);
    });
  });

  describe("initializer order", () => {
    const expected = [
      "load_environment_hook",
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
