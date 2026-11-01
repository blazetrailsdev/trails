import { File, registerConstant } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

describe("TestAllExpectedCpaths", () => {
  const Namespace = {};
  Object.defineProperty(Namespace, "name", { value: "overridden" });
  registerConstant("TestAllExpectedCpaths::Namespace", Namespace);

  const fileList = (...names: string[]) => names.map((name): [string] => [name]);

  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  async function expectedCpaths(expected: Record<string, string>) {
    const actual = await loader.allExpectedCpaths();

    expect(Object.keys(actual).length).toEqual(Object.keys(expected).length);
    for (const [relpath, expectedCpath] of Object.entries(expected)) {
      expect(actual[File.expandPath(relpath)]).toEqual(expectedCpath);
    }
  }

  it("returns an empty hash if there are no root directories", async () => {
    await withSetup(loader, [], { dirs: [] }, async () => {
      await expectedCpaths({});
    });
  });

  it("honors a real root module name", async () => {
    await withSetup(loader, [["x.ts", ""]], { namespace: Namespace }, async () => {
      await expectedCpaths({
        ".": "TestAllExpectedCpaths::Namespace",
        "x.ts": "TestAllExpectedCpaths::Namespace::X",
      });
    });
  });

  it("does not include ignored files and directories", async () => {
    const files = fileList("x.ts", "ignored.ts", "ignored/x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({ ".": "Object", "x.ts": "X" });
    });
  });

  it("does not include hidden files", async () => {
    const files = fileList(".foo.ts", "x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({ ".": "Object", "x.ts": "X" });
    });
  });

  it("does not include directories without Ruby files ", async () => {
    const files = fileList(
      "x.ts",
      "empty",
      "assets/html/index.html",
      "assets/css/index.css",
      "m/ignored.ts",
    );
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({ ".": "Object", "x.ts": "X" });
    });
  });

  it("includes shadowed files", async () => {
    const files = fileList("rd1/x.ts", "rd2/x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({
        rd1: "Object",
        "rd1/x.ts": "X",
        rd2: "Object",
        "rd2/x.ts": "X",
      });
    });
  });

  it("honors collapsed directories", async () => {
    const files = fileList("x.ts", "collapsed/y.ts", "m/collapsed/n/x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({
        ".": "Object",
        "x.ts": "X",
        collapsed: "Object",
        "collapsed/y.ts": "Y",
        m: "M",
        "m/collapsed": "M",
        "m/collapsed/n": "M::N",
        "m/collapsed/n/x.ts": "M::N::X",
      });
    });
  });

  it("implicit namespaces", async () => {
    const files = fileList("x.ts", "m/x.ts", "m/n/x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({
        ".": "Object",
        "x.ts": "X",
        m: "M",
        "m/x.ts": "M::X",
        "m/n": "M::N",
        "m/n/x.ts": "M::N::X",
      });
    });
  });

  it("explicit namespaces", async () => {
    const files = fileList("x.ts", "m.ts", "m/x.ts", "m/n.ts", "m/n/x.ts");
    await withSetup(loader, files, {}, async () => {
      await expectedCpaths({
        ".": "Object",
        "x.ts": "X",
        "m.ts": "M",
        m: "M",
        "m/x.ts": "M::X",
        "m/n.ts": "M::N",
        "m/n": "M::N",
        "m/n/x.ts": "M::N::X",
      });
    });
  });
});
