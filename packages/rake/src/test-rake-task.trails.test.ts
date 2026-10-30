import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Task, type TaskAction, type TaskApplication } from "./task.js";

function stubApplication(): TaskApplication & { tasks: Record<string, Task> } {
  const tasks: Record<string, Task> = {};
  return {
    tasks,
    options: {},
    currentScope: null as never,
    get: (taskName) => tasks[taskName] ?? null,
    trace: () => {},
    enhanceWithMatchingRule: () => null,
  };
}

describe("Rake::Task", () => {
  let app: ReturnType<typeof stubApplication>;
  function task(name: string, deps: string[] = [], block?: TaskAction): Task {
    const t = (app.tasks[name] ??= new Task(name, app));
    return t.enhance(deps, block);
  }

  beforeEach(() => {
    app = stubApplication();
  });

  it("invokes prerequisites first, and each task once", async () => {
    const runlist: string[] = [];
    const t1 = task("t1", ["t2", "t3"], (t) => void runlist.push(t.name));
    task("t2", ["t3"], (t) => void runlist.push(t.name));
    task("t3", [], (t) => void runlist.push(t.name));
    await t1.invoke();
    await t1.invoke();
    expect(runlist).toEqual(["t3", "t2", "t1"]);
  });

  it("awaits an async action before the next task runs", async () => {
    const runlist: string[] = [];
    const t1 = task("t1", ["t2"], (t) => void runlist.push(t.name));
    task("t2", [], async (t) => {
      await Promise.resolve();
      runlist.push(t.name);
    });
    await t1.invoke();
    expect(runlist).toEqual(["t2", "t1"]);
  });

  it("raises on a circular dependency and records the chain", async () => {
    const t1 = task("t1", ["t2"]);
    task("t2", ["t1"]);
    const ex = (await t1.invoke().catch((e: unknown) => e)) as RuntimeError & { chain: unknown };
    expect(ex).toBeInstanceOf(RuntimeError);
    expect(ex.message).toBe("Circular dependency detected: TOP => t1 => t2 => t1");
    expect(String(ex.chain)).toBe("TOP => t1 => t2");
  });

  it("re-raises a failed invocation until reenabled", async () => {
    let calls = 0;
    const t = task("t", [], () => {
      calls += 1;
      throw new RuntimeError("boom");
    });
    await expect(t.invoke()).rejects.toThrow("boom");
    await expect(t.invoke()).rejects.toThrow("boom");
    expect(calls).toBe(1);
    t.reenable();
    await expect(t.invoke()).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });

  it("passes named arguments to the action", async () => {
    let seen: unknown;
    const t = task("t", [], (_t, args) => {
      seen = args.toHash();
    });
    t.setArgNames(["a", "b"]);
    await t.invoke(1, 2);
    expect(seen).toEqual({ a: 1, b: 2 });
    expect(t.nameWithArgs()).toBe("t[a,b]");
  });

  it("joins comments and takes first sentences", () => {
    const t = task("t");
    expect(t.comment).toBeNull();
    t.addDescription("  First sentence. Second sentence.  ");
    t.comment = "Another one";
    t.comment = "Another one";
    expect(t.fullComment).toBe("First sentence. Second sentence.\nAnother one");
    expect(t.comment).toBe("First sentence / Another one");
  });

  it("clears prerequisites, actions, comments and args", () => {
    const t = task("t", ["a", "b", "a"], () => {});
    t.setArgNames(["x"]);
    t.comment = "c";
    expect(t.prerequisites).toEqual(["a", "b"]);
    expect(t.inspect()).toBe("<Rake::Task t => [a, b]>");
    t.clear();
    expect(t.prerequisites).toEqual([]);
    expect(t.actions).toEqual([]);
    expect(t.comment).toBeNull();
    expect(t.argNames).toEqual([]);
  });

  it("answers prerequisites as sources until sources are set", () => {
    const t = task("t", ["a", "b"]);
    expect(t.sources).toEqual(["a", "b"]);
    expect(t.source).toBe("a");
    t.sources = ["x"];
    expect(t.sources).toEqual(["x"]);
    expect(task("empty").source).toBeNull();
  });

  it("answers an empty comment for an empty one, as Ruby does", () => {
    const t = task("t");
    t.comment = "";
    expect(t.comment).toBe("");
    expect(t.fullComment).toBe("");
  });

  it("strips with Ruby's whitespace set", () => {
    const t = task("t");
    t.addDescription("\u00A0kept\0");
    expect(t.fullComment).toBe("\u00A0kept");
  });

  it("formats investigation times as Time#to_s", async () => {
    const t = task("t", ["a"]);
    task("a");
    expect(await t.investigation()).toMatch(
      /timestamp: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}\n[\s\S]*--a \(\d{4}-/,
    );
  });

  it("runs prerequisites concurrently and re-raises the last failure first", async () => {
    app.options.alwaysMultitask = true;
    const t = task("t", ["a", "b"]);
    task("a", [], () => {
      throw new RuntimeError("a");
    });
    task("b", [], () => {
      throw new RuntimeError("b");
    });
    await expect(t.invoke()).rejects.toThrow("b");
  });

  it("does not run actions on a dry run", async () => {
    app.options.dryrun = true;
    let ran = false;
    await task("t", [], () => void (ran = true)).invoke();
    expect(ran).toBe(false);
  });
});
