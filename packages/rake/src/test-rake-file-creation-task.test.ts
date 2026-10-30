import { beforeEach, describe, expect, it } from "vitest";
import { FileUtils } from "@blazetrails/ruby-compat";
import { EARLY } from "./early-time.js";
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
    expect(fcTask.name).toBe(DUMMY_DIR);
    await FileUtils.rmRfAsync(fcTask.name);
    expect(await fcTask.isNeeded()).toBeTruthy();
    await FileUtils.mkdirAsync(fcTask.name);
    expect(fcTask.prerequisites).toEqual([]);
    expect(await fcTask.isNeeded()).toBeFalsy();
  });

  it("directory", async () => {
    dsl.directory(DUMMY_DIR);
    const fcTask = await rake.tm.get(DUMMY_DIR);
    expect(fcTask.name).toBe(DUMMY_DIR);
    expect(fcTask).toBeInstanceOf(FileCreationTask);
  });

  it("no retriggers on filecreate task", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE).enhance([NEWFILE]);
    const t2 = rake.tm.intern(FileCreationTask, NEWFILE);
    expect(await t2.isNeeded()).toBeFalsy();
    expect(await t1.isNeeded()).toBeFalsy();
  });

  it("no retriggers on file task", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE).enhance([NEWFILE]);
    const t2 = rake.tm.intern(FileCreationTask, NEWFILE);
    expect(await t2.isNeeded()).toBeFalsy();
    expect(await t1.isNeeded()).toBeFalsy();
  });

  it("very early timestamp", async () => {
    const t1 = rake.tm.intern(FileCreationTask, OLDFILE);
    expect(await t1.timestamp()).toBe(EARLY);
    expect(EARLY.lessThan(new Date())).toBe(true);
    expect(EARLY.lessThan(new Date(Date.now() - 1_000_000_000))).toBe(true);
  });
});
