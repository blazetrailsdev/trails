import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { Config as ViteAssetsConfig } from "@blazetrails/vite-assets";
import "../lib/config.js";

describe("ViteTrails::Config", () => {
  it("defaults mode to the Trails env", () => {
    const configDefaults = (
      ViteAssetsConfig as unknown as { configDefaults(): Record<string, unknown> }
    ).configDefaults();
    expect(configDefaults.mode).toBe(String(TopLevel.Trails!.env));
  });
});
