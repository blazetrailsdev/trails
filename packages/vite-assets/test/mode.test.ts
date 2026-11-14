import { beforeEach, describe, expect, it } from "vitest";
import { ViteAssets } from "../lib/vite-assets.js";
import { railsEnvName, refreshConfig, withRailsEnv } from "./support/test-helper.js";

describe("ModeTest", () => {
  beforeEach(async () => {
    await refreshConfig();
  });

  it("mode", async () => {
    expect((await ViteAssets.config()).mode).toBe(railsEnvName());
    expect(await ViteAssets.mode()).toBe((await ViteAssets.config()).mode);
  });

  it("mode with rails env", async () => {
    await withRailsEnv("staging", (config) => {
      expect(config.mode).toBe("staging");
    });
  });
});
