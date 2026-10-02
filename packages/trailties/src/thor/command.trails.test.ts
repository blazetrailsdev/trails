import { describe, expect, it, vi } from "vitest";
import {
  ArgumentError,
  NoMethodError,
  rbFSend,
  rbModName,
  rbObjDup,
} from "@blazetrails/ruby-compat";
import {
  Command,
  DynamicCommand,
  DynamicTask,
  HiddenCommand,
  HiddenTask,
  Task,
} from "./command.js";

describe("Thor::Command", () => {
  function host(methods: Record<string, (...args: never[]) => unknown> = {}, debugging = false) {
    const klass = class Host {
      declare ["constructor"]: typeof Host;
      static get debugging() {
        return debugging;
      }
      static handleNoCommandError = vi.fn((name: string) => `no command ${name}`);
      static handleArgumentError = vi.fn(() => "argument error");
    };
    Object.assign(klass.prototype, methods);
    return { klass, instance: new klass() };
  }

  function command(name = "canHas"): Command {
    return new Command(name, null, null, null, name);
  }

  it("carries Thor's constant paths, the Task aliases and hidden?", () => {
    expect(rbModName(Command)).toBe("Thor::Command");
    expect(rbModName(HiddenCommand)).toBe("Thor::HiddenCommand");
    expect(rbModName(DynamicCommand)).toBe("Thor::DynamicCommand");
    expect([Task, HiddenTask, DynamicTask]).toEqual([Command, HiddenCommand, DynamicCommand]);
    expect(command().isHidden()).toBe(false);
    expect(new HiddenCommand("canHas", null, null, null, null).isHidden()).toBe(true);
  });

  it("defaults options_relation to an empty hash and dups it with the command", () => {
    expect(command().methodExclusiveOptionNames()).toEqual([]);
    expect(command().methodAtLeastOneOptionNames()).toEqual([]);
    const original = new Command("canHas", null, null, null, null, null, {
      exclusiveOptionNames: [["a", "b"]],
      atLeastOneOptionNames: [["c"]],
    });
    const copy = rbObjDup(original);
    copy.optionsRelation.exclusiveOptionNames = [];
    expect(original.methodExclusiveOptionNames()).toEqual([["a", "b"]]);
    expect(copy.methodAtLeastOneOptionNames()).toEqual([["c"]]);
  });

  it("prefixes usage with the ancestor name", () => {
    const sub = Object.assign(command(), { ancestorName: "parent" });
    const klass = { namespace: () => "foo", arguments: () => [] };
    expect(sub.formattedUsage(klass)).toBe("parent canHas");
  });

  describe("#run", () => {
    it("hands a wrong argument count to handle_argument_error unless debugging", async () => {
      const canHas = vi.fn((a: unknown, b: unknown) => [a, b]);
      const { klass, instance } = host({ canHas: (a: unknown, b: unknown) => canHas(a, b) });
      const cmd = command();
      expect(await cmd.run(instance, [1])).toBe("argument error");
      expect(canHas).not.toHaveBeenCalled();
      expect(klass.handleArgumentError).toHaveBeenCalledWith(
        cmd,
        new ArgumentError("wrong number of arguments (given 1, expected 2)"),
        [1],
        2,
      );
      const debugging = host({ canHas: async (a: number) => a + 1 }, true);
      await expect(cmd.run(debugging.instance)).rejects.toThrow(/\(given 0, expected 1\)$/);
      expect(await cmd.run(debugging.instance, [1])).toBe(2);
    });

    it("re-raises an ArgumentError raised inside the method, synchronously or not", async () => {
      const error = new ArgumentError("wrong number of arguments (given 3, expected 0)");
      const deeper = {
        raise: () => {
          throw new ArgumentError(error.message);
        },
      };
      const sync = host({ canHas: () => rbFSend(deeper, "raise") });
      await expect(command().run(sync.instance)).rejects.toThrow(error);
      const later = host({
        canHas: async () => {
          await null;
          return rbFSend(deeper, "raise");
        },
      });
      await expect(command().run(later.instance)).rejects.toThrow(error);
      expect(later.klass.handleArgumentError).not.toHaveBeenCalled();
    });

    it("hands a NoMethodError for its own name to handle_no_command_error", async () => {
      const { klass, instance } = host({
        toString: () => "the host",
        canHas: async () => {
          throw new NoMethodError("undefined method `canHas' for the host", "canHas");
        },
      });
      expect(await command().run(instance)).toBe("no command canHas");
      expect(klass.handleNoCommandError).toHaveBeenCalledWith("canHas");
    });

    it("re-raises any other NoMethodError and any other error", async () => {
      const noMethod = new NoMethodError("undefined method 'other' for nil", "other");
      for (const error of [noMethod, new TypeError("x is not a function")]) {
        const { instance } = host({ canHas: () => Promise.reject(error) });
        await expect(command().run(instance)).rejects.toBe(error);
      }
    });

    it("sends method_missing only when the instance's own class defines it", async () => {
      const own = host({ methodMissing: (name: string, ...args: unknown[]) => [name, ...args] });
      expect(await command().run(own.instance, [1])).toEqual(["canHas", 1]);

      const child = new (class extends own.klass {})();
      expect(await command().run(child, [1])).toBe("no command canHas");
    });
  });

  it("reaches method_missing through DynamicCommand for an undefined name", async () => {
    const { instance } = host({ methodMissing: (name: string) => `missing ${name}` });
    expect(await new DynamicCommand("canHas").run(instance)).toBe("missing canHas");
  });

  it("drops Thor's own frames and the caller's from a backtrace", () => {
    const thor = new URL(".", import.meta.url).pathname;
    const own = [
      `at async Command.run (file://${thor}command.js:27:3)`,
      `at ${thor}command.ts:1:1`,
    ];
    const sans = (command() as unknown as Record<string, (...frames: string[][]) => string[]>)
      .sansBacktrace;
    expect(sans([...own, "at App.canHas (/app.js:3:1)", "at main"], ["at main"])).toEqual([
      "at App.canHas (/app.js:3:1)",
    ]);
  });
});
