import { describe, expect, it } from "vitest";
import { ArgumentError, toS } from "@blazetrails/ruby-compat";
import type { BaseConfig } from "./base.js";
import { Command } from "./command.js";
import { Group, type GroupClass } from "./group.js";
import { Thor } from "./thor.js";

type Instance = {
  shell: { padding: number };
  options: Record<string, unknown>;
  log: string[];
  invokeAll(): Promise<unknown[]>;
};

class Shell {
  padding = 0;
  base: unknown = null;
  out: string[] = [];
  say(message: unknown = "") {
    this.out.push(String(message));
  }
  sayStatus(status: unknown, message: unknown, logStatus: unknown = true) {
    if (logStatus === false) return;
    this.out.push(`${String(status)} ${toS(message)} ${String(logStatus)} @${this.padding}`);
  }
  printTable(rows: string[][]) {
    rows.forEach((row) => this.out.push(row.join(" ")));
  }
}

const log: string[] = [];

class Invoked extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.namespace("invoked");
    klass.classOption("loud", { type: "boolean" });
    klass.classOption("orm", { type: "string" });
    klass.methodAdded("perform");
  }
  perform() {
    log.push("invoked");
  }
}

class Counter extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.namespace("counter");
    klass.desc("counts\n  things");
    klass.classOption("test_framework", { type: "string", default: "invoked" });
    klass.classOption("defined", { type: "boolean", default: true });
    klass.methodAdded("one");
    klass.invokeFromOption("test_framework");
    klass.methodAdded("two");
    klass.noCommands(() => klass.methodAdded("helper"));
  }
  one() {
    log.push("one");
  }
  two() {
    log.push("two");
  }
  helper() {}
}

const counter = Counter as unknown as GroupClass;

const start = async (klass: unknown, args: string[], config: BaseConfig = {}) => {
  const shell = new Shell();
  log.length = 0;
  await (klass as GroupClass).start(args, { shell: shell as never, ...config });
  return shell;
};

describe("Thor::Group", () => {
  it("is seated on Thor and uses itself as the baseclass", () => {
    expect(Thor.Group).toBe(Group);
    expect((counter as unknown as { baseclass(): unknown }).baseclass()).toBe(Group);
    expect(counter.printableTasks).toBe(counter.printableCommands);
  });

  it("desc reads the description, falling back to the superclass", () => {
    class Child extends Counter {}
    expect(counter.desc()).toBe("counts\n  things");
    expect((Child as unknown as GroupClass).desc()).toBe("counts\n  things");
    expect((Invoked as unknown as GroupClass).desc()).toBeNull();
  });

  it("registers every public method as a command, in declaration order", () => {
    expect(Object.keys(counter.allCommands())).toEqual([
      "one",
      "_invokeFromOption_test_framework",
      "two",
    ]);
    expect(counter.commands().one).toBeInstanceOf(Command);
    expect(counter.commands().one.usage).toBeNull();
    expect(counter.isCommandExists("one")).toBe(true);
    expect(counter.isCommandExists("helper")).toBe(false);
  });

  it("invoke_from_option requires the class option and records the invocation", () => {
    expect(() => counter.invokeFromOption("missing")).toThrow(ArgumentError);
    expect(() => counter.invokeFromOption("missing")).toThrow(
      'You have to define the option "missing" before setting invoke_from_option.',
    );
    expect(counter.invocations().get("test_framework")).toBe(true);
  });

  it("dispatch invokes all commands, running the hook between its neighbours", async () => {
    const shell = await start(Counter, []);
    expect(log).toEqual(["one", "invoked", "two"]);
    expect(shell.out).toEqual(["invoke invoked :white @0"]);
    expect(shell.padding).toBe(0);
  });

  it("the generated command reports a class that is not found, and skips a falsy option", async () => {
    let shell = await start(Counter, ["--test-framework=unknown"]);
    expect(log).toEqual(["one", "two"]);
    expect(shell.out).toEqual(["error unknown [not found] :red @0"]);

    class Skipped extends Group {
      static {
        const klass = this as unknown as GroupClass;
        klass.classOption("orm", { type: "string" });
        klass.invokeFromOption("orm");
      }
    }
    shell = await start(Skipped, []);
    expect(shell.out).toEqual([]);
  });

  it("invoke defines a command for a namespace or class, with the verbose default", async () => {
    class Invoker extends Group {
      static {
        const klass = this as unknown as GroupClass;
        klass.invoke("invoked", "nowhere");
      }
    }
    const klass = Invoker as unknown as GroupClass;
    expect(Object.keys(klass.commands())).toEqual(["_invoke_invoked", "_invoke_nowhere"]);
    expect(klass.invocations().get("invoked")).toBe(false);
    const shell = await start(Invoker, []);
    expect(log).toEqual(["invoked"]);
    expect(shell.out).toEqual(["invoke invoked true @0", 'error "nowhere" [not found] :red @0']);
  });

  it("invoke and invoke_from_option keep names apart that differ only in case", () => {
    class Cased extends Group {
      static {
        const klass = this as unknown as GroupClass;
        klass.classOption("Foo", { type: "string" });
        klass.classOption("foo", { type: "string" });
        klass.invoke("Foo", "foo");
        klass.invokeFromOption("Foo", "foo");
      }
    }
    expect(Object.keys((Cased as unknown as GroupClass).commands())).toEqual([
      "_invoke_Foo",
      "_invoke_foo",
      "_invokeFromOption_Foo",
      "_invokeFromOption_foo",
    ]);
  });

  it("invoke names the command after a class, and yields nil for its command", async () => {
    const yielded: unknown[][] = [];
    class ByClass extends Group {
      static {
        (this as unknown as GroupClass).invoke(
          Invoked,
          (_instance: unknown, klass: unknown, command: unknown) => {
            yielded.push([klass, command]);
          },
        );
      }
    }
    const klass = ByClass as unknown as GroupClass;
    expect(Object.keys(klass.commands())).toEqual(["_invoke_Invoked"]);
    expect(klass.invocations().get(Invoked)).toBe(false);
    const shell = await start(ByClass, []);
    expect(shell.out).toEqual(["invoke Invoked true @0"]);
    expect(yielded).toEqual([[Invoked, null]]);
  });

  it("invoke takes a class that is not a Thor class as a name, and rejects it when invoked", async () => {
    class Plain {}
    class ByPlain extends Group {
      static {
        (this as unknown as GroupClass).invoke(Plain);
      }
    }
    const klass = ByPlain as unknown as GroupClass;
    expect(Object.keys(klass.commands())).toEqual(["_invoke_Plain"]);
    expect(klass.invocationBlocks().size).toBe(0);
    await expect(start(ByPlain, [])).rejects.toThrow("Expected Thor class, got Plain");
  });

  it("_invoke_for_class_method dispatches on the block arity, inside the padding", async () => {
    const calls: unknown[][] = [];
    const build = (block: (...args: never[]) => unknown) => {
      class Blocked extends Group {
        static {
          const klass = this as unknown as GroupClass;
          klass.classOption("orm", { type: "string", default: "invoked" });
          klass.invokeFromOption("orm", { verbose: false }, block);
        }
      }
      return Blocked;
    };
    const three = build((instance: Instance, klass: unknown, command: unknown) => {
      calls.push([instance.shell.padding, klass, command]);
    });
    const two = build((instance: Instance, klass: unknown) => {
      calls.push([instance.shell.padding, klass]);
    });
    const one = build(function (this: Instance, klass: unknown) {
      calls.push([this.shell.padding, klass]);
    });
    const shell = await start(three, []);
    await start(two, []);
    await start(one, []);
    expect(shell.out).toEqual([]);
    expect(calls).toEqual([
      [1, Invoked, null],
      [1, Invoked],
      [1, Invoked],
    ]);
    expect((three as unknown as GroupClass).invocationBlocks().has("orm")).toBe(true);
  });

  it("remove_invocation removes the command, the option and the invocation", () => {
    class Child extends Counter {}
    const klass = Child as unknown as GroupClass;
    klass.removeInvocation("test_framework");
    expect(klass.invocations().has("test_framework")).toBe(false);
    expect(klass.classOptions().test_framework).toBeUndefined();
    expect(counter.invocations().has("test_framework")).toBe(true);
    expect(counter.classOptions().test_framework).toBeDefined();
  });

  it("help prints the banner, the invoked classes' options and the description", async () => {
    const shell = await start(Counter, ["--help"]);
    expect(log).toEqual([]);
    expect(shell.out[0]).toBe("Usage:");
    expect(shell.out[1]).toMatch(/ counter\n$/);
    expect(shell.out).toContain("invoked options:");
    expect(shell.out.some((line) => line.includes("--loud"))).toBe(true);
    expect(shell.out.filter((line) => line.includes("--orm")).length).toBe(1);
    expect(shell.out.at(-1)).toBe("counts\n  things");
    expect(counter.printableCommands()[0][1]).toBe("# counts things");
  });

  it("handle_argument_error re-raises the same error class with the arity message", () => {
    const command = counter.commands().one;
    const error = new ArgumentError("wrong number of arguments");
    let raised: unknown;
    try {
      counter.handleArgumentError(command, error, [], 2);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(ArgumentError);
    expect(raised).not.toBe(error);
    expect((raised as Error).message).toMatch(/ one takes 2 arguments, but it should not\.$/);
  });
});
