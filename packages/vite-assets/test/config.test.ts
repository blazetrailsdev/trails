import type {} from "@blazetrails/vitest-matchers";
import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Config } from "../lib/config.js";
import { ViteAssets } from "../lib/vite-assets.js";
import "./test_app/config/application.mjs";
import { pathToTestApp, refreshConfig, withRailsEnv } from "./support/test-helper.js";

const vendorCandidate = new URL("../../../vendor/vite_ruby/v3.11.1", import.meta.url).pathname;
const vendorRoot = (await File.isExistAsync(vendorCandidate)) ? vendorCandidate : null;

describe("ConfigTest", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const expandPath = (path: string) => File.expandPath(File.join(dir, path));
  const assertPath = (expected: string, actual: unknown) =>
    expect(String(actual)).toBe(expandPath(expected));
  const assertPathname = (expected: string, actual: unknown) =>
    expect(String(actual)).toBe(expandPath(`test_app/${expected}`));
  const resolveConfig = ({ mode = "production", root = pathToTestApp(), ...attrs } = {}) =>
    Config.resolveConfig({ mode, root, ...attrs });

  let config: Config;

  beforeEach(async () => {
    await refreshConfig();
    config = await resolveConfig();
  });

  afterEach(async () => {
    await refreshConfig();
  });

  it.skipIf(!vendorRoot)("matching default config json", async () => {
    expect(await File.readAsync(`${vendorRoot}/vite_ruby/default.vite.json`)).toBe(
      await File.readAsync(`${vendorRoot}/vite-plugin-ruby/default.vite.json`),
    );
  });

  it("source code dir", () => {
    expect(config.sourceCodeDir).toBe("app/frontend");
  });

  it("entrypoints dir", () => {
    assertPath("test_app/app/frontend/entrypoints", config.resolvedEntrypointsDir());
  });

  it("vite root dir", () => {
    assertPath("test_app/app/frontend", config.viteRootDir());
  });

  it("public dir", () => {
    expect(config.publicDir).toBe("public");
  });

  it("build output dir", async () => {
    assertPath("test_app/public/vite-production", config.buildOutputDir());

    config = await resolveConfig({ configPath: "config/vite_public_dir.json" } as never);

    assertPath("public/vite", config.buildOutputDir());
  });

  it("ruby config file", async () => {
    expect(config.toEnv()["EXAMPLE_PATH"]).toBeUndefined();

    await refreshConfig({ configPath: "config/vite_public_dir.json" });

    expect(ViteAssets.config().publicOutputDir).toBe("from_ruby");
    expect(ViteAssets.config().toEnv()["EXAMPLE_PATH"]).toBe(
      new URL("../../trailties", import.meta.url).pathname,
    );
  });

  it("dev server meta path is scoped to mode", async () => {
    assertPath("test_app/tmp/vite-ruby-production.json", config.devServerMetaPath());
    assertPath(
      "test_app/tmp/vite-ruby-development.json",
      (await resolveConfig({ mode: "development" })).devServerMetaPath(),
    );
    assertPath(
      "test_app/tmp/vite-ruby-test.json",
      (await resolveConfig({ mode: "test" })).devServerMetaPath(),
    );
  });

  it("manifest path", async () => {
    assertPath(
      "test_app/public/vite-production/.vite/manifest.json",
      (await config.manifestPaths())[0],
    );
  });

  it("build cache dir", () => {
    assertPath("test_app/tmp/cache/vite", config.buildCacheDir);
  });

  it("watch additional paths", async () => {
    expect(config.watchAdditionalPaths).toBeEmpty();
    config = await resolveConfig({ configPath: "config/vite_additional_paths.json" } as never);

    expect(config.watchAdditionalPaths).toEqual(["config/*"]);
  });

  it("auto build", async () => {
    expect(config.autoBuild).toBeFalsy();

    await withRailsEnv("development", (config) => {
      expect(config.autoBuild).toBeTruthy();
    });

    await withRailsEnv("test", (config) => {
      expect(config.autoBuild).toBeTruthy();
    });

    await withRailsEnv("staging", (config) => {
      expect(config.autoBuild).toBeFalsy();
    });
  });

  it("protocol", () => {
    expect(config.protocol()).toBe("http");
  });

  it("host with port", async () => {
    expect(config.port).toBe(3036);

    await withRailsEnv("development", (config) => {
      expect(config.port).toBe(3535);
      expect(config.hostWithPort()).toBe("localhost:3535");
    });
  });

  it("to env", async () => {
    let env = config.toEnv();

    expect(env["VITE_RUBY_ASSET_HOST"]).toBeUndefined();

    const actionController = (
      TopLevel.Trails!.application as unknown as {
        config: { actionController: { assetHost: unknown } };
      }
    ).config.actionController;
    try {
      actionController.assetHost = "assets-cdn.com";
      env = (await refreshConfig()).toEnv();

      expect(env["VITE_RUBY_ASSET_HOST"]).toBe("assets-cdn.com");
    } finally {
      actionController.assetHost = null;
    }
  });

  it("environment vars", async () => {
    const env = ViteAssets.env();
    try {
      for (const key of Object.keys(env)) delete env[key];
      Object.assign(env, {
        VITE_RUBY_AUTO_BUILD: "true",
        VITE_RUBY_HOST: "example.com",
        VITE_RUBY_PORT: "1920",
        VITE_RUBY_HTTPS: "true",
        VITE_RUBY_CONFIG_PATH: "config/vite_additional_paths.json",
        VITE_RUBY_BUILD_CACHE_DIR: "tmp/vitebuild",
        VITE_RUBY_PUBLIC_DIR: "pb",
        VITE_RUBY_PUBLIC_OUTPUT_DIR: "ft",
        VITE_RUBY_ASSETS_DIR: "as",
        VITE_RUBY_SOURCE_CODE_DIR: "app",
        VITE_RUBY_ENTRYPOINTS_DIR: "frontend/entrypoints",
        VITE_RUBY_HIDE_BUILD_CONSOLE_OUTPUT: "true",
        VITE_RUBY_SKIP_COMPATIBILITY_CHECK: "true",
      });
      config = await resolveConfig();

      expect(config.autoBuild).toBeTruthy();
      expect(config.host).toBe("example.com");
      expect(config.port).toBe(1920);
      expect(config.https).toBeTruthy();
      expect(config.protocol()).toBe("https");
      expect(config.configPath).toBe("config/vite_additional_paths.json");
      assertPathname("tmp/vitebuild", config.buildCacheDir);
      expect(config.publicDir).toBe("pb");
      expect(config.publicOutputDir).toBe("ft");
      assertPathname("pb/ft", config.buildOutputDir());
      expect(config.assetsDir).toBe("as");
      expect(config.sourceCodeDir).toBe("app");
      expect(config.skipCompatibilityCheck).toBeTruthy();
      expect(config.entrypointsDir).toBe("frontend/entrypoints");
      assertPathname("app", config.viteRootDir());
      assertPathname("app/frontend/entrypoints", config.resolvedEntrypointsDir());
      expect(config.hideBuildConsoleOutput).toBeTruthy();
    } finally {
      for (const key of Object.keys(env)) delete env[key];
    }
  });

  it("watched paths", () => {
    expect(config.sourceCodeDir).toBe("app/frontend");
    expect(config.additionalEntrypoints).toEqual(["~/{assets,fonts,icons,images}/**/*"]);
    expect(config.watchedPaths()).toEqual([
      "app/frontend/**/*",
      "config/vite.{rb,json}",
      ...Config.DEFAULT_WATCHED_PATHS,
    ]);
  });
});
