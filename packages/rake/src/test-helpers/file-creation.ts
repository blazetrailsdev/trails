import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import { DSL } from "../dsl-definition.js";
import { Rake } from "../rake-module.js";
import { FileUtilsExt } from "../file-utils-ext.js";
import { TaskManager } from "../task-manager.js";
import { afterEach, beforeEach } from "vitest";
import { TestTaskManager } from "./task-manager.js";

export const OLDFILE = "old";
export const NEWFILE = "new";

export async function createTimedFiles(oldfile: string, ...newfiles: string[]): Promise<void> {
  if (await File.isExistAsync(oldfile)) {
    let allNewer = true;
    for (const newfile of newfiles) {
      allNewer &&=
        (await File.isExistAsync(newfile)) &&
        (await File.mtimeAsync(newfile)) > (await File.mtimeAsync(oldfile));
    }
    if (allNewer) return;
  }
  const now = new Date();
  await createFile(oldfile, new Date(now.getTime() - 60_000));
  for (const newfile of newfiles) await createFile(newfile, now);
}

export async function createDir(dirname: string): Promise<Date> {
  if (!(await File.isExistAsync(dirname))) await FileUtils.mkdirPAsync(dirname);
  return File.mtimeAsync(dirname);
}

export async function createFile(name: string, fileTime: Date | null = null): Promise<Date> {
  await createDir(File.dirname(name));
  if (!(await File.isExistAsync(name))) await FileUtils.touchAsync(name);
  if (fileTime != null) await File.utimeAsync(fileTime, fileTime, name);
  return File.mtimeAsync(name);
}

export async function deleteFile(name: string): Promise<void> {
  await FileUtils.rmFAsync(name);
}

export function useRakeTestCase(): { readonly tm: TestTaskManager } {
  const state = {} as { tm: TestTaskManager };
  let origPwd: string;
  let tempdir: string;
  beforeEach(() => {
    origPwd = Dir.pwd();
    tempdir = Dir.mktmpdir("test_rake_");
    Dir.chdir(tempdir);
    state.tm = new TestTaskManager();
    TaskManager.recordTaskMetadata = true;
    FileUtilsExt.verboseFlag = false;
  });
  afterEach(async () => {
    Dir.chdir(origPwd);
    await FileUtils.rmRfAsync(tempdir);
    delete Rake.application;
  });
  return state;
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
type TestCaseMixins = typeof DSL & typeof FileUtilsExt;
class TestCaseDSL {}

interface TestCaseDSL extends TestCaseMixins {}
include(TestCaseDSL, DSL);

export const dsl = new TestCaseDSL();
