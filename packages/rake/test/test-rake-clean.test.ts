import { describe, expect, it } from "vitest";
import { Dir, File, FileUtils, loadIseqEval, rbFLoad } from "@blazetrails/ruby-compat";
import type { Cleaner as CleanerModule } from "../lib/clean.js";
import { Rake } from "../lib/rake-module.js";
import { Task } from "../lib/task.js";
import { useRakeTestCase } from "./support/file-creation.js";
import { captureOutput } from "./support/application.js";

const CLEAN_RB = new URL("../lib/clean.ts", import.meta.url).pathname;
const { Cleaner } = (await loadIseqEval(CLEAN_RB)) as { Cleaner: typeof CleanerModule };

describe("TestRakeClean", () => {
  useRakeTestCase();

  it("clean", async () => {
    await rbFLoad(CLEAN_RB);

    expect(await Task.get("clean")).toBeTruthy();
    expect(await Task.get("clobber")).toBeTruthy();
    expect((await Task.get("clobber")).prerequisites.includes("clean")).toBeTruthy();
  });

  it("cleanup", async (ctx) => {
    try {
      const fileName = await createUndeletableFile(ctx.skip);

      const [out] = await captureOutput(() => Cleaner.cleanup(fileName, { verbose: false }));
      expect(out).toMatch(/failed to remove/i);
    } finally {
      await removeUndeletableFile();
    }
  });

  it("cleanup ignores missing files", async () => {
    const fileName = File.join(Dir.pwd(), "missing_directory", "no_such_file");

    const [out] = await captureOutput(() => Cleaner.cleanup(fileName, { verbose: false }));
    expect(out).not.toMatch(/failed to remove/i);
  });

  it("cleanup trace", async () => {
    const fileName = await createFile();

    const [out, err] = await captureOutput(() => withTrace(true, () => Cleaner.cleanup(fileName)));

    expect(err).toBe("");
    expect(out).toBe(`rm -r ${fileName}\n`);
  });

  it("cleanup without trace", async () => {
    const fileName = await createFile();

    const [out, err] = await captureOutput(() => withTrace(false, () => Cleaner.cleanup(fileName)));
    expect(out).toBe("");
    expect(err).toBe("");
  });

  it("cleanup opt overrides trace silent", async () => {
    const fileName = await createFile();

    const [out, err] = await captureOutput(() =>
      withTrace(true, () => Cleaner.cleanup(fileName, { verbose: false })),
    );
    expect(out).toBe("");
    expect(err).toBe("");
  });

  it("cleanup opt overrides trace verbose", async () => {
    const fileName = await createFile();

    const [out, err] = await captureOutput(() =>
      withTrace(false, () => Cleaner.cleanup(fileName, { verbose: true })),
    );

    expect(err).toBe("");
    expect(out).toBe(`rm -r ${fileName}\n`);
  });
});

async function createFile(): Promise<string> {
  const dirName = File.join(Dir.pwd(), "deletedir");
  const fileName = File.join(dirName, "deleteme");
  await FileUtils.mkdirAsync(dirName);
  await FileUtils.touchAsync(fileName);
  return fileName;
}

async function createUndeletableFile(omit: (note: string) => never): Promise<string> {
  const dirName = File.join(Dir.pwd(), "deletedir");
  const fileName = File.join(dirName, "deleteme");
  await FileUtils.mkdirAsync(dirName);
  await FileUtils.touchAsync(fileName);
  await FileUtils.chmodAsync(0, fileName);
  await FileUtils.chmodAsync(0, dirName);
  try {
    await FileUtils.chmodAsync(0o644, fileName);
  } catch {
    return fileName;
  }
  return omit("Permission to delete files is different on this system");
}

async function removeUndeletableFile(): Promise<void> {
  const dirName = File.join(Dir.pwd(), "deletedir");
  const fileName = File.join(dirName, "deleteme");
  await FileUtils.chmodAsync(0o777, dirName);
  await FileUtils.chmodAsync(0o777, fileName);
  await Cleaner.cleanup(fileName, { verbose: false });
  await Cleaner.cleanup(dirName, { verbose: false });
}

async function withTrace(value: boolean, block: () => unknown): Promise<void> {
  const old = Rake.application!.options.trace;
  Rake.application!.options.trace = value;
  try {
    FileUtils.fileutilsOutput = undefined;
    await block();
  } finally {
    Rake.application!.options.trace = old;
  }
}
