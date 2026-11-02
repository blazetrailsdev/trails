import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, rbFLoad } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

describe("ApplicationTests::RakeTest", () => {
  let appPath: string;

  beforeEach(() => {
    appPath = Dir.mktmpdir("rake-test");
    vi.spyOn(Trails, "root").mockReturnValue({ toString: () => appPath } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    FileUtils.rmRf(appPath);
  });

  it("copy templates", async () => {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "../tasks/framework.ts"));
      await rake.lookup("app:templates:copy")!.invoke();
    });
    expect(File.isExist(File.join(appPath, "lib", "templates", "tse", "controller"))).toBe(true);
    for (const dir of ["controller", "helper", "scaffold-controller"]) {
      expect(File.isExist(File.join(appPath, "lib", "templates", "rails", dir))).toBe(true);
    }
  });
});
