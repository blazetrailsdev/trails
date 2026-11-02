import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, RuntimeError, rbFLoad } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

describe("tasks/framework", () => {
  let root: string;

  beforeEach(() => {
    root = Dir.mktmpdir("framework-task");
    vi.spyOn(Trails, "root").mockReturnValue({ toString: () => root } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    FileUtils.rmRf(root);
  });

  it("raises when no LOCATION is given", async () => {
    vi.stubEnv("LOCATION", "");
    await expect(
      Rake.withApplication(async (rake) => {
        await rbFLoad(File.join(import.meta.dirname, "framework.ts"));
        const task = rake.lookup("app:template")!;
        task.clearPrerequisites();
        await task.invoke();
      }),
    ).rejects.toBeInstanceOf(RuntimeError);
  });
});
