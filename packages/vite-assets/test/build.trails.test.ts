import { FileUtils as RbFileUtils, Pathname } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Build } from "../lib/build.js";
import { VERSION } from "../lib/version.js";

describe("Build", () => {
  let root: Pathname | undefined;

  afterEach(async () => {
    if (root !== undefined) await RbFileUtils.rmRfAsync(root.toString());
    root = undefined;
  });

  it("writes to_json metadata that from_previous reads back", async () => {
    root = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    await RbFileUtils.mkdirPAsync(root.toString());
    const lastBuildPath = root.join("last-build.json");

    const build = new Build({ currentDigest: "abc", lastBuildPath }).withResult({
      success: true,
      errors: "",
    });
    expect(JSON.parse(build.toJSON())).toEqual({
      success: true,
      errors: "",
      timestamp: build.timestamp,
      vite_ruby: VERSION,
      digest: "abc",
    });
    await build.writeToCache();

    const previous = await Build.fromPrevious(lastBuildPath, "abc");
    expect(previous.toJSON()).toEqual(build.toJSON());
    expect(previous.viteAssets).toBe(VERSION);
    expect(previous.isFresh()).toBe(true);
  });
});
