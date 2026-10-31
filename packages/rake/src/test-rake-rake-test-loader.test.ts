import { File, FileUtils, LoadError, SystemExit, rbArgv, rbFLoad } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { captureOutput, useApplicationTestCase } from "./test-helpers/application.js";

const load = () => rbFLoad(new URL("./rake-test-loader.ts", import.meta.url).pathname);
const argvReplace = (...argv: string[]) => rbArgv().splice(0, rbArgv().length, ...argv);

describe("TestRakeRakeTestLoader", () => {
  const app = useApplicationTestCase();
  const saved = [...rbArgv()];
  afterEach(() => argvReplace(...saved));

  it("pattern", async () => {
    await FileUtils.touchAsync("foo.js");
    await FileUtils.touchAsync("test_a.js");
    await FileUtils.touchAsync("test_b.js");

    argvReplace("foo.js", "test_*.js", "-v");

    await load();

    expect(rbArgv()).toEqual(["-v"]);
  });

  it("load error from missing test file", async () => {
    const [out, err] = await captureOutput(async () => {
      argvReplace("no_such_test_file.rb");

      await expect(load()).rejects.toThrow(SystemExit);
    });

    expect(out).toBe("");

    const noSuchPath = File.join(app.tempdir, "no_such_test_file.rb");

    expect(err).toBe(`\nFile does not exist: ${noSuchPath}\n\n\n`);
  });

  it("load error raised implicitly", async () => {
    await File.writeAsync("error_test.js", "import 'superkalifragilisticoespialidoso';");
    const [out, err] = await captureOutput(async () => {
      argvReplace("error_test.js");

      await expect(load()).rejects.toThrow(/superkalifragilisticoespialidoso/);
    });
    expect(out).toBe("");
    expect(err).toBe("");
  });

  it("load error raised explicitly", async () => {
    Object.assign(globalThis, { LoadError });
    await File.writeAsync("error_test.js", "throw new LoadError('explicitly raised');");
    const [out, err] = await captureOutput(async () => {
      argvReplace("error_test.js");

      const exc = await load().catch((e: unknown) => e);
      expect(exc).toBeInstanceOf(LoadError);
      expect((exc as LoadError).message).toBe("explicitly raised");
    });
    expect(out).toBe("");
    expect(err).toBe("");
  });
});
