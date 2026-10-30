import { describe, expect, it } from "vitest";
import { LoadError } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { rakefileRakelib, useApplicationTestCase } from "./test-helpers/application.js";

describe("TestRakeRequire", () => {
  useApplicationTestCase();

  it("can load rake library", async () => {
    await rakefileRakelib();
    const app = new Application();

    expect(await app.rakeRequire("test2", ["rakelib"], [])).toBeTruthy();
  });

  it("wont reload rake library", async () => {
    await rakefileRakelib();
    const app = new Application();

    const paths = ["rakelib"];
    const loadedFiles: string[] = [];
    await app.rakeRequire("test2", paths, loadedFiles);

    expect(!(await app.rakeRequire("test2", paths, loadedFiles))).toBeTruthy();
  });

  it("throws error if library not found", async () => {
    await rakefileRakelib();

    const app = new Application();
    const promise = app.rakeRequire("testx", ["rakelib"], []);
    await expect(promise).rejects.toThrow(LoadError);
    const ex = (await promise.catch((e: unknown) => e)) as Error;
    expect(ex).toBeTruthy();
    expect(ex.message).toMatch(/(can *not|can't)\s+find/i);
    expect(ex.message).toMatch(/testx/);
  });
});
