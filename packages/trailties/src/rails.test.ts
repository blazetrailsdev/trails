import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvironmentInquirer, NullLogger, setEnv, trailsRoot } from "@blazetrails/activesupport";
import { Trails, _resetTrailsEnv } from "./rails.js";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { VERSION } from "./version.js";

beforeEach(() => {
  Trails.application = null;
  Trails.cache = null;
  Trails.logger = null;
  _resetTrailsEnv();
  Application.appClass = null;
});
afterEach(() => {
  Trails.application = null;
  Trails.cache = null;
  Trails.logger = null;
  _resetTrailsEnv();
  Application.appClass = null;
});

describe("Trails", () => {
  it("Trails.version returns the trailties package version", () => {
    expect(Trails.version).toBe(VERSION);
  });

  it("Trails.application returns null when no app is registered", () => {
    expect(Trails.application).toBeNull();
  });

  it("Trails.application returns the registered Application instance", () => {
    class MyApp extends Application {}
    Application.register(MyApp);
    expect(Trails.application).toBeInstanceOf(MyApp);
  });

  it("Trails.application memoizes the first non-null result (Rails: @application ||= ...)", () => {
    class MyApp extends Application {}
    Application.register(MyApp);
    const first = Trails.application;
    class OtherApp extends Application {}
    Application.register(OtherApp);
    // Even though appClass is now OtherApp, the memoized application sticks.
    expect(Trails.application).toBe(first);
    expect(Trails.application).toBeInstanceOf(MyApp);
  });

  it("Trails.application= overrides the appClass-derived instance", () => {
    class MyApp extends Application {}
    Application.register(MyApp);
    class OtherApp extends Application {}
    Application.register(OtherApp);
    const other = OtherApp.instance();
    Trails.application = other;
    expect(Trails.application).toBe(other);
  });

  it("Trails.configuration delegates to application.config", () => {
    class CApp extends Application {}
    Application.register(CApp);
    expect(Trails.configuration).toBe(CApp.instance().config);
  });

  it("Trails.env returns an EnvironmentInquirer wrapping TRAILS_ENV (NOT NODE_ENV)", () => {
    // `resolveEnv()` in database.ts deliberately ignores NODE_ENV.
    // Set TRAILS_ENV explicitly via the processAdapter so this assertion
    // is decoupled from vitest's default `NODE_ENV=test`.
    setEnv("TRAILS_ENV", "staging");
    try {
      _resetTrailsEnv();
      expect(Trails.env).toBeInstanceOf(EnvironmentInquirer);
      expect(Trails.env.toString()).toBe("staging");
    } finally {
      setEnv("TRAILS_ENV", undefined);
      _resetTrailsEnv();
    }
  });

  it("Trails.env= accepts a string and wraps it in EnvironmentInquirer", () => {
    Trails.env = "test";
    expect(Trails.env.is("test")).toBe(true);
    expect(Trails.env.toString()).toBe("test");
  });

  it("Trails.backtraceCleaner returns a memoized BacktraceCleaner", () => {
    expect(Trails.backtraceCleaner).toBeInstanceOf(BacktraceCleaner);
    expect(Trails.backtraceCleaner).toBe(Trails.backtraceCleaner);
  });

  it("Trails.logger is null by default and accepts assignment", () => {
    expect(Trails.logger).toBeNull();
    const logger = new NullLogger();
    Trails.logger = logger;
    expect(Trails.logger).toBe(logger);
  });

  it("Trails.groups includes :default, current env, and option-matched keys", () => {
    Trails.env = "development";
    expect(Trails.groups()).toEqual(["default", "development"]);
    expect(Trails.groups({ assets: ["development", "test"] })).toEqual([
      "default",
      "development",
      "assets",
    ]);
    expect(Trails.groups({ assets: ["production"] })).toEqual(["default", "development"]);
  });

  it("Trails.groups concatenates TRAILS_GROUPS env entries (Rails-faithful: no trim)", () => {
    // Rails: `groups.concat ENV["RAILS_GROUPS"].to_s.split(",")`. No trim;
    // Ruby `split(",")` preserves middle empties and drops trailing
    // empties. Trails mirrors that on TRAILS_GROUPS.
    Trails.env = "development";
    setEnv("TRAILS_GROUPS", "assets,workers");
    try {
      expect(Trails.groups()).toEqual(["default", "development", "assets", "workers"]);
    } finally {
      setEnv("TRAILS_GROUPS", undefined);
    }
  });

  it("Trails.groups TRAILS_GROUPS drops trailing empties but keeps middle ones (Ruby split semantics)", () => {
    Trails.env = "development";
    setEnv("TRAILS_GROUPS", "assets,,workers,,");
    try {
      // Trailing two empties dropped; the middle empty between assets and
      // workers is preserved (matches `"assets,,workers,,".split(",")` in
      // Ruby → `["assets", "", "workers"]`).
      expect(Trails.groups()).toEqual(["default", "development", "assets", "", "workers"]);
    } finally {
      setEnv("TRAILS_GROUPS", undefined);
    }
  });

  it("Trails.root resolves to undefined when no app is registered", async () => {
    expect(await Trails.root()).toBeUndefined();
  });

  it("Trails.root reflects a config.setRoot override, not the discovered source root", async () => {
    class RootApp extends Application {}
    Application.register(RootApp);
    const app = RootApp.instance();
    app.root = async () => "/discovered/source";
    app.config.setRoot("/srv/override");
    expect(await Trails.root()).toBe("/srv/override");
  });

  it("Trails.root falls back to the discovered root when config.root is unset", async () => {
    class DiscoveredApp extends Application {}
    Application.register(DiscoveredApp);
    const app = DiscoveredApp.instance();
    app.root = async () => "/discovered/source";
    expect(await Trails.root()).toBe("/discovered/source");
  });

  it("Trails.root agrees with the trailsRoot seam", async () => {
    class SeamApp extends Application {}
    Application.register(SeamApp);
    const app = SeamApp.instance();
    app.root = async () => "/discovered/source";
    await Trails.initialize();
    app.config.setRoot("/srv/override");
    expect(await Trails.root()).toBe(trailsRoot());
    expect(trailsRoot()).toBe("/srv/override");
  });

  it("Trails.root stays undefined when neither config.root nor discovery resolve (Rails returns nil, not cwd)", async () => {
    class NoRootApp extends Application {}
    Application.register(NoRootApp);
    const app = NoRootApp.instance();
    app.root = async () => undefined;
    expect(await Trails.root()).toBeUndefined();
  });

  it("Trails.publicPath honors a config.setRoot override when discovery is unresolved", async () => {
    class OverriddenPubApp extends Application {}
    Application.register(OverriddenPubApp);
    const app = OverriddenPubApp.instance();
    app.root = async () => undefined;
    app.config.setRoot("/srv/override");
    expect(await Trails.publicPath()).toBe("/srv/override/public");
  });

  it("Trails.initialized() is false before initialize, true after", async () => {
    class InitApp extends Application {}
    Application.register(InitApp);
    expect(Trails.initialized()).toBe(false);
    await Trails.initialize();
    expect(Trails.initialized()).toBe(true);
  });

  it("Trails.initialize() throws when no application is registered", async () => {
    await expect(Trails.initialize()).rejects.toThrow(/Trails.application is not set/);
  });

  it("Trails.initialized() throws when no application is registered (Rails: no allow_nil:)", () => {
    expect(() => Trails.initialized()).toThrow(/Trails.application is not set/);
  });

  it("Trails.publicPath returns null when no application is registered", async () => {
    expect(await Trails.publicPath()).toBeNull();
  });

  it("Trails.publicPath returns null when app.root() is unresolved (no throw)", async () => {
    class UnrootedApp extends Application {}
    Application.register(UnrootedApp);
    const app = UnrootedApp.instance();
    app.root = async () => undefined;
    await expect(Trails.publicPath()).resolves.toBeNull();
  });

  it('Trails.publicPath returns the first expanded entry of paths["public"]', async () => {
    class PubApp extends Application {}
    Application.register(PubApp);
    const app = PubApp.instance();
    const stubPath = { expanded: async () => ["/srv/app/public", "/srv/app/public-alt"] };
    app.root = async () => "/srv/app";
    app.paths = async () =>
      ({ get: (k: string) => (k === "public" ? stubPath : undefined) }) as unknown as Awaited<
        ReturnType<typeof app.paths>
      >;
    expect(await Trails.publicPath()).toBe("/srv/app/public");
  });
});
