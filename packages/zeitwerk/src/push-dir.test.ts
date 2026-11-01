import { File, Pathname, registerConstant } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError } from "./error.js";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

describe("TesPushDir", () => {
  class Namespace {}
  registerConstant("TesPushDir::Namespace", Namespace);

  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  function checkDirs() {
    const roots = loader.roots;

    const nonIgnoredRoots = Object.fromEntries(
      Object.entries(roots).filter(([dir]) => !loader.isIgnoredPath(dir)),
    );

    let dirs = loader.dirs();
    expect(dirs).toEqual(Object.keys(nonIgnoredRoots));
    expect(Object.isFrozen(dirs)).toBeTruthy();

    dirs = loader.dirs({ namespaces: true });
    expect(dirs).toEqual(nonIgnoredRoots);
    expect(Object.isFrozen(dirs)).toBeTruthy();
    expect(dirs !== roots).toBeTruthy();

    dirs = loader.dirs({ ignored: true });
    expect(dirs).toEqual(Object.keys(roots));
    expect(Object.isFrozen(dirs)).toBeTruthy();

    dirs = loader.dirs({ namespaces: true, ignored: true });
    expect(dirs).toEqual(roots);
    expect(Object.isFrozen(dirs)).toBeTruthy();
    expect(dirs !== roots).toBeTruthy();
  }

  it("accepts dirs as strings and associates them to the Object namespace", async () => {
    await loader.pushDir(".");
    checkDirs();
  });

  it("accepts dirs as pathnames and associates them to the Object namespace", async () => {
    await loader.pushDir(new Pathname("."));
    checkDirs();
  });

  it.skip("there can be several root directories", () => {});

  it("there can be several root directories, some of them may be ignored", async () => {
    const files: [string, string][] = [
      ["rd1/x.ts", "export const X = 1;"],
      ["rd2/y.ts", "export const Y = 1;"],
      ["rd3/z.ts", "export const Z = 1;"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("rd1");
      await loader.pushDir("rd2");
      await loader.pushDir("rd3");
      await loader.ignore("rd2");
      checkDirs();
    });
  });

  it("accepts dirs as strings and associates them to the given namespace", async () => {
    await loader.pushDir(".", { namespace: Namespace });
    checkDirs();
  });

  it("accepts dirs as pathnames and associates them to the given namespace", async () => {
    await loader.pushDir(new Pathname("."), { namespace: Namespace });
    checkDirs();
  });

  it.skip("there can be several root directories, with custom namespaces", () => {});

  it("there can be several root directories, with custom namespaces, some of them may be ignored", async () => {
    const files: [string, string][] = [
      ["rd1/x.ts", "export const X = 1;"],
      ["rd2/y.ts", "export const Y = 1;"],
      ["rd3/z.ts", "export const Z = 1;"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("rd1", { namespace: Namespace });
      await loader.pushDir("rd2", { namespace: Namespace });
      await loader.pushDir("rd3", { namespace: Namespace });
      await loader.ignore("rd2");
      checkDirs();
    });
  });

  it("raises on non-existing directories", async () => {
    const dir = File.expandPath("non-existing");
    const promise = loader.pushDir(dir);
    await expect(promise).rejects.toThrow(ZeitwerkError);
    const e = await promise.catch((error: unknown) => error);
    expect((e as ZeitwerkError).message).toEqual(`the root directory ${dir} does not exist`);
  });

  it("raises if the namespace is not a class or module object", async () => {
    const promise = loader.pushDir(".", { namespace: ":foo" });
    await expect(promise).rejects.toThrow(ZeitwerkError);
    const e = await promise.catch((error: unknown) => error);
    expect((e as ZeitwerkError).message).toEqual(":foo is not a class or module object, should be");
  });

  it("raises if the namespace is anonymous", async () => {
    const promise = loader.pushDir(".", { namespace: class {} });
    await expect(promise).rejects.toThrow(ZeitwerkError);
    const e = await promise.catch((error: unknown) => error);
    expect((e as ZeitwerkError).message).toEqual("root namespaces cannot be anonymous");
  });
});
