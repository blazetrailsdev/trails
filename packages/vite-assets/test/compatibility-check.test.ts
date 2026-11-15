import { ArgumentError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { CompatibilityCheck } from "../lib/compatibility-check.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig } from "./support/test-helper.js";

describe("CompatibilityCheckTest", () => {
  const isCompatiblePlugin = (npmReq: string | undefined, rubyReq: string | null) =>
    CompatibilityCheck.isCompatiblePlugin(npmReq, rubyReq);
  const raiseUnlessSatisfied = (npmReq: string | undefined, rubyReq: string) =>
    CompatibilityCheck.raiseUnlessSatisfied(npmReq, rubyReq);

  it("verify plugin version", async () => {
    await refreshConfig({ skipCompatibilityCheck: true });
    await expect(refreshConfig({ skipCompatibilityCheck: false })).rejects.toThrow(ArgumentError);
    await refreshConfig();
  });

  it("compatible plugin", () => {
    expect(isCompatiblePlugin("^3.1.0", "^3.0.1")).toBe(false);
    expect(isCompatiblePlugin("^4.1.0", "^3.0")).toBe(false);
    expect(isCompatiblePlugin("4.1.0", "^3.0")).toBe(false);

    expect(isCompatiblePlugin("3.0.5", "^3.0.1")).toBe(true);
    expect(isCompatiblePlugin("^3.0.9", "^3.0.1")).toBe(true);
    expect(isCompatiblePlugin("3.1.0", "^3.0")).toBe(true);
    expect(isCompatiblePlugin("^3.1.0", "^3.0")).toBe(true);
    expect(isCompatiblePlugin(undefined, "^3.0")).toBe(true);
    expect(isCompatiblePlugin(undefined, null)).toBe(true);
  });

  it("requires plugin version with mode specific metadata", () => {
    expect(ViteAssets.DEFAULT_PLUGIN_VERSION).toBe("^5.2.5");
    expect(isCompatiblePlugin("^5.2.4", ViteAssets.DEFAULT_PLUGIN_VERSION)).toBe(false);
    expect(isCompatiblePlugin("^5.2.5", ViteAssets.DEFAULT_PLUGIN_VERSION)).toBe(true);
  });

  it("raise unless satisfied", () => {
    expect(() => raiseUnlessSatisfied("^4.1.0", "^3.0")).toThrow(ArgumentError);
    raiseUnlessSatisfied("3.1.0", "^3.0");
    raiseUnlessSatisfied(undefined, "^3.0");
  });
});
