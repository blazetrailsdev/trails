import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashDelete, rbObjDup } from "@blazetrails/ruby-compat";
import { Command, DynamicCommand } from "./command.js";
import { Argument } from "./parser/argument.js";
import { Option } from "./parser/option.js";

describe("Thor::Command", () => {
  let memo: Command | undefined;
  beforeEach(() => {
    memo = undefined;
  });
  function command(
    options: Record<string, unknown> = {},
    usage: string | string[] = "can_has",
  ): Command {
    for (const [key, value] of Object.entries(options)) {
      options[key] = Option.parse(key, value);
    }

    return (memo ??= new Command(
      "can_has",
      "I can has cheezburger",
      "I can has cheezburger\nLots and lots of it",
      null,
      usage,
      options as Record<string, Option>,
    ));
  }

  function struct(namespace: string, args: Argument[]) {
    return { namespace: () => namespace, arguments: () => args };
  }

  describe("#formatted_usage", () => {
    it("includes namespace within usage", () => {
      const object = struct("foo", []);
      expect(command({ bar: ":required" }).formattedUsage(object)).toEqual("foo:can_has --bar=BAR");
    });

    it("includes subcommand name within subcommand usage", () => {
      const object = struct("main:foo", []);
      expect(command({ bar: ":required" }).formattedUsage(object, false, true)).toEqual(
        "foo can_has --bar=BAR",
      );
    });

    it("removes default from namespace", () => {
      const object = struct("default:foo", []);
      expect(command({ bar: ":required" }).formattedUsage(object)).toEqual(
        ":foo:can_has --bar=BAR",
      );
    });

    it("injects arguments into usage", () => {
      const options = { required: true, type: "string" };
      const object = struct("foo", [new Argument("bar", options)]);
      expect(command({ foo: ":required" }).formattedUsage(object)).toEqual(
        "foo:can_has BAR --foo=FOO",
      );
    });

    it("allows multiple usages", () => {
      const object = struct("foo", []);
      expect(
        command({ bar: ":required" }, ["can_has FOO", "can_has BAR"]).formattedUsage(object, false),
      ).toEqual("can_has FOO --bar=BAR\ncan_has BAR --bar=BAR");
    });
  });

  describe("#dynamic", () => {
    it("creates a dynamic command with the given name", () => {
      expect(new DynamicCommand("command").name).toEqual("command");
      expect(new DynamicCommand("command").description).toEqual("A dynamically-generated command");
      expect(new DynamicCommand("command").usage).toEqual("command");
      expect(new DynamicCommand("command").options).toEqual({});
    });

    it("does not invoke an existing method", async () => {
      class Double {
        declare ["constructor"]: typeof Double;
        static handleNoCommandError = vi.fn();
        static handleArgumentError = vi.fn();
      }
      const dub = new Double();
      await new DynamicCommand("toString").run(dub);
      expect(Double.handleNoCommandError).toHaveBeenCalledWith("toString");
    });
  });

  describe("#dup", () => {
    it("dup options hash", () => {
      const command = new Command("can_has", null, null, null, null, {
        foo: true,
        bar: ":required",
      } as unknown as Record<string, Option>);
      hashDelete(rbObjDup(command).options, "foo");
      expect(command.options.foo).toBeTruthy();
    });
  });

  describe("#run", () => {
    it("runs a command by calling a method in the given instance", async () => {
      class Double {
        declare ["constructor"]: typeof Double;
        static handleNoCommandError = vi.fn();
        static handleArgumentError = vi.fn();
        can_has = vi.fn((...args: unknown[]) => args);
      }
      const dub = new Double();
      expect(await command().run(dub, [1, 2, 3])).toEqual([1, 2, 3]);
      expect(dub.can_has).toHaveBeenCalled();
    });

    // PERMANENT-SKIP: Ruby method visibility is not carried at run time (CLAUDE.md, "Method visibility is compile-time only").
    it.skip("raises an error if the method to be invoked is private", async () => {
      const klass = class Klass {
        declare ["constructor"]: typeof Klass;
        static handleNoCommandError(name: string) {
          return name;
        }

        static handleArgumentError() {}

        private can_has() {
          return "fail";
        }
      };

      expect(await command().run(new klass())).toEqual("can_has");
    });
  });
});
