import { describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { rakefileRakelib, useApplicationTestCase } from "./test-helpers/application.js";

describe("TestRakeRequire", () => {
  useApplicationTestCase();

  it("can load rake library", async () => {
    await rakefileRakelib();
    const app = new Application();

    expect(await app.rakeRequire("test2", ["rakelib"], [])).toBe(true);
  });

  it("wont reload rake library", async () => {
    await rakefileRakelib();
    const app = new Application();

    const paths = ["rakelib"];
    const loadedFiles: string[] = [];
    await app.rakeRequire("test2", paths, loadedFiles);

    expect(await app.rakeRequire("test2", paths, loadedFiles)).toBe(false);
  });

  it("throws error if library not found", async () => {
    await rakefileRakelib();

    const app = new Application();
    const ex = (await app.rakeRequire("testx", ["rakelib"], []).catch((e: unknown) => e)) as Error;
    expect(ex.message).toMatch(/(can *not|can't)\s+find/i);
    expect(ex.message).toMatch(/testx/);
  });
});
