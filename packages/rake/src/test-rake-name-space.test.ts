import { describe, expect, it } from "vitest";
import { LinkedList } from "./linked-list.js";
import { NameSpace } from "./name-space.js";
import { Task } from "./task.js";
import { TestTaskManager as TM } from "./test-helpers/task-manager.js";

describe("TestRakeNameSpace", () => {
  it("namespace creation", () => {
    const mgr = new TM();
    const ns = new NameSpace(mgr as never, [] as never);
    expect(ns).not.toBeNull();
  });

  it("namespace lookup", async () => {
    const mgr = new TM();
    const ns = mgr.inNamespace("n", () => {
      mgr.defineTask(Task, "t");
    });

    expect(ns.get("t")).not.toBeNull();
    expect(ns.get("t")).toBe(await mgr.get("n:t"));
  });

  it("namespace reports tasks it owns", () => {
    const mgr = new TM();
    let nns: NameSpace | null = null;
    const ns = mgr.inNamespace("n", () => {
      mgr.defineTask(Task, "x");
      mgr.defineTask(Task, "y");
      nns = mgr.inNamespace("nn", () => {
        mgr.defineTask(Task, "z");
      });
    });
    mgr.inNamespace("m", () => {
      mgr.defineTask(Task, "x");
    });

    expect(ns.tasks.map((t) => t.name)).toEqual(["n:nn:z", "n:x", "n:y"]);
    expect(nns!.tasks.map((t) => t.name)).toEqual(["n:nn:z"]);
  });

  it("scope", () => {
    const mgr = new TM();

    let scope = new LinkedList("b");
    scope = scope.conj("a");

    const ns = new NameSpace(mgr as never, scope as never);

    expect(ns.scope).toEqual(scope);

    expect(ns.scope).not.toBe(scope);
  });
});
