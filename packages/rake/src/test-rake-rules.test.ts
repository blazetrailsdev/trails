import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, block } from "@blazetrails/ruby-compat";
import { RuleRecursionOverflowError } from "./rule-recursion-overflow-error.js";
import { Task } from "./task.js";
import { TestTaskManager } from "./task-manager-test-helper.js";

const OBJFILE = "abc.o";

describe("TestRakeRules", () => {
  let tm: TestTaskManager;
  let runs: string[];

  beforeEach(() => {
    tm = new TestTaskManager();
    runs = [];
  });

  it("rule prereqs can be created by symbol", async () => {
    tm.defineTask(
      Task,
      "nonfile",
      block((t: Task) => void runs.push(t.name)),
    );
    tm.createRule(
      { ".o": "nonfile" },
      block((t: Task) => void runs.push(t.name)),
    );
    await (await tm.get(OBJFILE)).invoke();
    expect(runs).toEqual(["nonfile", OBJFILE]);
  });

  it("close matches on name do not trigger rule", async () => {
    tm.defineTask(Task, "x.c");
    tm.createRule({ ".o": [".c"] });
    await expect(tm.get("x.obj")).rejects.toThrow(RuntimeError);
    await expect(tm.get("x.xyo")).rejects.toThrow(RuntimeError);
  });

  it("rule with two sources builds both sources", async () => {
    tm.defineTask(Task, "x.aa");
    tm.defineTask(Task, "x.bb");
    tm.createRule(
      { ".a": ".aa" },
      block(() => void runs.push("A")),
    );
    tm.createRule(
      { ".b": ".bb" },
      block(() => void runs.push("B")),
    );
    tm.createRule(
      { ".c": [".a", ".b"] },
      block(() => void runs.push("C")),
    );
    await (await tm.get("x.c")).invoke();
    expect([...runs].sort()).toEqual(["A", "B", "C"]);
  });

  it("recursive rules that dont terminate will overflow", async () => {
    tm.defineTask(Task, "a.a");
    let prev = "a";
    for (const letter of "bcdefghijklmnopqrstuvwxyz") {
      tm.createRule({ [`.${letter}`]: `.${prev}` });
      prev = letter;
    }
    await expect(tm.get("a.z")).rejects.toThrow(RuleRecursionOverflowError);
    const ex = await tm.get("a.z").catch((e: unknown) => e);
    expect((ex as Error).message).toMatch(/a\.z => a.y/);
  });

  it("rules with bad dependents will fail", async () => {
    tm.createRule({ a: [1] });
    await expect(tm.get("a")).rejects.toThrow(RuntimeError);
  });

  it("single dependent with nil args", async () => {
    tm.defineTask(Task, "abc.c");
    tm.createRule(new Map([[null, ".cpp"]]));
    tm.createRule(
      new Map([[/\.o$/, ".c"]]),
      block((t: Task) => void runs.push(t.name)),
    );
    await (await tm.get(OBJFILE)).invoke();
    expect(runs).toEqual([OBJFILE]);
  });
});
