import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import { Autoloaders } from "../../lib/autoloaders.js";
import {
  BroadcastLogger,
  Logger,
  NullStore,
  onLoad,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Errno } from "@blazetrails/ruby-compat/errno";
import { STDERR } from "@blazetrails/ruby-compat/io";
import { Initializable, type Collection } from "../../lib/initializable.js";
import {
  Bootstrap,
  type BootstrapConfig,
  type BootstrapHost,
} from "../../lib/application/bootstrap.js";
import { Configuration } from "../../lib/application/configuration.js";
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

  config: BootstrapConfig = { ...baseConfig() };
  autoloaders = new Autoloaders();
}
include(TestApp, Initializable);

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

  describe(":initialize_logger", () => {
    it("uses config.logger when provided", async () => {
      const app = new TestApp();
      const custom = new Logger(null);
      app.config = { ...baseConfig(), logger: custom };
      await app.runInitializers("all");
      expect(Trails.logger).toBeInstanceOf(BroadcastLogger);
      expect((Trails.logger as unknown as BroadcastLogger).broadcasts).toEqual([custom]);
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

    it("preserves a pre-existing logger", async () => {
      const app = new TestApp();
      const preset = new BroadcastLogger(new Logger(null));
      Trails.logger = preset as unknown as Logger;
      await app.runInitializers("all");
      expect(Trails.logger).toBe(preset);
    });

    it("applies config.broadcastLogLevel to a preset BroadcastLogger", async () => {
      const app = new TestApp();
      const preset = new BroadcastLogger(new Logger(null));
      Trails.logger = preset as unknown as Logger;
      app.config = { ...baseConfig(), broadcastLogLevel: "error" };
      await app.runInitializers("all");
      expect(Trails.logger).toBe(preset);
      expect(preset.level).toBe(Logger.ERROR);
    });

    it("falls back to a WARN STDERR logger when the log file cannot be opened", async () => {
      const app = new TestApp();
      app.config = {
        ...baseConfig(),
        logLevel: "warn",
        defaultLogFile: async () => {
          throw new Errno.EACCES("log/test.log");
        },
      };
      const written: string[] = [];
      const write = vi.spyOn(STDERR, "write").mockImplementation((...s: unknown[]) => {
        written.push(s.map(String).join(""));
        return 0;
      });
      try {
        await app.runInitializers("all");
      } finally {
        write.mockRestore();
      }
      expect(Trails.logger).toBeInstanceOf(BroadcastLogger);
      expect(Trails.logger?.level).toBe(Logger.WARN);
      expect(written.join("")).toContain(
        "Unable to access log file. Please ensure that log/test.log",
      );
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
      "setup_once_autoloader",
      "bootstrap_hook",
    ];

    it("declares the four initializers in Rails order", () => {
      expect(Bootstrap.initializers.map((i) => i.name)).toEqual(expected);
    });

    it("tsorts to the same Rails order via implicit chaining", () => {
      const app = new TestApp();
      expect(app.initializers.tsort().map((i) => i.name)).toEqual(expected);
    });

    it("places every initializer in the :all group", () => {
      for (const init of Bootstrap.initializers) {
        if (init.name === "setup_once_autoloader") continue;
        expect(init.belongsTo("all")).toBe(true);
      }
    });
  });
});
