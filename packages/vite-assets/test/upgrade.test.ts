import { Dir, Pathname, Process } from "@blazetrails/ruby-compat";
import { describe, expect, it, vi } from "vitest";
import { CLI } from "../lib/cli.js";
import { IO } from "../lib/io.js";
import { ViteAssets } from "../lib/vite-assets.js";
import "./support/test-helper.js";

describe("UpgradeTest", () => {
  it("updates gems conservatively", async () => {
    const libraries: [string, { name: string; version: unknown }][] = [
      ["trails", { name: "@blazetrails/vite-trails", version: null }],
    ];
    const status = new Process.Status({ status: 0 } as never);

    const configSpy = vi
      .spyOn(ViteAssets, "config")
      .mockResolvedValue({ packageManager: "pnpm", root: new Pathname(Dir.pwd()) } as never);
    const librariesSpy = vi.spyOn(ViteAssets, "frameworkLibraries").mockResolvedValue(libraries);
    const captureSpy = vi.spyOn(IO, "capture").mockImplementation(async (...command) => {
      expect(command[0]).toEqual("pnpm update @blazetrails/vite-assets @blazetrails/vite-trails");
      return ["", "", status];
    });
    try {
      await (
        new CLI.Upgrade() as unknown as { upgradeRubyGems(): Promise<void> }
      ).upgradeRubyGems();
    } finally {
      configSpy.mockRestore();
      librariesSpy.mockRestore();
      captureSpy.mockRestore();
    }
  });
});
