import { File, Pathname, registerConstant } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Error as ZeitwerkError, NameError } from "./error.js";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withFiles, withSetup } from "./test-helpers/loader-test.js";

function hooks() {
  const state = { loader: null as unknown as Loader };
  beforeEach(() => {
    state.loader = newLoader();
  });
  afterEach(teardown);
  return state;
}

describe("TestCpathExpectedAtErrors", () => {
  const s = hooks();

  it("raises Zeitwerk::Error if the argument does not exist", async () => {
    await withSetup(s.loader, [], { dirs: ["."] }, async () => {
      const at = s.loader.cpathExpectedAt("does_not_exist.ts");
      await expect(at).rejects.toThrow(ZeitwerkError);
      const error = await at.catch((e: Error) => e);
      const abspath = File.expandPath("does_not_exist.ts");
      expect((error as Error).message).toContain(`${abspath} does not exist`);
    });
  });

  it("raises Zeitwerk::NameError if the argument does not yield a constant name", async () => {
    const files: [string, string?][] = [["foo.bar.ts"], ["1.ts"]];
    await withFiles(files, async () => {
      await s.loader.pushDir(".");
      s.loader.inflector.inflect({ "foo.bar": "Foo-bar" });

      let at = s.loader.cpathExpectedAt(files[0][0]);
      await expect(at).rejects.toThrow(NameError);
      let error: unknown = await at.catch((e: Error) => e);
      expect((error as Error).message).toContain("wrong constant name Foo-bar");

      at = s.loader.cpathExpectedAt(files[1][0]);
      await expect(at).rejects.toThrow(NameError);
      error = await at.catch((e: Error) => e);
      expect((error as Error).message).toContain("wrong constant name 1");
    });
  });

  it("raises Zeitwerk::NameError if some intermediate segment does not yield a constant name", async () => {
    await withFiles([["x/foo.bar/y/z.ts"]], async () => {
      await s.loader.pushDir(".");
      s.loader.inflector.inflect({ "foo.bar": "Foo-bar" });
      const at = s.loader.cpathExpectedAt("x/foo.bar/y/z.ts");
      await expect(at).rejects.toThrow(NameError);
      const error = await at.catch((e: Error) => e);
      expect((error as Error).message).toContain("wrong constant name Foo-bar");
    });
  });
});

describe("TestCpathExpectedAtNil", () => {
  const s = hooks();

  it("returns nil if the argument is not a directory or Ruby file", async () => {
    const files: [string, string?][] = [["tasks/database.rake"], ["CHANGELOG"]];
    await withSetup(s.loader, files, {}, async () => {
      for (const [file] of files) expect(await s.loader.cpathExpectedAt(file)).toBeNull();
    });
  });

  it("returns nil if the argument is ignored", async () => {
    await withSetup(s.loader, [["ignored.ts"]], {}, async () => {
      expect(await s.loader.cpathExpectedAt("ignored.ts")).toBeNull();
    });
  });

  it("returns nil if the argument is a hidden Ruby file", async () => {
    await withSetup(s.loader, [[".foo.ts"]], {}, async () => {
      expect(await s.loader.cpathExpectedAt(".foo.ts")).toBeNull();
    });
  });

  it("returns nil if the argument does not belong to the autoload paths", async () => {
    await withSetup(s.loader, [], { dirs: ["."] }, async () => {
      expect(await s.loader.cpathExpectedAt(import.meta.dirname)).toBeNull();
      expect(await s.loader.cpathExpectedAt(File.join(import.meta.dirname, "cref.ts"))).toBeNull();
    });
  });

  it("returns nil if an ancestor is ignored", async () => {
    await withSetup(s.loader, [["ignored/x.ts"]], {}, async () => {
      expect(await s.loader.cpathExpectedAt("ignored/x.ts")).toBeNull();
    });
  });

  it("returns nil if an ancestor is a hidden directory", async () => {
    await withSetup(s.loader, [[".foo/x.ts"]], {}, async () => {
      expect(await s.loader.cpathExpectedAt(".foo/x.ts")).toBeNull();
    });
  });
});

describe("TestCpathExpectedAtString", () => {
  const M = {};
  Object.defineProperty(M, "name", { value: "Overridden" });
  registerConstant("TestCpathExpectedAtString::M", M);
  const M_REAL_NAME = "TestCpathExpectedAtString::M";

  const s = hooks();

  const checkCpath = (
    files: [string][],
    options: { dirs?: string[]; namespace?: object },
    path: string | Pathname,
    expected: string,
  ) =>
    withSetup(s.loader, files, options, async () => {
      expect(await s.loader.cpathExpectedAt(path)).toEqual(expected);
    });

  it("returns the name of the root namespace for a root directory (Object)", () =>
    checkCpath([["README.md"]], {}, ".", "Object"));

  it("returns the name of the root namespace for a root directory (Object, Pathname)", () =>
    checkCpath([["README.md"]], {}, new Pathname("."), "Object"));

  it("returns the name of the root namespace for a root directory (Custom)", () =>
    checkCpath([], { dirs: ["."], namespace: M }, ".", M_REAL_NAME));

  it("returns the name of the root namespace for a root directory (Custom, Pathname)", () =>
    checkCpath([], { dirs: ["."], namespace: M }, new Pathname("."), M_REAL_NAME));

  it("returns the name of the root directory even if it is hidden", () =>
    checkCpath([[".foo/x.ts"]], { dirs: [".foo"] }, ".foo", "Object"));

  it("returns the cpath to a root file (Object)", () => checkCpath([["x.ts"]], {}, "x.ts", "X"));

  it("returns the cpath to a root file (Custom)", () =>
    checkCpath([["x.ts"]], { namespace: M }, "x.ts", `${M_REAL_NAME}::X`));

  it("returns the cpath to a subdirectory (Object)", () => checkCpath([["a/x.ts"]], {}, "a", "A"));

  it("returns the cpath to a subdirectory (Custom)", () =>
    checkCpath([["a/x.ts"]], { namespace: M }, "a", `${M_REAL_NAME}::A`));

  it("returns the cpath to a nested file (Object)", () =>
    checkCpath([["a/b/c/x.ts"]], {}, "a/b/c/x.ts", "A::B::C::X"));

  it("returns the cpath to a nested file (Custom)", () =>
    checkCpath([["a/b/c/x.ts"]], { namespace: M }, "a/b/c/x.ts", `${M_REAL_NAME}::A::B::C::X`));

  it("returns the cpath to a nested directory (Object)", () =>
    checkCpath([["a/b/c/x.ts"]], {}, "a/b/c", "A::B::C"));

  it("returns the cpath to a nested directory (Custom)", () =>
    checkCpath([["a/b/c/x.ts"]], { namespace: M }, "a/b/c", `${M_REAL_NAME}::A::B::C`));

  it("supports collapsed directories (Object)", async () => {
    await withSetup(s.loader, [["a/b/collapsed/x.ts"]], {}, async () => {
      expect(await s.loader.cpathExpectedAt("a/b/collapsed/x.ts")).toEqual("A::B::X");
      expect(await s.loader.cpathExpectedAt("a/b/collapsed")).toEqual("A::B");
    });
  });

  it("supports collapsed directories (Custom)", async () => {
    await withSetup(s.loader, [["a/b/collapsed/x.ts"]], { namespace: M }, async () => {
      expect(await s.loader.cpathExpectedAt("a/b/collapsed/x.ts")).toEqual(
        `${M_REAL_NAME}::A::B::X`,
      );
      expect(await s.loader.cpathExpectedAt("a/b/collapsed")).toEqual(`${M_REAL_NAME}::A::B`);
    });
  });
});
