import { File, rbInspect } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

describe("TestConflictingDirectory", () => {
  const dir = import.meta.dirname;
  const parent = File.expandPath("..", dir);

  const files: [string, string][] = [
    ["foo/x.ts", "export const X = 1;"],
    ["foobar/y.ts", "export const Y = 1;"],
  ];

  let existingLoader: Loader;
  let loader: Loader;

  beforeEach(() => {
    existingLoader = newLoader();
    loader = newLoader();
  });
  afterEach(teardown);

  function conflictingDirectoryMessage(dir: string) {
    return (
      `loader\n\n${rbInspect(loader)}\n\n\nwants to manage directory ${dir},` +
      ` which is already managed by\n\n${rbInspect(existingLoader)}\n\n`
    );
  }

  async function checkConflict(dir: string) {
    const push = loader.pushDir(dir);
    await expect(push).rejects.toThrow(ZeitwerkError);
    const e = await push.catch((error: Error) => error);
    expect((e as Error).message).toEqual(conflictingDirectoryMessage(dir));
  }

  it("raises if an existing loader manages the same root dir", async () => {
    await existingLoader.pushDir(dir);
    await checkConflict(dir);
  });

  it("raises if an existing loader manages a parent directory", async () => {
    await existingLoader.pushDir(parent);
    await checkConflict(dir);
  });

  it("raises if an existing loader manages a subdirectory", async () => {
    await existingLoader.pushDir(dir);
    await checkConflict(parent);
  });

  it("does not raise if an existing loader manages a directory with a matching prefix", async () => {
    await withFiles(files, async () => {
      await existingLoader.pushDir("foo");
      expect(await loader.pushDir("foobar")).toBeTruthy();
    });
  });

  it("does not raise if an existing loader ignores the directory (dir)", async () => {
    await existingLoader.pushDir(parent);
    await existingLoader.ignore(dir);
    expect(await loader.pushDir(dir)).toBeTruthy();
  });

  it("does not raise if a second existing loader ignores the directory (dir)", async () => {
    const secondExistingLoader = newLoader();
    await secondExistingLoader.pushDir(parent);
    await secondExistingLoader.ignore(dir);

    expect(await loader.pushDir(dir)).toBeTruthy();
  });

  it("does not raise if an existing loader ignores the directory (glob pattern)", async () => {
    await existingLoader.pushDir(parent);
    await existingLoader.ignore(`${parent}/*`);
    expect(await loader.pushDir(dir)).toBeTruthy();
  });

  it("does not raise if the loader ignores a directory managed by an existing loader (dir)", async () => {
    await existingLoader.pushDir(dir);
    await loader.ignore(dir);
    expect(await loader.pushDir(parent)).toBeTruthy();
  });

  it("does not raise if the loader ignores a directory managed by an existing loader (glob pattern)", async () => {
    await existingLoader.pushDir(dir);
    await loader.ignore(`${parent}/*`);
    expect(await loader.pushDir(parent)).toBeTruthy();
  });

  it("raises if an existing loader ignores a directory with a matching prefix", async () => {
    await withFiles(files, async () => {
      const ignored = File.expandPath("foo");
      const conflictingDir = File.expandPath("foobar");

      await existingLoader.pushDir(".");
      await existingLoader.ignore(ignored);

      await checkConflict(conflictingDir);
    });
  });
});
