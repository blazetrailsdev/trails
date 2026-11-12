import { File, FileUtils, NameError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoloadGet } from "../lib/core-ext/kernel.js";
import { Cref } from "../lib/cref.js";
import type { Loader } from "../lib/loader.js";
import { isRequired, newLoader, teardown, withFiles, withSetup } from "./support/loader-test.js";

type Files = [string, string][];

async function cget(cpath: string): Promise<unknown> {
  let mod: unknown = Object;
  for (const cname of cpath.split("::")) mod = await autoloadGet(new Cref(mod as object, cname));
  return mod;
}

describe("TestCollapse", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("top-level directories can be collapsed", async () => {
    const files: Files = [["collapsed/bar/x.ts", "export const X = true"]];
    await withSetup(loader, files, {}, async () => {
      expect(await cget("Bar::X")).toBeTruthy();
    });
  });

  it("collapsed directories are ignored as namespaces", async () => {
    const files: Files = [["foo/collapsed/x.ts", "export const X = true"]];
    await withSetup(loader, files, {}, async () => {
      expect(await cget("Foo::X")).toBeTruthy();
    });
  });

  it("collapsed directories are ignored as explicit namespaces", async () => {
    const files: Files = [
      ["collapsed.ts", "export const Collapsed = true"],
      ["collapsed/x.ts", "export const X = true"],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await cget("Collapsed")).toBeTruthy();
      expect(await cget("X")).toBeTruthy();
    });
  });

  it("explicit namespaces are honored downwards", async () => {
    const files: Files = [
      ["foo.ts", "export class Foo {}"],
      ["foo/foo/x.ts", "export const X = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse("foo");
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
    });
  });

  it("explicit namespaces are honored downwards, deeper", async () => {
    const files: Files = [
      ["foo.ts", "export class Foo {}"],
      ["foo/bar/foo/x.ts", "export const X = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse(["foo", "foo/bar"]);
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
    });
  });

  it("accepts several arguments", async () => {
    const files: Files = [
      ["foo/bar/x.ts", "export const X = true"],
      ["zoo/bar/x.ts", "export const X = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse("foo/bar", "zoo/bar");
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
      expect(await cget("Zoo::X")).toBeTruthy();
    });
  });

  it("accepts an array", async () => {
    const files: Files = [
      ["foo/bar/x.ts", "export const X = true"],
      ["zoo/bar/x.ts", "export const X = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse(["foo/bar", "zoo/bar"]);
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
      expect(await cget("Zoo::X")).toBeTruthy();
    });
  });

  it("supports glob patterns", async () => {
    const files: Files = [
      ["foo/bar/x.ts", "export const X = true"],
      ["zoo/bar/x.ts", "export const X = true"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse("*/bar");
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
      expect(await cget("Zoo::X")).toBeTruthy();
    });
  });

  it("collapse glob patterns are recomputed on reload", async () => {
    const files: Files = [["foo/bar/x.ts", "export const X = true"]];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      loader.collapse("*/bar");
      await loader.setup();

      expect(await cget("Foo::X")).toBeTruthy();
      await expect(cget("Zoo::X")).rejects.toThrow(NameError);

      FileUtils.mkdirP("zoo/bar");
      File.write("zoo/bar/x.ts", "export const X = true");

      await loader.reload();

      expect(await cget("Foo::X")).toBeTruthy();
      expect(await cget("Zoo::X")).toBeTruthy();
    });
  });

  it("collapse directories are honored when eager loading", async () => {
    const files: Files = [["foo/collapsed/x.ts", "export const X = true"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(isRequired(...files)).toBeTruthy();
    });
  });

  it("collapsed top-level directories are eager loaded too", async () => {
    const files: Files = [["collapsed/bar/x.ts", "export const X = true"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();
      expect(isRequired(...files)).toBeTruthy();
    });
  });
});
