import { File } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { require } from "./core-ext/kernel.js";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

declare global {
  var $Namespace: object | undefined;
}

describe("TestCallbacks", () => {
  class Namespace {}

  let loader: Loader;
  let called: boolean;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
    called = false;
    globalThis.$Namespace = Namespace;
  });
  afterEach(async () => {
    globalThis.$Namespace = undefined;
    await teardown();
  });

  it("autoloading a file triggers on_file_autoloaded (Object)", async () => {
    const onFileAutoloaded = loader.onFileAutoloaded;
    loader.onFileAutoloaded = function (this: Loader, file, exports) {
      if (file === File.expandPath("x.ts")) called = true;
      return onFileAutoloaded.call(this, file, exports);
    };
    await withSetup(loader, [["x.ts", "export const X = true"]], {}, async () => {
      expect(await get(Object, "X")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });

  it("autoloading a file triggers on_file_autoloaded (Namespace)", async () => {
    const onFileAutoloaded = loader.onFileAutoloaded;
    loader.onFileAutoloaded = function (this: Loader, file, exports) {
      if (file === File.expandPath("x.ts")) called = true;
      return onFileAutoloaded.call(this, file, exports);
    };
    const files: [string, string][] = [["x.ts", "export const X = true"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      expect(await get(Namespace, "X")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });

  it("requiring an autoloadable file triggers on_file_autoloaded (Object)", async () => {
    const onFileAutoloaded = loader.onFileAutoloaded;
    loader.onFileAutoloaded = function (this: Loader, file, exports) {
      if (file === File.expandPath("y.ts")) called = true;
      return onFileAutoloaded.call(this, file, exports);
    };
    const files: [string, string][] = [
      ["x.ts", "export const X = true"],
      ["y.ts", 'export const Y = await globalThis.$get("X")'],
    ];
    await withSetup(loader, files, {}, async () => {
      await require(File.expandPath("y.ts"));
      expect(await get(Object, "Y")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });

  it("requiring an autoloadable file triggers on_file_autoloaded (Namespace)", async () => {
    const onFileAutoloaded = loader.onFileAutoloaded;
    loader.onFileAutoloaded = function (this: Loader, file, exports) {
      if (file === File.expandPath("y.ts")) called = true;
      return onFileAutoloaded.call(this, file, exports);
    };
    const files: [string, string][] = [
      ["x.ts", "export const X = true"],
      ["y.ts", 'export const Y = await globalThis.$get("X", globalThis.$Namespace)'],
    ];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      await require(File.expandPath("y.ts"));
      expect(await get(Namespace, "Y")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });

  it("autoloading a directory triggers on_dir_autoloaded (Object)", async () => {
    const onDirAutoloaded = loader.onDirAutoloaded;
    loader.onDirAutoloaded = function (this: Loader, dir) {
      if (dir === File.expandPath("m")) called = true;
      return onDirAutoloaded.call(this, dir);
    };
    await withSetup(loader, [["m/x.ts", "export const X = true"]], {}, async () => {
      expect(await get(await get(Object, "M"), "X")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });

  it("autoloading a directory triggers on_dir_autoloaded (Namespace)", async () => {
    const onDirAutoloaded = loader.onDirAutoloaded;
    loader.onDirAutoloaded = function (this: Loader, dir) {
      if (dir === File.expandPath("m")) called = true;
      return onDirAutoloaded.call(this, dir);
    };
    const files: [string, string][] = [["m/x.ts", "export const X = true"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      expect(await get(await get(Namespace, "M"), "X")).toBeTruthy();
      expect(called).toBeTruthy();
    });
  });
});
