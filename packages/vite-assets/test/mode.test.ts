import { beforeEach, describe, expect, it } from "vitest";
import { ViteRuby } from "../lib/vite-ruby.js";
import { railsEnvName, refreshConfig, withRailsEnv } from "./support/test-helper.js";

describe("ModeTest", () => {
  beforeEach(async () => {
    await refreshConfig();
  });

  it("mode", async () => {
    expect((await ViteRuby.config()).mode).toBe(railsEnvName());
    expect(await ViteRuby.mode()).toBe((await ViteRuby.config()).mode);
  });

  it("mode with rails env", async () => {
    await withRailsEnv("staging", (config) => {
      expect(config.mode).toBe("staging");
    });
  });
});
