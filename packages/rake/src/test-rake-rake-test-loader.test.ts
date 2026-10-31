import {
  File,
  FileUtils,
  LoadError,
  SystemExit,
  rbArgv,
  rbFLoad,
  rbFRequireFile,
} from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { captureOutput, useApplicationTestCase } from "./test-helpers/application.js";

const load = () => rbFLoad(new URL("./rake-test-loader.ts", import.meta.url).pathname);
const argvReplace = (...argv: string[]) => rbArgv().splice(0, rbArgv().length, ...argv);

describe("TestRakeRakeTestLoader", () => {
  const app = useApplicationTestCase();
  const saved = [...rbArgv()];
  afterEach(() => {
    argvReplace(...saved);
    delete (globalThis as { LoadError?: unknown }).LoadError;
    delete (globalThis as { rbFRequireFile?: unknown }).rbFRequireFile;
  });

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

    expect(out).toBeEmpty();

    const noSuchPath = File.join(app.tempdir, "no_such_test_file.rb");

    expect(err).toMatch(new RegExp(`^\\nFile does not exist: ${noSuchPath}\\n\\n`));
  });

  it("load error raised implicitly", async () => {
    Object.assign(globalThis, { rbFRequireFile });
    await File.writeAsync(
      "error_test.js",
      "await rbFRequireFile('superkalifragilisticoespialidoso');",
    );
    const [out, err] = await captureOutput(async () => {
      argvReplace("error_test.js");

      const exc = load();
      await expect(exc).rejects.toThrow(LoadError);
      const { message } = (await exc.catch((e: unknown) => e)) as LoadError;
      expect(message).toBe("cannot load such file -- superkalifragilisticoespialidoso");
    });
    expect(out).toBeEmpty();
    expect(err).toBeEmpty();
  });

  it("load error raised explicitly", async () => {
    Object.assign(globalThis, { LoadError });
    await File.writeAsync("error_test.js", "throw new LoadError('explicitly raised');");
    const [out, err] = await captureOutput(async () => {
      argvReplace("error_test.js");

      const exc = load();
      await expect(exc).rejects.toThrow(LoadError);
      const { message } = (await exc.catch((e: unknown) => e)) as LoadError;
      expect(message).toBe("explicitly raised");
    });
    expect(out).toBeEmpty();
    expect(err).toBeEmpty();
  });
});
