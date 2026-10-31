import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuntimeError, block, regexpEscape } from "@blazetrails/ruby-compat";
import { FileList } from "./file-list.js";
import { Rake } from "./rake-module.js";
import { Task } from "./task.js";
import { captureOutput, useApplicationTestCase } from "./test-helpers/application.js";
import { dsl } from "./test-helpers/file-creation.js";

const { desc, namespace, task } = dsl;
const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));
const noop = block(() => {});
const byName = (tasks: Task[]) => tasks.sort((a, b) => a.name.localeCompare(b.name));
const recordingName = (runlist: string[]) => block((t: Task) => void runlist.push(t.name));

describe("TestRakeTask", () => {
  useApplicationTestCase();

  beforeEach(() => {
    Task.clear();
  });

  afterEach(() => {
    Rake.application!.options.alwaysMultitask = false;
  });

  it("create", async () => {
    let arg: Task | null = null;
    const t = task(
      "name",
      block((task: Task) => {
        arg = task;
        return 1234;
      }),
    );
    expect(t.name).toBe("name");
    expect(t.prerequisites).toEqual([]);
    expect(await t.isNeeded()).toBeTruthy();
    await t.execute(0 as never);
    expect(arg).toBe(t);
    expect(t.source).toBeNull();
    expect(t.sources).toEqual([]);
    expect(t.locations.length).toBe(1);
    expect(t.locations[0]).toMatch(new RegExp(regexpEscape(import.meta.filename)));
  });

  it("inspect", () => {
    const t = task({ foo: ["bar", "baz"] });
    expect(t.inspect()).toBe("<Rake::Task foo => [bar, baz]>");
  });

  it("invoke", async () => {
    const runlist: string[] = [];
    const t1 = task({ t1: ["t2", "t3"] }, recordingName(runlist));
    task("t2", recordingName(runlist));
    task("t3", recordingName(runlist));
    expect(t1.prerequisites).toEqual(["t2", "t3"]);
    await t1.invoke();
    expect(runlist).toEqual(["t2", "t3", "t1"]);
  });

  it("invoke with circular dependencies", async () => {
    const runlist: string[] = [];
    const t1 = task({ t1: ["t2"] }, recordingName(runlist));
    const t2 = task({ t2: ["t1"] }, recordingName(runlist));
    expect(t1.prerequisites).toEqual(["t2"]);
    expect(t2.prerequisites).toEqual(["t1"]);
    const invocation = t1.invoke();
    await expect(invocation).rejects.toThrow(RuntimeError);
    const ex = (await invocation.catch((e: unknown) => e)) as RuntimeError;
    expect(ex.message).toMatch(/circular dependency/i);
    expect(ex.message).toMatch(/t1 => t2 => t1/);
  });

  it("dry run prevents actions", async () => {
    const runlist: string[] = [];
    const t1 = task("t1", recordingName(runlist));
    const [, err] = await captureOutput(async () => {
      Rake.application!.setDefaultOptions();
      Rake.application!.options.dryrun = true;

      await t1.invoke();
    });
    expect(err).toMatch(/execute .*t1/i);
    expect(err).toMatch(/dry run/i);
    expect(err).not.toMatch(/invoke/i);
    expect(runlist).toEqual([]);
  });

  it("tasks can be traced", async () => {
    const t1 = task("t1");
    const [, err] = await captureOutput(async () => {
      Rake.application!.setDefaultOptions();
      Rake.application!.options.trace = true;

      await t1.invoke();
    });
    expect(err).toMatch(/invoke t1/i);
    expect(err).toMatch(/execute t1/i);
  });

  it("no double invoke", async () => {
    const runlist: string[] = [];
    const t1 = task({ t1: ["t2", "t3"] }, recordingName(runlist));
    task({ t2: ["t3"] }, recordingName(runlist));
    task("t3", recordingName(runlist));
    await t1.invoke();
    expect(runlist).toEqual(["t3", "t2", "t1"]);
  });

  it("already invoked", async () => {
    const t1 = task("t1", noop);
    expect(t1.alreadyInvoked).toBe(false);
    await t1.invoke();
    expect(t1.alreadyInvoked).toBe(true);
  });

  it("can double invoke with reenable", async () => {
    const runlist: string[] = [];
    const t1 = task("t1", recordingName(runlist));
    await t1.invoke();
    t1.reenable();
    await t1.invoke();
    expect(runlist).toEqual(["t1", "t1"]);
  });

  it("can triple invoke after exception with reenable", async () => {
    let raiseException = true;
    let invoked = 0;

    const t1 = task(
      "t1",
      block(() => {
        invoked += 1;
        if (!raiseException) return;

        raiseException = false;
        throw new RuntimeError("Some error");
      }),
    );

    await expect(t1.invoke()).rejects.toThrow(RuntimeError);
    expect(invoked).toBe(1);

    t1.reenable();

    await t1.invoke();
    expect(invoked).toBe(2);

    await t1.invoke();
    expect(invoked).toBe(2);
  });

  it("clear", () => {
    desc("a task");
    const t = task("t", new Map([[["b"], "a"]]), noop);
    t.clear();
    expect(t.prerequisites.length === 0).toBeTruthy();
    expect(t.actions.length === 0).toBeTruthy();
    expect(t.comment).toBeNull();
    expect(t.argNames).toBeEmpty();
  });

  it("clear prerequisites", () => {
    const t = task({ t: ["a", "b"] });
    expect(t.prerequisites).toEqual(["a", "b"]);
    t.clearPrerequisites();
    expect(t.prerequisites).toEqual([]);
  });

  it("clear actions", () => {
    const t = task("t", noop);
    t.clearActions();
    expect(t.actions.length === 0).toBeTruthy();
  });

  it("clear comments", () => {
    desc("the original foo");
    task({ foo: ["x"] }, noop);

    task("foo").clearComments();

    desc("a slightly different foo");
    task("foo");

    expect(task("foo").comment).toBe("a slightly different foo");
    expect(task("foo").prerequisites).toEqual(["x"]);
    expect(task("foo").actions.length).toBe(1);
  });

  it("clear args", () => {
    task("foo", ["x"], noop);

    task("foo").clearArgs();

    task("foo");

    expect(task("foo").argNames).toBeEmpty();
  });

  it("find", async () => {
    task("tfind");
    expect((await Task.get("tfind")).name).toBe("tfind");
    const lookup = Task.get("leaves");
    await expect(lookup).rejects.toThrow(RuntimeError);
    const ex = (await lookup.catch((e: unknown) => e)) as RuntimeError;
    expect(ex.message).toBe(
      "Don't know how to build task 'leaves'" +
        " (See the list of available tasks with `rake --tasks`)",
    );
  });

  it("defined", () => {
    expect(!Task.isTaskDefined("a")).toBeTruthy();
    task("a");
    expect(Task.isTaskDefined("a")).toBeTruthy();
  });

  it("multi invocations", async () => {
    const runs: string[] = [];
    const p = recordingName(runs);
    task({ t1: ["t2", "t3"] }, p);
    task({ t2: ["t3"] }, p);
    task("t3", p);
    await (await Task.get("t1")).invoke();
    expect(runs.sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("task list", () => {
    task("t2");
    task({ t1: ["t2"] });
    expect(Task.tasks.map((t) => t.name)).toEqual(["t1", "t2"]);
  });

  it("task gives name on to s", async () => {
    task("abc");
    expect((await Task.get("abc")).toString()).toBe("abc");
  });

  it("symbols can be prerequisites", async () => {
    task({ a: "b" });
    expect((await Task.get("a")).prerequisites).toEqual(["b"]);
  });

  it("strings can be prerequisites", async () => {
    task({ a: "b" });
    expect((await Task.get("a")).prerequisites).toEqual(["b"]);
  });

  it("arrays can be prerequisites", async () => {
    task({ a: ["b", "c"] });
    expect((await Task.get("a")).prerequisites).toEqual(["b", "c"]);
  });

  it("filelists can be prerequisites", async () => {
    task({ a: new FileList().include("b", "c") });
    expect((await Task.get("a")).prerequisites).toEqual(["b", "c"]);
  });

  it("prerequisite tasks returns tasks not strings", async () => {
    const a = task({ a: ["b", "c"] });
    const b = task("b");
    const c = task("c");
    expect(await a.prerequisiteTasks()).toEqual([b, c]);
  });

  it("prerequisite tasks fails if prerequisites are undefined", async () => {
    const a = task({ a: ["b", "c"] });
    task("b");
    await expect(a.prerequisiteTasks()).rejects.toThrow(RuntimeError);
  });

  it("prerequisite tasks honors namespaces", async () => {
    task("b");
    let a!: Task;
    let b!: Task;
    namespace("X", () => {
      a = task({ a: ["b", "c"] });
      b = task("b");
    });
    const c = task("c");

    expect(await a.prerequisiteTasks()).toEqual([b, c]);
  });

  it("prerequisite tasks finds tasks with same name outside namespace", async () => {
    let b1!: Task;
    namespace("a", () => {
      b1 = task({ b: "b" });
    });
    const b2 = task("b");

    expect(await b1.prerequisiteTasks()).toEqual([b2]);
  });

  it("prerequisite tasks in nested namespaces", async () => {
    const m = task("m");
    let aCM!: Task;
    let aBM!: Task;
    let aM!: Task;
    namespace("a", () => {
      aM = task("m");

      namespace("b", () => {
        aBM = task({ m: "m" });
      });

      namespace("c", () => {
        aCM = task({ m: "a:m" });
      });
    });

    expect(await aBM.prerequisiteTasks()).toEqual([m]);
    expect(await aCM.prerequisiteTasks()).toEqual([aM]);
  });

  it("all prerequisite tasks includes all prerequisites", async () => {
    const a = task({ a: "b" });
    const b = task({ b: ["c", "d"] });
    const c = task({ c: "e" });
    const d = task("d");
    const e = task("e");

    expect(byName(await a.allPrerequisiteTasks())).toEqual([b, c, d, e]);
  });

  it("all prerequisite tasks does not include duplicates", async () => {
    const a = task({ a: ["b", "c"] });
    const b = task({ b: "c" });
    const c = task("c");

    expect(byName(await a.allPrerequisiteTasks())).toEqual([b, c]);
  });

  it("all prerequisite tasks includes self on cyclic dependencies", async () => {
    const a = task({ a: "b" });
    const b = task({ b: "a" });

    expect(byName(await a.allPrerequisiteTasks())).toEqual([a, b]);
  });

  it("timestamp returns now if all prereqs have no times", async () => {
    const a = task({ a: ["b", "c"] });
    task("b");
    task("c");

    expect(((await a.timestamp()) as Date).getTime()).toBeWithinDelta(Date.now(), 100);
  });

  it("timestamp returns latest prereq timestamp", async () => {
    const a = task({ a: ["b", "c"] });
    const b = task("b");
    const c = task("c");

    const now = Date.now();
    b.timestamp = async () => new Date(Date.now() + 10_000);
    c.timestamp = async () => new Date(Date.now() + 5_000);

    expect(((await a.timestamp()) as Date).getTime()).toBeWithinDelta(now, 100);
  });

  it("always multitask", async () => {
    const result: string[] = [];

    const tA = task(
      "a",
      block(async (t: Task) => {
        await sleep(0.2);
        result.push(t.name);
      }),
    );

    const tB = task("b", recordingName(result));

    const tC = task({ c: ["a", "b"] }, recordingName(result));

    await tC.invoke();

    expect(result).toEqual(["a", "b", "c"]);

    for (const t of [tA, tB, tC]) t.reenable();
    result.length = 0;

    Rake.application!.options.alwaysMultitask = true;
    await tC.invoke();

    expect(result).toEqual(["b", "a", "c"]);
  });

  it("investigation output", async () => {
    const t1 = task({ t1: ["t2", "t3"] }, noop);
    task("t2");
    task("t3");
    const out = await t1.investigation();
    expect(out).toMatch(/class:\s*Rake::Task/);
    expect(out).toMatch(/needed:\s*true/);
    expect(out).toMatch(/pre-requisites:\s*--t[23]/);
  });

  it("comment setting", () => {
    const t = task("t", "name", "rev");
    t.comment = "A Comment";
    expect(t.comment).toBe("A Comment");
  });

  it("comments with sentences period", () => {
    desc("Comment 1. Comment 2.");
    const t = task("t", "name", "rev");
    expect(t.comment).toBe("Comment 1");
  });

  it("comments with sentences exclamation mark", () => {
    desc("An exclamation mark! Comment.");
    const t = task("t", "name", "rev");
    expect(t.comment).toBe("An exclamation mark");
  });

  it("comments with many periods", () => {
    desc("This is a test...I think ... testing. Comment.");
    const t = task("t", "name", "rev");
    expect(t.comment).toBe("This is a test...I think ... testing");
  });

  it("comments with tabbed sentences", () => {
    desc("Comment 1.\tComment 2.");
    const t = task("t", "name", "rev");
    expect(t.comment).toBe("Comment 1");
  });

  it("comments with decimal points", () => {
    desc("Revision 1.2.3.");
    const t = task("t", "name", "rev");
    expect(t.comment).toBe("Revision 1.2.3");
  });

  it("comments do not set", () => {
    const t = task("t", "name", "rev");
    expect(t.comment).toBeNull();
  });

  it("comments is nil", () => {
    const t = task("t", "name", "rev");
    t.comment = null;
    expect(t.comment).toBeNull();
  });

  it("extended comments", () => {
    desc(`
      This is a comment.

      And this is the extended comment.
      name -- Name of task to execute.
      rev  -- Software revision to use.
    `);
    const t = task("t", "name", "rev");
    expect(t.argDescription()).toBe("[name,rev]");
    expect(t.comment).toBe("This is a comment");
    expect(t.fullComment).toMatch(/^\s*name -- Name/m);
    expect(t.fullComment).toMatch(/^\s*rev {2}-- Software/m);
    expect(t.fullComment).toMatch(/^\s*This is a comment\.$/m);
  });

  it("multiple comments", () => {
    desc("line one");
    const t = task("t");
    desc("line two");
    task("t");
    expect(t.comment).toBe("line one / line two");
  });

  it("duplicate comments", () => {
    desc("line one");
    const t = task("t");
    desc("line one");
    task("t");
    expect(t.comment).toBe("line one");
  });

  it("interspersed duplicate comments", () => {
    desc("line one");
    const t = task("t");
    desc("line two");
    task("t");
    desc("line one");
    task("t");
    expect(t.comment).toBe("line one / line two");
  });

  it("source is first prerequisite", () => {
    const t = task({ t: ["preqA", "preqB"] });
    expect(t.source).toBe("preqA");
  });

  it("suggests valid rake task names", async () => {
    task("test");
    const lookup = Task.get("testt");
    await expect(lookup).rejects.toThrow(RuntimeError);
    const error = (await lookup.catch((e: unknown) => e)) as RuntimeError;

    expect(error.message).toMatch(/Don't know how to build task 'testt'/);
    expect(error.message).toMatch(/Did you mean\? {2}test/);
  });

  it("prereqs", () => {
    const t = task({ a: ["b", "c", "d", "e"] });
    expect(t.prereqs).toEqual(["b", "c", "d", "e"]);
  });
});
