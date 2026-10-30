import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, block } from "@blazetrails/ruby-compat";
import { Task } from "./task.js";
import { createFile, dsl, useRakeTestCase } from "./test-helpers/file-creation.js";

const EXISTINGFILE = "existing";

describe("TestRakeDefinitions", () => {
  const rake = useRakeTestCase();

  beforeEach(() => {
    rake.tm.clear();
  });

  async function checkTasks(n1: string, n2: string, n3: string): Promise<void> {
    const t = await rake.tm.get(n1);
    expect(t instanceof Task).toBeTruthy();
    expect(t.name).toEqual(n1);
    expect(t.prerequisites).toEqual([n2]);
    await t.invoke();
    const t2 = await rake.tm.get(n2);
    expect(t2.prerequisites).toEqual([]);
    const t3 = await rake.tm.get(n3);
    expect(t3.prerequisites).toEqual([n1, n2]);
  }

  it("task", async () => {
    let done = false;
    dsl.task(
      { one: ["two"] },
      block(() => {
        done = true;
      }),
    );
    dsl.task("two");
    dsl.task({ three: ["one", "two"] });
    await checkTasks("one", "two", "three");
    expect(done).toBeTruthy();
  });

  it("file task", async () => {
    let done = false;
    dsl.file(
      { one: "two" },
      block(() => {
        done = true;
      }),
    );
    dsl.file("two");
    dsl.file({ three: ["one", "two"] });
    await checkTasks("one", "two", "three");
    expect(done).toBeTruthy();
  });

  it("incremental definitions", async () => {
    const runs: string[] = [];
    dsl.task(
      { t1: ["t2"] },
      block(() => {
        runs.push("A");
        return 4321;
      }),
    );
    dsl.task(
      { t1: ["t3"] },
      block(() => {
        runs.push("B");
        return 1234;
      }),
    );
    dsl.task({ t1: ["t3"] });
    dsl.task("t2");
    dsl.task("t3");
    await (await rake.tm.get("t1")).invoke();
    expect(runs).toEqual(["A", "B"]);
    expect((await rake.tm.get("t1")).prerequisites).toEqual(["t2", "t3"]);
  });

  it("missing dependencies", async () => {
    dsl.task({ x: ["missing"] });
    await expect((await rake.tm.get("x")).invoke()).rejects.toThrow(RuntimeError);
  });

  it("falsey dependencies", async () => {
    dsl.task({ x: null });
    expect((await rake.tm.get("x")).prerequisites).toEqual([]);
  });

  it("implicit file dependencies", async () => {
    const runs: string[] = [];
    await createFile(EXISTINGFILE);
    dsl.task(
      { y: [EXISTINGFILE] },
      block((t: Task) => void runs.push(t.name)),
    );
    await (await rake.tm.get("y")).invoke();
    expect(runs).toEqual(["y"]);
  });
});
