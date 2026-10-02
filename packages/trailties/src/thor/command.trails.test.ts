import { describe, expect, it, vi } from "vitest";
import { ArgumentError, NoMethodError, rbModName, rbObjDup } from "@blazetrails/ruby-compat";
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

  it("carries Thor's constant paths and the Task aliases", () => {
    expect(rbModName(Command)).toBe("Thor::Command");
    expect(rbModName(HiddenCommand)).toBe("Thor::HiddenCommand");
    expect(rbModName(DynamicCommand)).toBe("Thor::DynamicCommand");
    expect([Task, HiddenTask, DynamicTask]).toEqual([Command, HiddenCommand, DynamicCommand]);
  });

  it("is hidden only as a HiddenCommand", () => {
    expect(command().isHidden()).toBe(false);
    expect(new HiddenCommand("canHas", null, null, null, null).isHidden()).toBe(true);
  });

  it("defaults options and options_relation to empty hashes", () => {
    expect(command().options).toEqual({});
    expect(command().methodExclusiveOptionNames()).toEqual([]);
    expect(command().methodAtLeastOneOptionNames()).toEqual([]);
    const related = new Command("canHas", null, null, null, null, null, {
      exclusiveOptionNames: [["a", "b"]],
      atLeastOneOptionNames: [["c"]],
    });
    expect(related.methodExclusiveOptionNames()).toEqual([["a", "b"]]);
    expect(related.methodAtLeastOneOptionNames()).toEqual([["c"]]);
  });

  it("dups options_relation with the command", () => {
    const original = new Command("canHas", null, null, null, null, null, {
      exclusiveOptionNames: [["a", "b"]],
    });
    const copy = rbObjDup(original);
    copy.optionsRelation.exclusiveOptionNames = [];
    expect(original.methodExclusiveOptionNames()).toEqual([["a", "b"]]);
    expect(copy.name).toBe("canHas");
  });

  it("prefixes usage with the ancestor name", () => {
    const sub = command();
    sub.ancestorName = "parent";
    expect(sub.formattedUsage({ namespace: () => "foo", arguments: () => [] })).toBe(
      "parent canHas",
    );
  });

  describe("#run", () => {
    it("awaits the method it sends", async () => {
      const { instance } = host({ canHas: async (a: number) => a + 1 });
      expect(await command().run(instance, [1])).toBe(2);
    });

    it("hands a wrong argument count to handle_argument_error with the method's arity", async () => {
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
    });

    it("re-raises a wrong argument count while debugging", async () => {
      const { instance } = host({ canHas: (a: unknown) => a }, true);
      await expect(command().run(instance, [])).rejects.toThrow(
        new ArgumentError("wrong number of arguments (given 0, expected 1)"),
      );
    });

    it("re-raises an ArgumentError raised inside the method, synchronously or not", async () => {
      const error = new ArgumentError("wrong number of arguments (given 3, expected 0)");
      const sync = host({
        canHas: () => {
          throw error;
        },
      });
      await expect(command().run(sync.instance)).rejects.toBe(error);
      const later = host({ canHas: async () => Promise.reject(error) });
      await expect(command().run(later.instance)).rejects.toBe(error);
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
      const typeError = new TypeError("x is not a function");
      for (const error of [noMethod, typeError]) {
        const { instance } = host({
          canHas: () => {
            throw error;
          },
        });
        await expect(command().run(instance)).rejects.toBe(error);
      }
    });

    it("sends method_missing only when the instance's own class defines it", async () => {
      const own = host({ methodMissing: (name: string, ...args: unknown[]) => [name, ...args] });
      expect(await command().run(own.instance, [1])).toEqual(["canHas", 1]);

      const child = new (class extends own.klass {})();
      expect(await command().run(child, [1])).toBe("no command canHas");
    });

    it("answers handle_no_command_error for a name the instance does not define", async () => {
      const { instance } = host();
      expect(await command().run(instance)).toBe("no command canHas");
    });
  });

  describe("DynamicCommand#run", () => {
    it("reaches method_missing for a name the instance does not define", async () => {
      const { instance } = host({ methodMissing: (name: string) => `missing ${name}` });
      expect(await new DynamicCommand("canHas").run(instance)).toBe("missing canHas");
    });
  });

  describe("#sans_backtrace", () => {
    const sansBacktrace = (backtrace: string[], caller: string[]) =>
      (command() as unknown as { sansBacktrace(b: string[], c: string[]): string[] }).sansBacktrace(
        backtrace,
        caller,
      );

    it("drops Thor's own frames and the caller's", () => {
      const thor = Command.FILE_REGEXP.source.slice(1).replaceAll("\\", "");
      expect(
        sansBacktrace(
          [`${thor}/command.js:27:in 'run'`, "app.rb:3:in 'can_has'", "bin/thor:5:in '<main>'"],
          ["bin/thor:5:in '<main>'"],
        ),
      ).toEqual(["app.rb:3:in 'can_has'"]);
    });
  });
});
