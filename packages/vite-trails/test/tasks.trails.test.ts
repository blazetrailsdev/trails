import { Task } from "@blazetrails/rake";
import { Dir, File, FileUtils, Pathname } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("vite.rake", () => {
  let rootDir: Pathname;

  beforeEach(async () => {
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    const frameworkDir = rootDir.join("node_modules/@blazetrails/trailties");
    await FileUtils.mkdirPAsync(frameworkDir.toString());
    await File.writeAsync(
      frameworkDir.join("package.json").toString(),
      JSON.stringify({ name: "@blazetrails/trailties", version: "0.1.0" }),
    );
  });

  afterEach(async () => {
    await FileUtils.rmRfAsync(rootDir.toString());
  });

  it("enhances vite:verify_install with environment", async () => {
    await Dir.chdir(rootDir.toString(), () => import("../lib/tasks/vite.rake.js"));
    expect((await Task.get("vite:verify_install")).prerequisites).toContain("environment");
  });
});
