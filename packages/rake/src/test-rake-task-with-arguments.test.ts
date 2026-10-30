import { beforeEach, describe, expect, it } from "vitest";
import { block } from "@blazetrails/ruby-compat";
import { Task } from "./task.js";
import type { TaskArguments } from "./task-arguments.js";
import { useApplicationTestCase, verifyKeywords, verifyNotes } from "./test-helpers/application.js";
import { dsl } from "./test-helpers/file-creation.js";

const { desc, multitask, task } = dsl;

describe("TestRakeTaskWithArguments", () => {
  useApplicationTestCase();

  beforeEach(() => {
    Task.clear();
  });

  it("no args given", () => {
    const t = task("t");
    expect(t.argNames).toEqual([]);
  });

  it("args given", () => {
    const t = task("t", "a", "b");
    expect(t.argNames).toEqual(["a", "b"]);
  });

  it("name and needs", () => {
    const t = task({ t: ["pre"] });
    expect(t.name).toBe("t");
    expect(t.argNames).toEqual([]);
    expect(t.prerequisites).toEqual(["pre"]);
  });

  it("name args and prereqs", () => {
    const t = task("t", new Map([[["x", "y"], ["pre"]]]));
    expect(t.name).toBe("t");
    expect(t.argNames).toEqual(["x", "y"]);
    expect(t.prerequisites).toEqual(["pre"]);
  });

  it("arg list is empty if no args given", async () => {
    const t = task(
      "t",
      block((tt: Task, args: TaskArguments) => expect(args.toHash()).toEqual({})),
    );
    await t.invoke(1, 2, 3);
  });

  it("tasks can access arguments as hash", async () => {
    const t = task(
      "t",
      "a",
      "b",
      "c",
      block((tt: Task, args: TaskArguments) => {
        expect(args.toHash()).toEqual({ a: 1, b: 2, c: 3 });
        expect(args.get("a")).toBe(1);
        expect(args.get("b")).toBe(2);
        expect(args.get("c")).toBe(3);
        expect(args.a).toBe(1);
        expect(args.b).toBe(2);
        expect(args.c).toBe(3);
      }),
    );
    await t.invoke(1, 2, 3);
  });

  it("actions of various arity are ok with args", async () => {
    const notes: string[] = [];
    const t = task(
      "t",
      "x",
      block(() => {
        notes.push("a");
      }),
    );
    t.enhance(null, () => {
      notes.push("b");
    });
    t.enhance(null, (task) => {
      notes.push("c");
      expect(task).toBeInstanceOf(Task);
    });
    t.enhance(null, (t2, args) => {
      notes.push("d");
      expect(t2).toBe(t);
      expect(args.toHash()).toEqual({ x: 1 });
    });
    await t.invoke(1);
    expect(notes).toEqual(["a", "b", "c", "d"]);
  });

  it("actions adore keywords", async () => {
    type Keywords = { dflt?: string; ovrd?: string; reqr?: string };
    const notes: string[] = [];
    const t = task("t", ["reqr", "ovrd", "dflt"]);
    const verify = (name: string, expecteds: unknown[], actuals: unknown[]) =>
      verifyKeywords(notes, name, expecteds, actuals);
    const enhance = (block: (t2: Task, keywords: Keywords) => void) =>
      t.enhance(null, (t2, _args, keywords) => block(t2, keywords as Keywords));

    enhance((_t, { dflt = "d" }) => verify("a", ["d"], [dflt]));
    enhance((_t, { ovrd = "-" }) => verify("b", ["o"], [ovrd]));
    enhance((_t, { reqr }) => verify("c", ["r"], [reqr]));

    enhance((t2, { dflt = "d" }) => verify("d", [t, "d"], [t2, dflt]));
    enhance((t2, { ovrd = "d" }) => verify("e", [t, "o"], [t2, ovrd]));
    enhance((t2, { reqr }) => verify("f", [t, "r"], [t2, reqr]));

    enhance((t2, { dflt = "d", reqr }) => verify("g", [t, "d", "r"], [t2, dflt, reqr]));
    enhance((t2, { ovrd = "-", reqr }) => verify("h", [t, "o", "r"], [t2, ovrd, reqr]));

    await t.invoke("r", "o");
    verifyNotes(notes);
  });

  it("arguments are passed to block", async () => {
    const t = task(
      "t",
      "a",
      "b",
      block((tt: Task, args: TaskArguments) => {
        expect(args.toHash()).toEqual({ a: 1, b: 2 });
      }),
    );
    await t.invoke(1, 2);
  });

  it("extra parameters are ignored", async () => {
    const t = task(
      "t",
      "a",
      block((tt: Task, args: TaskArguments) => {
        expect(args.a).toBe(1);
        expect(args.b).toBeNull();
      }),
    );
    await t.invoke(1, 2);
  });

  it("arguments are passed to all blocks", async () => {
    let counter = 0;
    const t = task("t", "a");
    task(
      "t",
      block((tt: Task, args: TaskArguments) => {
        expect(args.a).toBe(1);
        counter += 1;
      }),
    );
    task(
      "t",
      block((tt: Task, args: TaskArguments) => {
        expect(args.a).toBe(1);
        counter += 1;
      }),
    );
    await t.invoke(1);
    expect(counter).toBe(2);
  });

  it("block with no parameters is ok", async () => {
    const t = task(
      "t",
      block(() => {}),
    );
    await t.invoke(1, 2);
  });

  it("name with args", () => {
    desc("T");
    const t = task("tt", "a", "b");
    expect(t.name).toBe("tt");
    expect(t.comment).toBe("T");
    expect(t.argDescription()).toBe("[a,b]");
    expect(t.nameWithArgs()).toBe("tt[a,b]");
    expect(t.argNames).toEqual(["a", "b"]);
  });

  it("named args are passed to prereqs", async () => {
    let value: unknown = null;
    task(
      "pre",
      "rev",
      block((t: Task, args: TaskArguments) => {
        value = args.rev;
      }),
    );
    const t = task("t", new Map([[["name", "rev"], ["pre"]]]));
    await t.invoke("bill", "1.2");
    expect(value).toBe("1.2");
  });

  it("args not passed if no prereq names on task", async () => {
    task(
      "pre",
      block((t: Task, args: TaskArguments) => {
        expect(args.toHash()).toEqual({});
        expect(args.name).toBe("bill");
      }),
    );
    const t = task("t", new Map([[["name", "rev"], ["pre"]]]));
    await t.invoke("bill", "1.2");
  });

  it("args not passed if no prereq names on multitask", async () => {
    task(
      "pre",
      block((t: Task, args: TaskArguments) => {
        expect(args.toHash()).toEqual({});
        expect(args.name).toBe("bill");
      }),
    );
    const t = multitask("t", new Map([[["name", "rev"], ["pre"]]]));
    await t.invoke("bill", "1.2");
  });

  it("args not passed if no arg names", async () => {
    task(
      "pre",
      "rev",
      block((t: Task, args: TaskArguments) => {
        expect(args.toHash()).toEqual({});
      }),
    );
    const t = task({ t: ["pre"] });
    await t.invoke("bill", "1.2");
  });

  it("values at", async () => {
    const t = task(
      "pre",
      ["a", "b", "c"],
      block((task: Task, args: TaskArguments) => {
        const [a, b, c] = args.valuesAt("a", "b", "c");
        expect([a, b, c]).toEqual(["1", "2", "3"]);
      }),
    );

    await t.invoke("1", "2", "3");
  });
});
