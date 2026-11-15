import { Application, Rake, Task } from "@blazetrails/rake";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig } from "./support/test-helper.js";

describe("RakeTasksTest", () => {
  beforeEach(async () => {
    Rake.application = new Application();
    await refreshConfig();
  });
  afterEach(() => {
    Rake.application = undefined;
  });

  it("defines assets:precompile over install_dependencies and build_all", async () => {
    await ViteAssets.installTasks();
    expect((await Task.get("assets:precompile")).prerequisites).toEqual([
      "vite:install_dependencies",
      "vite:build_all",
    ]);
    expect((await Task.get("assets:clobber")).prerequisites).toEqual(["vite:clobber"]);
  });
});
