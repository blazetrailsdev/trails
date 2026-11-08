import { beforeEach, describe, expect, it } from "vitest";
import { FileUtils, max } from "@blazetrails/ruby-compat";
import type { EarlyTime } from "./early-time.js";
import { FileCreationTask } from "./file-creation-task.js";
import {
  NEWFILE,
  OLDFILE,
  createDir,
  createTimedFiles,
  dsl,
  useRakeTestCase,
} from "./test-helpers/file-creation.js";

const DUMMY_DIR = "dummy_dir";

describe("TestRakeFileCreationTask", () => {
  const rake = useRakeTestCase();

  beforeEach(() => {
    rake.tm.clear();
  });

  it("file needed", async () => {
    await createDir(DUMMY_DIR);
    const fcTask = await rake.tm.get(DUMMY_DIR);
    expect(fcTask.name).toEqual(DUMMY_DIR);
    await FileUtils.rmRfAsync(fcTask.name);
    expect(await fcTask.isNeeded()).toBeTruthy();
    await FileUtils.mkdirAsync(fcTask.name);
    expect(max(fcTask.prerequisites)).toBeNull();
    expect(!(await fcTask.isNeeded())).toBeTruthy();
  });

  it("directory", async () => {
    dsl.directory(DUMMY_DIR);
    const fcTask = await rake.tm.get(DUMMY_DIR);
    expect(fcTask.name).toEqual(DUMMY_DIR);
    expect(fcTask instanceof FileCreationTask).toBeTruthy();
  });

  it("no retriggers on filecreate task", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE).enhance([NEWFILE]);
    const t2 = rake.tm.intern(FileCreationTask, NEWFILE);
    expect(!(await t2.isNeeded())).toBeTruthy();
    expect(!(await t1.isNeeded())).toBeTruthy();
  });

  it("no retriggers on file task", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE).enhance([NEWFILE]);
    const t2 = rake.tm.intern(FileCreationTask, NEWFILE);
    expect(!(await t2.isNeeded())).toBeTruthy();
    expect(!(await t1.isNeeded())).toBeTruthy();
  });

  it("very early timestamp", async () => {
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE);
    expect(((await t1.timestamp()) as EarlyTime).lessThan(new Date())).toBeTruthy();
    expect(
      ((await t1.timestamp()) as EarlyTime).lessThan(new Date(Date.now() - 1_000_000_000)),
    ).toBeTruthy();
  });
});
