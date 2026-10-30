import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, block } from "@blazetrails/ruby-compat";
import type { Task } from "./task.js";
import type { TaskArguments } from "./task-arguments.js";
import { dsl, useRakeTestCase } from "./test-helpers/file-creation.js";

const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));

describe("TestRakeMultiTask", () => {
  const rake = useRakeTestCase();
  let runs: unknown[];

  const addRun = (obj: unknown) => void runs.push(obj);
  const threeRuns = (label: string, seconds: number) =>
    block(async () => {
      for (let i = 0; i < 3; i++) {
        addRun(`${label}${i}`);
        await sleep(seconds);
      }
    });

  beforeEach(() => {
    rake.tm.clear();
    runs = [];
  });

  it("running multitasks", async () => {
    dsl.task("a", threeRuns("A", 0.01));
    dsl.task("b", threeRuns("B", 0.01));
    dsl.multitask({ both: ["a", "b"] });
    await (await rake.tm.get("both")).invoke();
    expect(runs.length).toBe(6);
    expect(runs.indexOf("A0")).toBeLessThan(runs.indexOf("A1"));
    expect(runs.indexOf("A1")).toBeLessThan(runs.indexOf("A2"));
    expect(runs.indexOf("B0")).toBeLessThan(runs.indexOf("B1"));
    expect(runs.indexOf("B1")).toBeLessThan(runs.indexOf("B2"));
  });

  it("all multitasks wait on slow prerequisites", async () => {
    dsl.task("slow", threeRuns("S", 0.05));
    dsl.task({ a: ["slow"] }, threeRuns("A", 0.01));
    dsl.task({ b: ["slow"] }, threeRuns("B", 0.01));
    dsl.multitask({ both: ["a", "b"] });
    await (await rake.tm.get("both")).invoke();
    expect(runs.length).toBe(9);
    expect(runs.indexOf("S0")).toBeLessThan(runs.indexOf("S1"));
    expect(runs.indexOf("S1")).toBeLessThan(runs.indexOf("S2"));
    expect(runs.indexOf("S2")).toBeLessThan(runs.indexOf("A0"));
    expect(runs.indexOf("S2")).toBeLessThan(runs.indexOf("B0"));
    expect(runs.indexOf("A0")).toBeLessThan(runs.indexOf("A1"));
    expect(runs.indexOf("A1")).toBeLessThan(runs.indexOf("A2"));
    expect(runs.indexOf("B0")).toBeLessThan(runs.indexOf("B1"));
    expect(runs.indexOf("B1")).toBeLessThan(runs.indexOf("B2"));
  });

  it("multitasks with parameters", async () => {
    dsl.task(
      "a",
      ["arg"],
      block((t: Task, args: TaskArguments) => addRun(args.get("arg"))),
    );
    dsl.multitask(
      "b",
      new Map([[["arg"], ["a"]]]),
      block((t: Task, args: TaskArguments) => addRun(`${args.get("arg")}mt`)),
    );
    await (await rake.tm.get("b")).invoke("b");
    expect(runs[0]).toBe("b");
    expect(runs[1]).toBe("bmt");
  });

  it("cross thread prerequisite failures", async () => {
    let failed = false;

    dsl.multitask(
      "fail_once",
      block(() => {
        const failNow = !failed;
        failed = true;
        if (failNow) throw new RuntimeError("failing once");
      }),
    );

    dsl.task({ a: "fail_once" });
    dsl.task({ b: "fail_once" });

    await expect((await rake.tm.get("a")).invoke()).rejects.toThrow(RuntimeError);

    await expect((await rake.tm.get("b")).invoke()).rejects.toThrow(RuntimeError);
  });

  it("task not executed if dependant task failed concurrently", async () => {
    dsl.multitask({ default: ["one", "two"] });

    dsl.task(
      "one",
      block(() => {
        throw new RuntimeError();
      }),
    );

    let taskTwoWasExecuted = false;
    dsl.task(
      { two: "one" },
      block(() => {
        taskTwoWasExecuted = true;
      }),
    );

    try {
      await (await rake.tm.get("default")).invoke();
    } catch (e) {
      if (!(e instanceof RuntimeError)) throw e;
    } finally {
      await sleep(0.5);
      expect(taskTwoWasExecuted).toBe(false);
    }
  });
});
