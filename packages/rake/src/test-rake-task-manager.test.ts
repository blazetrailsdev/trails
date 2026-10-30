import { beforeEach, describe, expect, it } from "vitest";
import { FileUtils, RuntimeError, block, rbEqq } from "@blazetrails/ruby-compat";
import { FileTask } from "./file-task.js";
import { NameSpace } from "./name-space.js";
import { Rake } from "./rake-module.js";
import { Scope } from "./scope.js";
import { Task } from "./task.js";
import { TestTaskManager } from "./test-helpers/task-manager.js";

const make = (...args: string[]) => Scope.make(...args);

describe("TestRakeTaskManager", () => {
  let tm: TestTaskManager;

  beforeEach(() => {
    tm = new TestTaskManager();
  });

  it("create task manager", () => {
    expect(tm).not.toBeNull();
    expect(tm.tasks).toEqual([]);
  });

  it("define task", () => {
    const t = tm.defineTask(Task, "t");
    expect(t.name).toBe("t");
    expect(t.application).toBe(tm);
  });

  it("index", async () => {
    await expect(tm.get("bad")).rejects.toThrow(RuntimeError);
    const e = await tm.get("bad").catch((err: unknown) => err);
    expect((e as Error).message).toBe(
      "Don't know how to build task 'bad' (See the list of available tasks with `rake --tasks`)",
    );
  });

  it("undefined task with custom application", async () => {
    Rake.application!.name = "myrake";

    await expect(tm.get("bad")).rejects.toThrow(RuntimeError);
    const e = await tm.get("bad").catch((err: unknown) => err);
    expect((e as Error).message).toBe(
      "Don't know how to build task 'bad' (See the list of available tasks with `myrake --tasks`)",
    );
  });

  it("name lookup", async () => {
    const t = tm.defineTask(Task, "t");
    expect(await tm.get("t")).toBe(t);
  });

  it("namespace task create", () => {
    tm.inNamespace("x", () => {
      const t = tm.defineTask(Task, "t");
      expect(t.name).toBe("x:t");
    });
    expect(tm.tasks.map((t) => t.name)).toEqual(["x:t"]);
  });

  it("define namespaced task", () => {
    const t = tm.defineTask(Task, "n:a:m:e:t");
    expect(t.scope).toEqual(make("e", "m", "a", "n"));
    expect(t.name).toBe("n:a:m:e:t");
    expect(t.application).toBe(tm);
  });

  it("define namespace in namespace", () => {
    let t!: Task;
    tm.inNamespace("n", () => {
      t = tm.defineTask(Task, "a:m:e:t");
    });
    expect(t.scope).toEqual(make("e", "m", "a", "n"));
    expect(t.name).toBe("n:a:m:e:t");
    expect(t.application).toBe(tm);
  });

  it("anonymous namespace", () => {
    const anonNs = tm.inNamespace(null, () => {
      const t = tm.defineTask(Task, "t");
      expect(t.name).toBe("_anon_1:t");
    });
    const task = anonNs.get("t")!;
    expect(task.name).toBe("_anon_1:t");
  });

  it("create filetask in namespace", () => {
    tm.inNamespace("x", () => {
      const t = tm.defineTask(FileTask, "fn");
      expect(t.name).toBe("fn");
    });

    expect(tm.tasks.map((t) => t.name)).toEqual(["fn"]);
  });

  it("namespace yields same namespace as returned", () => {
    let yieldedNamespace: NameSpace | null = null;
    const returnedNamespace = tm.inNamespace("x", (ns) => {
      yieldedNamespace = ns;
    });
    expect(yieldedNamespace).toBe(returnedNamespace);
  });

  it("name lookup with implicit file tasks", async () => {
    await FileUtils.touch("README.rdoc");

    try {
      const t = await tm.get("README.rdoc");

      expect(t.name).toBe("README.rdoc");
      expect(rbEqq(FileTask, t)).toBeTruthy();
    } finally {
      await FileUtils.rmF("README.rdoc");
    }
  });

  it("name lookup with nonexistent task", async () => {
    await expect(tm.get("DOES NOT EXIST")).rejects.toThrow(RuntimeError);
  });

  it("name lookup in multiple scopes", async () => {
    let aa!: Task;
    let bb!: Task;
    let midZ!: Task;
    let botZ!: Task;
    let nsD!: Task;
    const xx = tm.defineTask(Task, "xx");
    const topZ = tm.defineTask(Task, "z");
    tm.inNamespace("a", () => {
      aa = tm.defineTask(Task, "aa");
      midZ = tm.defineTask(Task, "z");
      nsD = tm.defineTask(Task, "n:t");
      tm.inNamespace("b", () => {
        bb = tm.defineTask(Task, "bb");
        botZ = tm.defineTask(Task, "z");

        expect(tm.currentScope).toEqual(make("b", "a"));
      });

      expect(tm.currentScope).toEqual(make("a"));
    });

    const inner = make("b", "a") as Scope;
    expect(await tm.get("a:b:bb", inner)).toBe(bb);
    expect(await tm.get("a:aa", inner)).toBe(aa);
    expect(await tm.get("xx", inner)).toBe(xx);
    expect(await tm.get("z", inner)).toBe(botZ);
    expect(await tm.get("^z", inner)).toBe(midZ);
    expect(await tm.get("^^z", inner)).toBe(topZ);
    expect(await tm.get("^^^z", inner)).toBe(topZ);
    expect(await tm.get("rake:z", inner)).toBe(topZ);

    const middle = make("a") as Scope;
    expect(await tm.get("a:b:bb", middle)).toBe(bb);
    expect(await tm.get("a:aa", middle)).toBe(aa);
    expect(await tm.get("xx", middle)).toBe(xx);
    expect(await tm.get("b:bb", middle)).toBe(bb);
    expect(await tm.get("aa", middle)).toBe(aa);
    expect(await tm.get("z", middle)).toBe(midZ);
    expect(await tm.get("^z", middle)).toBe(topZ);
    expect(await tm.get("^^z", middle)).toBe(topZ);
    expect(await tm.get("rake:z", middle)).toBe(topZ);
    expect(await tm.get("n:t", middle)).toBe(nsD);
    expect(await tm.get("a:n:t", middle)).toBe(nsD);

    expect(tm.currentScope).toEqual(make());

    expect(xx.scope).toEqual(make());
    expect(aa.scope).toEqual(make("a"));
    expect(bb.scope).toEqual(make("b", "a"));
  });

  it("lookup with explicit scopes", async () => {
    let t2!: Task;
    let t3!: Task;
    let s!: Task;
    const t1 = tm.defineTask(Task, "t");
    tm.inNamespace("a", () => {
      t2 = tm.defineTask(Task, "t");
      s = tm.defineTask(Task, "s");
      tm.inNamespace("b", () => {
        t3 = tm.defineTask(Task, "t");
      });
    });
    expect(await tm.get("t", make() as Scope)).toBe(t1);
    expect(await tm.get("t", make("a") as Scope)).toBe(t2);
    expect(await tm.get("t", make("b", "a") as Scope)).toBe(t3);
    expect(await tm.get("s", make("b", "a") as Scope)).toBe(s);
    expect(await tm.get("s", make("a") as Scope)).toBe(s);
  });

  it("correctly scoped prerequisites are invoked", async () => {
    const values: string[] = [];
    tm.defineTask(
      Task,
      "z",
      block(() => void values.push("top z")),
    );
    tm.inNamespace("a", () => {
      tm.defineTask(
        Task,
        "z",
        block(() => void values.push("next z")),
      );
      tm.defineTask(Task, { x: "z" });
    });

    await (await tm.get("a:x")).invoke();
    expect(values).toEqual(["next z"]);
  });
});
