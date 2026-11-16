import { Dir, File, FileUtils, Pathname } from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";
import { CLI } from "@blazetrails/vite-assets/cli.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ViteAssets::CLI.require_framework_libraries", () => {
  let rootDir: Pathname;

  beforeEach(async () => {
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    const libraryDir = rootDir.join("node_modules/@blazetrails/vite-trails");
    await FileUtils.mkdirPAsync(libraryDir.toString());
    await File.writeAsync(
      rootDir.join("package.json").toString(),
      JSON.stringify({ dependencies: { "@blazetrails/vite-trails": "workspace:*" } }),
    );
    await File.writeAsync(
      libraryDir.join("package.json").toString(),
      JSON.stringify({ name: "@blazetrails/vite-trails", version: "0.1.0" }),
    );
  });

  afterEach(async () => {
    await FileUtils.rmRfAsync(rootDir.toString());
  });

  it("loads the vite-trails CLI overrides for an app depending on @blazetrails/vite-trails", async () => {
    await Dir.chdir(rootDir.toString(), async () => {
      expect(await ViteAssets.frameworkLibraries()).toEqual([
        ["trails", { name: "@blazetrails/vite-trails", version: "0.1.0" }],
      ]);
      expect("setupContentSecurityPolicy" in CLI.Install.prototype).toBe(false);
      await CLI.requireFrameworkLibraries("cli");
    });
    expect("setupContentSecurityPolicy" in CLI.Install.prototype).toBe(true);
  });
});
