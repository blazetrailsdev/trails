import { describe, expect, it } from "vitest";
import { File, Pathname, block } from "@blazetrails/ruby-compat";
import { FileCreationTask } from "./file-creation-task.js";
import type { Task } from "./task.js";
import { dsl, useRakeTestCase } from "./test-helpers/file-creation.js";

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

  it("can use blocks", async () => {
    const runlist: string[] = [];

    const t1 = dsl.directory(
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

  it.skip("can use filelist", async () => {
    dsl.directory(["a", "b", "c"]);

    expect((await rake.tm.get("a")).constructor).toEqual(FileCreationTask);

    await dsl.verbose(false, async () => (await rake.tm.get("a")).invoke());

    expect(await File.isDirectoryAsync("a")).toBeTruthy();
  });
});
