import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvironmentInquirer, NullLogger } from "@blazetrails/activesupport";
import { Trails } from "./rails.js";
import { Application } from "./application.js";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { VERSION } from "./version.js";

beforeEach(() => {
  Trails.application = null;
  Trails.cache = null;
  Trails.logger = null;
  Trails._resetEnv();
  Application.appClass = null;
});
afterEach(() => {
  Trails.application = null;
  Trails._resetEnv();
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

  it("Trails.env returns an EnvironmentInquirer defaulting to development", () => {
    expect(Trails.env).toBeInstanceOf(EnvironmentInquirer);
    expect(Trails.env.is("development")).toBe(true);
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

  it("Trails.root resolves to undefined when no app is registered", async () => {
    expect(await Trails.root()).toBeUndefined();
  });
});
