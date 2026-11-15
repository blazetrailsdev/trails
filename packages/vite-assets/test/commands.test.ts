import { File, FileUtils } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../lib/config.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig, stubBuilder, withRailsEnv } from "./support/test-helper.js";

describe("CommandsTest", () => {
  beforeEach(() => refreshConfig());

  const build = () => ViteAssets.commands().build();
  const buildFromTask = () => ViteAssets.commands().buildFromTask();
  const clobber = () => ViteAssets.commands().clobber();

  async function ensureOutputDirs(config: Config): Promise<void> {
    const dir = config.buildOutputDir().toString();
    await FileUtils.rmtreeAsync(dir).catch(() => null);
    await FileUtils.mkdirPAsync(`${dir}/.vite`);
    await FileUtils.mkdirPAsync(`${dir}/assets`);
  }

  it("bootstrap", async () => {
    expect(await ViteAssets.bootstrap()).toBeTruthy();
  });

  it("build returns success status when stale", async () => {
    await stubBuilder({ stale: true, buildSuccessful: true }, async () => {
      expect(await build()).toBeTruthy();
      expect(await buildFromTask()).toBeTruthy();
    });
  });

  it("build returns success status when fresh", async () => {
    await stubBuilder({ stale: false, buildSuccessful: true }, async () => {
      expect(await build()).toBeTruthy();
      expect(await buildFromTask()).toBeTruthy();
    });
  });

  it("build returns failure status when fresh", async () => {
    await stubBuilder({ stale: false, buildSuccessful: false }, async () => {
      expect(await build()).toBeFalsy();
    });
  });

  it("build returns failure status when stale", async () => {
    await stubBuilder({ stale: true, buildSuccessful: false }, async () => {
      expect(await build()).toBeFalsy();
    });
  });

  it("clobber", async () => {
    await withRailsEnv("test", async (config) => {
      await ensureOutputDirs(config);
      await config.buildOutputDir().join(".vite/manifest.json").write("{}");

      expect(await File.isExistAsync(config.buildOutputDir().toString())).toBeTruthy();
      await clobber();

      expect(await File.isExistAsync(config.buildOutputDir().toString())).toBeFalsy();
    });
  });
});
