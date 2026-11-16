import { Process } from "@blazetrails/ruby-compat";
import { describe, expect, it, vi } from "vitest";
import { CLI } from "../lib/cli.js";
import { IO } from "../lib/io.js";
import { ViteAssets } from "../lib/vite-assets.js";
import "./support/test-helper.js";

describe("UpgradeTest", () => {
  it("updates gems conservatively", async () => {
    const libraries: [string, { name: string; version: unknown }][] = [
      ["rails", { name: "vite_rails", version: null }],
      ["rack", { name: "vite_plugin_legacy", version: null }],
    ];
    const status = new Process.Status({ status: 0 } as never);

    const librariesSpy = vi.spyOn(ViteAssets, "frameworkLibraries").mockResolvedValue(libraries);
    const captureSpy = vi.spyOn(IO, "capture").mockImplementation(async (...command) => {
      expect(command[0]).toEqual(
        "bundle update --conservative vite_ruby vite_rails vite_plugin_legacy",
      );
      return ["", "", status];
    });
    try {
      await (
        new CLI.Upgrade() as unknown as { upgradeRubyGems(): Promise<void> }
      ).upgradeRubyGems();
    } finally {
      librariesSpy.mockRestore();
      captureSpy.mockRestore();
    }
  });
});
