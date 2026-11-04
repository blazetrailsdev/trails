import { Pathname } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError, SetupRequired } from "./error.js";
import type { Loader } from "./loader.js";
import {
  isRequired,
  newLoader,
  teardown,
  withFiles,
  withSetup,
} from "./test-helpers/loader-test.js";

type Files = [string, string?][];
const g = globalThis as Record<string, unknown>;

describe("TestEagerLoadDir", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("eager loads all files", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["y.ts", "export const Y = 1"],
      ["m/n/p.ts", "export class P {}"],
      ["m/n/a.ts", "export const A = 1"],
      ["m/n/p/q/z.ts", "export const Z = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir(".");

      for (const file of files) expect(isRequired(file)).toBeTruthy();
    });
  });

  it("eager loads all files (Pathname)", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["y.ts", "export const Y = 1"],
      ["m/n/p.ts", "export class P {}"],
      ["m/n/a.ts", "export const A = 1"],
      ["m/n/p/q/z.ts", "export const Z = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir(new Pathname("."));
      expect(isRequired(...files)).toBeTruthy();
    });
  });

  it("does not eager load excluded files or directories", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["y.ts", "export const Y = 1"],
      ["m/n.ts", "export class N {}"],
      ["m/n/a.ts", "export const A = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("y.ts");
      loader.doNotEagerLoad("m/n");
      await loader.eagerLoadDir(".");

      expect(isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
      expect(isRequired(files[2])).toBeTruthy();
      expect(!isRequired(files[3])).toBeTruthy();
    });
  });

  it("does not eager load excluded files or directories (descendants)", async () => {
    const files: Files = [
      ["excluded/m/n.ts", "export class N {}"],
      ["excluded/m/n/a.ts", "export const A = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("excluded");
      await loader.eagerLoadDir(".");

      expect(!files.some((file) => isRequired(file))).toBeTruthy();
    });
  });

  it("eager loads excluded explicit namespaces if some subtree is not excluded", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["m/n.ts", "export class N {}"],
      ["m/n/a.ts", "export const A = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("m/n.ts");
      await loader.eagerLoadDir(".");

      expect(isRequired(...files)).toBeTruthy();
    });
  });

  it("does not load intermediate files if the target is an excluded descendant", async () => {
    const files: Files = [
      ["excluded.ts", "export class Excluded {}"],
      ["excluded/n/x.ts", "throw 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      loader.doNotEagerLoad("excluded");
      await loader.eagerLoadDir("excluded/n");

      expect(!isRequired(files[0])).toBeTruthy();
    });
  });

  it("does not eager load descendant ignored files or directories", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["y.ts", "throw 1"],
      ["m/n.ts", "export class N {}"],
      ["m/n/a.ts", "throw 1"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir(".");
      await loader.ignore("y.ts");
      await loader.ignore("m/n");
      await loader.setup();
      await loader.eagerLoadDir(".");

      expect(isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
      expect(isRequired(files[2])).toBeTruthy();
      expect(!isRequired(files[3])).toBeTruthy();
    });
  });

  it("does not eager load shadowed files", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["rd2/x.ts", "throw 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("rd2");

      expect(!isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
    });
  });

  it("eager loads all files in a subdirectory, ignoring what is above", async () => {
    const files: Files = [
      ["x.ts", "throw 1"],
      ["m/k/x.ts", "throw 1"],
      ["m/n/p.ts", "export class P {}"],
      ["m/n/a.ts", "export const A = 1"],
      ["m/n/p/q/z.ts", "export const Z = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("m/n");

      expect(!isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
      expect(isRequired(files[2])).toBeTruthy();
      expect(isRequired(files[3])).toBeTruthy();
      expect(isRequired(files[4])).toBeTruthy();
    });
  });

  it("eager loads all files, ignoring other directories (different namespace)", async () => {
    const files: Files = [
      ["a/x.ts", "export const X = 1"],
      ["b/y.ts", "export const Y = 1"],
      ["c/z.ts", "export const Z = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("a");

      expect(isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
      expect(!isRequired(files[2])).toBeTruthy();
    });
  });

  it("eager loads all files, ignoring other directories (same namespace)", async () => {
    const files: Files = [
      ["rd1/m/x.ts", "export const X = 1"],
      ["rd2/m/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("rd1/m");

      expect(isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
    });
  });

  it("eager loads collapsed directories, ignoring the rest of the namespace", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["collapsed/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("collapsed");

      expect(!isRequired(files[0])).toBeTruthy();
      expect(isRequired(files[1])).toBeTruthy();
    });
  });

  it("does not eager load ignored directories (same)", async () => {
    const files: Files = [["ignored/x.ts", "throw 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("ignored");

      expect(!isRequired(files[0])).toBeTruthy();
    });
  });

  it("does not eager load if the argument is an ignored directory (descendant)", async () => {
    const files: Files = [["ignored/m/x.ts", "throw 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("ignored/m");

      expect(!isRequired(files[0])).toBeTruthy();
    });
  });

  it("files under nested root directories are ignored", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["nested_root/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, { dirs: [".", "nested_root"] }, async () => {
      await loader.eagerLoadDir(".");

      expect(isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
    });
  });

  it("files under a root directory are loaded even if it has an ignored ascendant", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["ignored/x.ts", "throw 1"],
      ["ignored/nested-rd/y.ts", "export const Y = 1"],
    ];
    await withSetup(loader, files, { dirs: [".", "ignored/nested-rd"] }, async () => {
      await loader.eagerLoadDir("ignored/nested-rd");

      expect(!isRequired(files[0])).toBeTruthy();
      expect(!isRequired(files[1])).toBeTruthy();
      expect(isRequired(files[2])).toBeTruthy();
    });
  });

  it("does not eager load hidden directories", async () => {
    const files: Files = [["a/x.ts", "export const X = 1"], ["a/.b/c/x.ts"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("a/.b");
      expect(!isRequired(files[0])).toBeTruthy();

      await loader.eagerLoadDir("a/.b/c");
      expect(!isRequired(files[0])).toBeTruthy();
    });
  });

  it("can be called recursively", async () => {
    g.$testLoader = loader;
    const files: Files = [
      ["a/x.ts", "export const X = 1; await globalThis.$testLoader.eagerLoadDir('b');"],
      ["b/x.ts", "export const X = 1"],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("a");

      expect(files.every((file) => isRequired(file))).toBeTruthy();
    });
  });

  it("does not prevent reload", async () => {
    g.$testLoadedCount = 0;
    const files: Files = [["m/x.ts", "globalThis.$testLoadedCount += 1; export const X = 1;"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir("m");
      expect(g.$testLoadedCount).toEqual(1);

      await loader.reload();

      await loader.eagerLoadDir("m");
      expect(g.$testLoadedCount).toEqual(2);
    });
  });

  it("non-Ruby files are just ignored", async () => {
    const files: Files = [
      ["x.ts", "export const X = 1"],
      ["README.md", ""],
      ["TODO.txt", ""],
      [".config", ""],
    ];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoadDir(".");

      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("shortcircuits if eager loaded", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(loader, files, {}, async () => {
      await loader.eagerLoad();

      loader.actualEagerLoadDir = async () => {
        throw new Error();
      };

      await loader.eagerLoadDir(".");
    });
  });

  it("raises Zeitwerk::Error if the argument is not a directory", async () => {
    await withSetup(loader, [], {}, async () => {
      const call = loader.eagerLoadDir(import.meta.filename);
      await expect(call).rejects.toThrow(ZeitwerkError);
      const e = await call.catch((error: Error) => error);
      expect((e as Error).message).toEqual(`${import.meta.filename} is not a directory`);
    });
  });

  it("raises if the argument is not managed by the loader", async () => {
    await withSetup(loader, [], {}, async () => {
      const call = loader.eagerLoadDir(import.meta.dirname);
      await expect(call).rejects.toThrow(ZeitwerkError);
      const e = await call.catch((error: Error) => error);
      expect((e as Error).message).toEqual(`I do not manage ${import.meta.dirname}`);
    });
  });

  it("raises if called before setup", async () => {
    await expect(loader.eagerLoadDir(import.meta.dirname)).rejects.toThrow(SetupRequired);
  });
});
