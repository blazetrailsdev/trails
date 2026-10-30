import { beforeEach, describe, expect, it } from "vitest";
import { FileUtils, Pathname, block, rbFLoad } from "@blazetrails/ruby-compat";
import { FileTask } from "./file-task.js";
import { LATE } from "./late-time.js";
import type { Task } from "./task.js";
import {
  NEWFILE,
  OLDFILE,
  createFile,
  createTimedFiles,
  deleteFile,
  dsl,
  useRakeTestCase,
} from "./test-helpers/file-creation.js";

const PHONY = new URL("./phony.ts", import.meta.url).pathname;

describe("TestRakeFileTask", () => {
  const rake = useRakeTestCase();
  let runs: string[];
  const run = block((t: Task) => void runs.push(t.name));

  beforeEach(async () => {
    rake.tm.clear();
    runs = [];
    await FileUtils.rmFAsync(NEWFILE);
    await FileUtils.rmFAsync(OLDFILE);
  });

  it("file need", async () => {
    const name = "dummy";
    dsl.file(name);

    const ftask = await rake.tm.get(name);

    expect(ftask.name).toBe(name);
    await deleteFile(ftask.name);

    expect(await ftask.isNeeded()).toBeTruthy();
    expect(await ftask.timestamp()).toBe(LATE);

    await createFile(ftask.name);

    expect(ftask.prerequisites).toEqual([]);
    expect(await ftask.isNeeded()).toBeFalsy();
  });

  it("file times new depends on old", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);

    const t1 = rake.tm.intern(FileTask, NEWFILE).enhance([OLDFILE]);
    const t2 = rake.tm.intern(FileTask, OLDFILE);
    expect(await t2.isNeeded()).toBeFalsy();
    expect(await t1.isNeeded()).toBeFalsy();
  });

  it("file times new depend on regular task timestamps", async () => {
    await rbFLoad(PHONY);

    const name = "dummy";
    dsl.task(name);

    await createTimedFiles(NEWFILE);

    const t1 = rake.tm.intern(FileTask, NEWFILE).enhance([name]);

    expect(await t1.isNeeded()).toBeTruthy();

    dsl.task({ [name]: "phony" });

    expect(await t1.isNeeded()).toBeTruthy();
  });

  it("file times old depends on new", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);

    const t1 = rake.tm.intern(FileTask, OLDFILE).enhance([NEWFILE]);
    const t2 = rake.tm.intern(FileTask, NEWFILE);
    expect(await t2.isNeeded()).toBeFalsy();
    const preqStamp = await (await rake.tm.get(t1.prerequisites[0])).timestamp();
    expect(await t2.timestamp()).toEqual(preqStamp);
    expect(((await t1.timestamp()) as Date).getTime()).toBeLessThan((preqStamp as Date).getTime());
    expect(await t1.isNeeded()).toBeTruthy();
  });

  it("file depends on task depend on file", async () => {
    await createTimedFiles(OLDFILE, NEWFILE);

    dsl.file({ [NEWFILE]: ["obj"] }, run);
    dsl.task({ obj: [OLDFILE] }, run);
    dsl.file(OLDFILE, run);

    await (await rake.tm.get("obj")).invoke();
    await (await rake.tm.get(NEWFILE)).invoke();
    expect(runs).toContain(NEWFILE);
  });

  it("existing file depends on non existing file", async () => {
    await createFile(OLDFILE);
    await deleteFile(NEWFILE);
    dsl.file(NEWFILE, run);
    dsl.file({ [OLDFILE]: NEWFILE }, run);

    await (await rake.tm.get(OLDFILE)).invoke();

    expect(runs).toEqual([NEWFILE, OLDFILE]);
  });

  it("needed eh build all", async () => {
    await createFile("a");

    dsl.file("a");

    const aTask = await rake.tm.get("a");

    expect(await aTask.isNeeded()).toBeFalsy();

    rake.tm.options.buildAll = true;

    expect(await aTask.isNeeded()).toBeTruthy();
  });

  it("needed eh dependency", async () => {
    const now = Date.now();
    await createFile("a", new Date(now));
    await createFile("b", new Date(now - 60_000));

    await createFile("c", new Date(now));
    await createFile("d", new Date(now - 60_000));

    dsl.file({ b: "a" });

    const bTask = await rake.tm.get("b");

    expect(await bTask.isNeeded()).toBeTruthy();

    dsl.file({ c: "d" });

    const cTask = await rake.tm.get("c");

    expect(await cTask.isNeeded()).toBeFalsy();
  });

  it("needed eh exists", async () => {
    const name = "dummy";
    dsl.file(name);

    const ftask = await rake.tm.get(name);

    expect(await ftask.isNeeded()).toBeTruthy();

    await createFile(name);

    expect(await ftask.isNeeded()).toBeFalsy();
  });

  it("source is first prerequisite", () => {
    const t = dsl.file({ f: ["preqA", "preqB"] });
    expect(t.source).toBe("preqA");
  });

  it("sources is all prerequisites", () => {
    const t = dsl.file({ f: ["preqA", "preqB"] });
    expect(t.sources).toEqual(["preqA", "preqB"]);
  });

  it("task can be pathname", async () => {
    const name = "dummy";
    dsl.file(new Pathname(name));

    const ftask = await rake.tm.get(name);

    expect(ftask.name).toBe(name);
  });

  it("prerequisite can be pathname", () => {
    const t = dsl.file({ f: new Pathname("preq") });
    expect(t.source).toBe("preq");
  });
});
