import { File, Pathname } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "./loader.js";
import { isRequired, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

type Files = [string, string?][];

function hooks() {
  const state = { loader: null as unknown as Loader };
  beforeEach(async () => {
    state.loader = await newLoader({ setup: false });
  });
  afterEach(teardown);
  return state;
}

async function assertRaises(promise: Promise<unknown>): Promise<Error> {
  const e = await promise.then(
    () => null,
    (error: Error) => error,
  );
  expect(e).toBeInstanceOf(Error);
  return e as Error;
}

describe("TestLoadFile", () => {
  class TestLoadFile {}
  const s = hooks();

  it("loads a top-level file", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, {}, async () => {
      await s.loader.loadFile("x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("loads a top-level file (Pathname)", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, {}, async () => {
      await s.loader.loadFile(new Pathname("x.ts"));
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("loads a top-level file (custom root namespace)", async () => {
    const files: Files = [["x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, { namespace: TestLoadFile }, async () => {
      await s.loader.loadFile("x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("loads a namespaced file", async () => {
    const files: Files = [["m/x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, {}, async () => {
      await s.loader.loadFile("m/x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("loads a namespaced file (custom root namespace)", async () => {
    const files: Files = [["m/x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, { namespace: TestLoadFile }, async () => {
      await s.loader.loadFile("m/x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("supports collapsed directories", async () => {
    const files: Files = [["m/collapsed/x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, {}, async () => {
      await s.loader.loadFile("m/collapsed/x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });
});

describe("TestLoadFileErrors", () => {
  const s = hooks();

  it("raises if the argument does not exist", async () => {
    await withSetup(s.loader, [], {}, async () => {
      const e = await assertRaises(s.loader.loadFile("foo.ts"));
      expect(e.message).toEqual(`${File.expandPath("foo.ts")} does not exist`);
    });
  });

  it("raises if the argument is a directory", async () => {
    await withSetup(s.loader, [["m/x.ts", "export const X = 1"]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile("m"));
      expect(e.message).toEqual(`${File.expandPath("m")} is not a Ruby file`);
    });
  });

  it("raises if the argument is a file, but does not have .rb extension", async () => {
    await withSetup(s.loader, [["README.md", ""]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile("README.md"));
      expect(e.message).toEqual(`${File.expandPath("README.md")} is not a Ruby file`);
    });
  });

  it("raises if the argument is ignored", async () => {
    await withSetup(s.loader, [["ignored.ts", "throw 1"]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile("ignored.ts"));
      expect(e.message).toEqual(`${File.expandPath("ignored.ts")} is ignored`);
    });
  });

  it("raises if the argument is a descendant of an ignored directory", async () => {
    await withSetup(s.loader, [["ignored/n/x.ts", "throw 1"]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile("ignored/n/x.ts"));
      expect(e.message).toEqual(`${File.expandPath("ignored/n/x.ts")} is ignored`);
    });
  });

  it("raises if the argument lives in an ignored root directory", async () => {
    const files: Files = [["ignored/n/x.ts", "throw 1"]];
    await withSetup(s.loader, files, { dirs: ["ignored"] }, async () => {
      const e = await assertRaises(s.loader.loadFile("ignored/n/x.ts"));
      expect(e.message).toEqual(`${File.expandPath("ignored/n/x.ts")} is ignored`);
    });
  });

  it("raises if the argument is a hidden Ruby file", async () => {
    await withSetup(s.loader, [[".ignored.ts"]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile(".ignored.ts"));
      expect(e.message).toEqual(`${File.expandPath(".ignored.ts")} is ignored`);
    });
  });

  it("raises if the argument is a descendant of a hidden directory", async () => {
    await withSetup(s.loader, [[".m/n/x.ts"]], {}, async () => {
      const e = await assertRaises(s.loader.loadFile(".m/n/x.ts"));
      expect(e.message).toEqual(`${File.expandPath(".m/n/x.ts")} is ignored`);
    });
  });

  it("the root directory can be hidden", async () => {
    const files: Files = [[".rd/n/x.ts", "export const X = 1"]];
    await withSetup(s.loader, files, { dirs: [".rd"] }, async () => {
      await s.loader.loadFile(".rd/n/x.ts");
      expect(isRequired(files[0])).toBeTruthy();
    });
  });

  it("raises if the file exists, but it is not managed by this loader", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["external/x.ts", ""],
    ];
    await withSetup(s.loader, files, { dirs: ["rd1"] }, async () => {
      const e = await assertRaises(s.loader.loadFile("external/x.ts"));
      expect(e.message).toEqual(`I do not manage ${File.expandPath("external/x.ts")}`);
    });
  });

  it("raises if the file is shadowed", async () => {
    const files: Files = [
      ["rd1/x.ts", "export const X = 1"],
      ["rd2/x.ts", "throw 1"],
    ];
    await withSetup(s.loader, files, {}, async () => {
      const e = await assertRaises(s.loader.loadFile("rd2/x.ts"));
      expect(e.message).toEqual(`${File.expandPath("rd2/x.ts")} is shadowed`);
    });
  });
});
