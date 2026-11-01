import { File, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import type { Loader } from "./loader.js";
import { ExplicitNamespaces } from "./registry/explicit-namespaces.js";
import { Registry } from "./registry.js";
import { newLoader, teardown, withFiles, withSetup } from "./test-helpers/loader-test.js";

describe("Loader#setup", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  const cref = (cname: string) => new Cref(Object, cname);

  it("records a row per top-level file and an implicit namespace with its dirs", async () => {
    const files: [string, string?][] = [["x.ts"], ["blog-post.ts"], ["m/y.ts"]];
    await withSetup(loader, files, {}, () => {
      const m = File.expandPath("m");
      expect(Object.keys(loader.autoloads).sort()).toEqual(
        [File.expandPath("x.ts"), File.expandPath("blog-post.ts"), m].sort(),
      );
      expect(loader.autoloads[File.expandPath("blog-post.ts")].path()).toEqual("BlogPost");
      expect(cref("M").isAutoload()).toEqual(m);
      expect(loader.namespaceDirs.get(cref("M"))).toEqual([m]);
      expect(Registry.loaderFor(m)).toBe(loader);
      expect(loader.autoloads[File.expandPath("m/y.ts")]).toBeUndefined();
    });
  });

  it("promotes an implicit namespace when the file sorts after its directory", async () => {
    await withSetup(loader, [["m.ts"], ["m/y.ts"]], {}, () => {
      const file = File.expandPath("m.ts");
      const dir = File.expandPath("m");
      expect(cref("M").isAutoload()).toEqual(file);
      expect(Object.keys(loader.autoloads)).toEqual([file]);
      expect(Registry.loaderFor(dir)).toBeNull();
      expect(loader.namespaceDirs.get(cref("M"))).toEqual([dir]);
      expect(ExplicitNamespaces.isRegistered(cref("M"))).toBe(loader);
    });
  });

  it("registers an explicit namespace when the file is seen before a directory", async () => {
    await withFiles([["a/m.ts"], ["b/m/y.ts"]], async () => {
      await loader.pushDir("a");
      await loader.pushDir("b");
      await loader.setup();
      expect(cref("M").isAutoload()).toEqual(File.expandPath("a/m.ts"));
      expect(loader.namespaceDirs.get(cref("M"))).toEqual([File.expandPath("b/m")]);
      expect(ExplicitNamespaces.isRegistered(cref("M"))).toBe(loader);
    });
  });

  it("shadows a file by an existing constant", async () => {
    (TopLevel as Record<string, unknown>).X = 1;
    try {
      await withSetup(loader, [["x.ts"]], {}, () => {
        expect(loader.isShadowedFile(File.expandPath("x.ts"))).toBe(true);
        expect(loader.autoloads).toEqual({});
      });
    } finally {
      delete (TopLevel as Record<string, unknown>).X;
    }
  });

  it("shadows a file by another one managed by the same loader", async () => {
    await withFiles([["a/x.ts"], ["b/x.ts"]], async () => {
      await loader.pushDir("a");
      await loader.pushDir("b");
      await loader.setup();
      expect(loader.isShadowedFile(File.expandPath("a/x.ts"))).toBe(false);
      expect(loader.isShadowedFile(File.expandPath("b/x.ts"))).toBe(true);
    });
  });

  it("shadows a file by another one managed by a different loader", async () => {
    await withFiles([["a/x.ts"], ["b/x.ts"]], async () => {
      const second = newLoader();
      await loader.pushDir("a");
      await second.pushDir("b");
      await loader.setup();
      await second.setup();
      expect(second.isShadowedFile(File.expandPath("b/x.ts"))).toBe(true);
    });
  });
});
