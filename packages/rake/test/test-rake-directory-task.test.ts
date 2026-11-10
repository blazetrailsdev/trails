import { describe, expect, it } from "vitest";
import { File, Pathname, block } from "@blazetrails/ruby-compat";
import { FileCreationTask } from "../lib/file-creation-task.js";
import { FileTask } from "../lib/file-task.js";
import { Win32 } from "../lib/win32.js";
import { FileList } from "../lib/file-list.js";
import type { Task } from "../lib/task.js";
import { dsl, useRakeTestCase } from "./support/file-creation.js";

describe("TestRakeDirectoryTask", () => {
  const rake = useRakeTestCase();

  it("directory", async () => {
    dsl.desc("DESC");

    dsl.directory("a/b/c");

    expect((await rake.tm.get("a")).constructor).toEqual(FileCreationTask);
    expect((await rake.tm.get("a/b")).constructor).toEqual(FileCreationTask);
    expect((await rake.tm.get("a/b/c")).constructor).toEqual(FileCreationTask);

    expect((await rake.tm.get("a")).comment).toBeNull();
    expect((await rake.tm.get("a/b")).comment).toBeNull();
    expect((await rake.tm.get("a/b/c")).comment).toEqual("DESC");

    await dsl.verbose(false, async () => (await rake.tm.get("a/b")).invoke());

    expect(await File.isExistAsync("a/b")).toBeTruthy();
    expect(await File.isExistAsync("a/b/c")).toBeFalsy();
  });

  it("directory colon", async () => {
    dsl.directory("a:b");

    expect((await rake.tm.get("a:b")).constructor).toEqual(FileCreationTask);
  });

  it.skipIf(!Win32.isWindows())("directory win32", async () => {
    dsl.desc("WIN32 DESC");
    dsl.directory("c:/a/b/c");
    expect((await rake.tm.get("c:")).constructor).toEqual(FileTask);
    expect((await rake.tm.get("c:/a")).constructor).toEqual(FileCreationTask);
    expect((await rake.tm.get("c:/a/b")).constructor).toEqual(FileCreationTask);
    expect((await rake.tm.get("c:/a/b/c")).constructor).toEqual(FileCreationTask);
    expect((await rake.tm.get("c:/")).comment).toBeNull();
    expect((await rake.tm.get("c:/a/b/c")).comment).toEqual("WIN32 DESC");
    expect((await rake.tm.get("c:/a/b")).comment).toBeNull();
  });

  it("can use blocks", async () => {
    const runlist: string[] = [];

    const t1 = await dsl.directory(
      { "a/b/c": "t2" },
      block((t: Task) => void runlist.push(t.name)),
    );
    dsl.task(
      "t2",
      block((t: Task) => void runlist.push(t.name)),
    );

    await dsl.verbose(false, () => t1.invoke());

    expect(await rake.tm.get("a/b/c")).toEqual(t1);
    expect((await rake.tm.get("a/b/c")).constructor).toEqual(FileCreationTask);
    expect(runlist).toEqual(["t2", "a/b/c"]);
    expect(await File.isDirectoryAsync("a/b/c")).toBeTruthy();
  });

  it("can use pathname", async () => {
    dsl.directory(new Pathname("a/b/c"));

    expect((await rake.tm.get("a/b/c")).constructor).toEqual(FileCreationTask);

    await dsl.verbose(false, async () => (await rake.tm.get("a/b/c")).invoke());

    expect(await File.isDirectoryAsync("a/b/c")).toBeTruthy();
  });

  it("can use filelist", async () => {
    await dsl.directory(FileList.get("a", "b", "c"));

    expect((await rake.tm.get("a")).constructor).toEqual(FileCreationTask);

    await dsl.verbose(false, async () => (await rake.tm.get("a")).invoke());

    expect(await File.isDirectoryAsync("a")).toBeTruthy();
  });
});
