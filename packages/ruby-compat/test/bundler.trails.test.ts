import { describe, it, expect } from "vitest";
import { Bundler, Dir, File, FileUtils } from "../lib/index.js";

async function app(manifest: object): Promise<string> {
  const root = Dir.mktmpdir();
  await File.writeAsync(File.join(root, "package.json"), JSON.stringify(manifest));
  for (const name of ["dep", "dev"]) {
    const dir = File.join(root, "node_modules", "@blazetrails", name);
    await FileUtils.mkdirPAsync(dir);
    await File.writeAsync(File.join(dir, "package.json"), JSON.stringify({ main: "index.js" }));
    await File.writeAsync(
      File.join(dir, "index.js"),
      `(globalThis.bundled ??= []).push(${JSON.stringify(name)});`,
    );
  }
  return root;
}

describe("Bundler.require", () => {
  it("requires dependencies for :default and devDependencies for :test", async () => {
    const root = await app({
      dependencies: { "@blazetrails/dep": "*" },
      devDependencies: { "@blazetrails/dev": "*" },
    });
    const seen = globalThis as { bundled?: string[] };
    seen.bundled = [];
    await Dir.chdir(root, () => Bundler.require("default"));
    expect(seen.bundled).toEqual(["dep"]);
    seen.bundled = [];
    await Dir.chdir(root, () => Bundler.require("test"));
    expect(seen.bundled).toEqual(["dev"]);
  });
});
