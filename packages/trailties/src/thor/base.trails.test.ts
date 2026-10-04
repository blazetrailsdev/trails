import { describe, expect, it, vi } from "vitest";
import {
  ArgumentError,
  extend,
  include,
  initializeIncludedModules,
  NoMethodError,
  rbFSend,
  rbObjRespondTo,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass, ClassMethods } from "./base.js";
import { Command } from "./command.js";
import { HashWithIndifferentAccess } from "./core-ext/hash-with-indifferent-access.js";
import {
  AtLeastOneRequiredArgumentError,
  Error as ThorError,
  ExclusiveArgumentError,
  InvocationError,
  UndefinedCommandError,
  UnknownArgumentError,
} from "./error.js";
import { Option } from "./parser/option.js";

type Instance = Base & Record<string, unknown>;
type Klass = BaseClass & { prototype: Record<string, unknown> } & (new (
    ...args: unknown[]
  ) => Instance);

function baseclass(): Klass {
  class Root {
    static baseclass(): unknown {
      return Root;
    }
    static createCommand(this: Klass, meth: string): boolean {
      this.commands()[meth] = new Command(meth, null, null, null, meth, {});
      return true;
    }
    constructor(...args: unknown[]) {
      initializeIncludedModules(this, ...args);
    }
  }
  include(Root, Base);
  extend(Root, ClassMethods);
  return Root as unknown as Klass;
}

function subclass(parent: Klass): Klass {
  return class extends parent {} as Klass;
}

describe("Thor::Base", () => {
  describe("#initialize", () => {
    it("assigns each declared argument through its writer and keeps the rest in args", () => {
      const klass = baseclass();
      klass.argument("name");
      klass.argument("count", { type: "numeric", optional: true });
      const instance = new klass(["app", "3", "extra"]);
      expect(instance.name).toBe("app");
      expect(instance.count).toBe(3);
      expect(instance.args).toEqual(["extra"]);
      expect(Object.hasOwn(klass.prototype, "name")).toBe(true);
    });

    it("parses an Array of local options and appends what is left to the arguments", () => {
      const klass = baseclass();
      klass.argument("name", { optional: true });
      klass.classOption("force", { type: "boolean" });
      const instance = new klass([], ["--force", "app", "other"]);
      expect(instance.options.get("force")).toBe(true);
      expect(instance.name).toBe("app");
      expect(instance.args).toEqual(["other"]);
    });

    it("takes a Hash of local options as pre-parsed defaults", () => {
      const klass = baseclass();
      klass.classOption("force", { type: "boolean" });
      const instance = new klass([], { force: true });
      expect(instance.options.get("force")).toBe(true);
      expect(instance.args).toEqual([]);
    });

    it("merges config's command options and deletes them from the config", () => {
      const klass = baseclass();
      const config = { commandOptions: { quiet: new Option("quiet", { type: "boolean" }) } };
      const instance = new klass([], ["--quiet"], config);
      expect(instance.options.get("quiet")).toBe(true);
      expect("commandOptions" in config).toBe(false);
      expect(klass.classOptions()).toEqual({});
    });

    it("merges the parsed options over config's class options", () => {
      const klass = baseclass();
      klass.classOption("force", { type: "boolean" });
      const classOptions = new HashWithIndifferentAccess({ force: false, pretend: true });
      const instance = new klass([], ["--force"], { classOptions });
      expect(instance.options.get("force")).toBe(true);
      expect(instance.options.get("pretend")).toBe(true);
    });

    it("raises on an unknown switch only after check_unknown_options!", () => {
      const klass = baseclass();
      expect(new klass([], ["--nope"]).args).toEqual(["--nope"]);
      klass.checkUnknownOptionsBang();
      expect(() => new klass([], ["--nope"])).toThrow(UnknownArgumentError);
      expect(subclass(klass)["checkUnknownOptions?"]({})).toBe(true);
    });

    it("leaves the parser's remaining arguments out under strict_args_position!", () => {
      const klass = baseclass();
      klass.argument("name", { optional: true });
      klass.strictArgsPositionBang();
      const instance = new klass([], ["app"]);
      expect(instance.name).toBeNull();
      expect(instance.args).toEqual([]);
    });

    it("hands the class's option relations to the parser", () => {
      const klass = baseclass();
      klass.classExclusive(function (this: BaseClass) {
        this.classOption("one");
        this.classOption("two");
      });
      klass.classOption("three");
      klass.classOption("four");
      klass.classAtLeastOne("three", "four");
      expect(klass.classExclusiveOptionNames()).toEqual([["one", "two"]]);
      expect(klass.classAtLeastOneOptionNames()).toEqual([["three", "four"]]);
      expect(() => new klass([], ["--one", "a", "--two", "b", "--three", "c"])).toThrow(
        ExclusiveArgumentError,
      );
      expect(() => new klass([], ["--one", "a"])).toThrow(AtLeastOneRequiredArgumentError);
      expect(new klass([], ["--one", "a", "--four", "d"]).options.get("four")).toBe("d");
    });
  });

  describe(".argument", () => {
    it("resolves required from :optional first, then :required, then a nil :default", () => {
      const klass = baseclass();
      klass.argument("a", { optional: false, required: false });
      klass.argument("b", { required: true, default: null });
      klass.argument("c");
      klass.argument("d", { optional: true, required: true });
      klass.argument("e", { required: false });
      klass.argument("f", { default: "x" });
      expect(klass.arguments().map((argument) => argument.required)).toEqual([
        true,
        true,
        true,
        false,
        false,
        false,
      ]);
    });

    it("raises for a required argument after a non-required one", () => {
      const klass = baseclass();
      klass.argument("first", { optional: true });
      expect(() => klass.argument("second")).toThrow(
        new ArgumentError(
          'You cannot have "second" as required argument after the non-required argument "first".',
        ),
      );
    });

    it("replaces an argument of the same name", () => {
      const klass = baseclass();
      klass.argument("name");
      klass.argument("name", { type: "numeric" });
      expect(klass.arguments().map((argument) => argument.type)).toEqual(["numeric"]);
    });

    it("raises a RuntimeError for a Thor reserved word", () => {
      const klass = baseclass();
      let error: unknown;
      try {
        klass.argument("destinationRoot");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as Error).constructor).toBe(RuntimeError);
      expect((error as Error).message).toBe(
        '"destinationRoot" is a Thor reserved word and cannot be defined as argument',
      );
      expect(() => klass.isThorReservedWord("destination_root", "command")).toThrow(RuntimeError);
      expect(klass.isThorReservedWord("name", "argument")).toBe(false);
    });
  });

  describe(".remove_argument", () => {
    it("undefines the accessor only with :undefine", () => {
      const klass = baseclass();
      klass.argument("name");
      klass.argument("other");
      klass.removeArgument("name");
      klass.removeArgument("other", { undefine: true });
      expect(klass.arguments()).toEqual([]);
      const proto = klass.prototype as Record<string, unknown>;
      expect(Object.getOwnPropertyDescriptor(proto, "name")?.get).toBeTypeOf("function");
      expect(Object.getOwnPropertyDescriptor(proto, "other")).toMatchObject({ value: undefined });
      const instance = new klass([]);
      expect(rbObjRespondTo(instance, "name")).toBe(true);
      expect(rbObjRespondTo(instance, "name=")).toBe(true);
      expect(rbObjRespondTo(instance, "other")).toBe(false);
      expect(rbObjRespondTo(instance, "other=")).toBe(false);
      expect(() => rbFSend(instance, "other=", 1)).toThrow(NoMethodError);
    });
  });

  describe(".class_option", () => {
    it("raises ArgumentError for a name that is not a Symbol or String", () => {
      const klass = baseclass();
      expect(() => klass.classOption(3 as unknown as string)).toThrow(
        new ArgumentError("Expected a Symbol or String, got 3"),
      );
    });

    it("builds the option with the class's check_default_type", () => {
      const klass = baseclass();
      expect(klass.checkDefaultType()).toBeNull();
      klass.allowIncompatibleDefaultTypeBang();
      expect(subclass(klass).checkDefaultType()).toBe(false);
      expect(() => klass.classOption("count", { type: "numeric", default: "x" })).not.toThrow();
      klass.checkDefaultTypeBang();
      expect(() => klass.classOption("size", { type: "numeric", default: "x" })).toThrow(
        ArgumentError,
      );
    });
  });

  describe(".class_options", () => {
    it("parses a hash of options into the class options", () => {
      const klass = baseclass();
      klass.classOptions({ foo: false, bar: ":required", baz: ":string" });
      expect(Object.values(klass.classOptions()).map((option) => option.type)).toEqual([
        "boolean",
        "string",
        "string",
      ]);
      klass.removeClassOption("foo", "bar");
      expect(Object.keys(klass.classOptions())).toEqual(["baz"]);
    });
  });

  describe(".from_superclass", () => {
    it("dups the parent's value, so a subclass never mutates its parent's", () => {
      const parent = baseclass();
      parent.classOption("force", { type: "boolean" });
      parent.argument("name");
      parent.classExclusive("a", "b");
      const child = subclass(parent);
      child.classOption("quiet", { type: "boolean" });
      child.argument("other");
      child.classExclusive("c", "d");
      child.removeClassOption("force");
      expect(Object.keys(parent.classOptions())).toEqual(["force"]);
      expect(Object.keys(child.classOptions())).toEqual(["quiet"]);
      expect(parent.arguments().map((argument) => argument.name)).toEqual(["name"]);
      expect(child.arguments().map((argument) => argument.name)).toEqual(["name", "other"]);
      expect(parent.classExclusiveOptionNames()).toEqual([["a", "b"]]);
      expect(child.classExclusiveOptionNames()).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });
  });

  describe(".register_options_relation_for", () => {
    it("pops a trailing HashWithIndifferentAccess as the options, and dispatches from_superclass", () => {
      const klass = baseclass();
      klass.classExclusive("a", "b", new HashWithIndifferentAccess({}));
      expect(klass.classExclusiveOptionNames()).toEqual([["a", "b"]]);
      const child = subclass(klass);
      child.fromSuperclass = () => [["z"]];
      expect(child.classExclusiveOptionNames()).toEqual([["z"]]);
    });
  });

  describe(".group", () => {
    it("defaults to standard and is inherited", () => {
      const parent = baseclass();
      expect(parent.group()).toBe("standard");
      expect(parent.group("rails")).toBe("rails");
      expect(subclass(parent).group()).toBe("rails");
    });
  });

  describe(".find_and_refresh_command", () => {
    it("returns the class's own command, and clones an inherited one into it", () => {
      const klass = baseclass();
      const command = new Command("build", null, null, null, null, { force: new Option("force") });
      klass.allCommands()["build"] = command;
      const refreshed = klass.findAndRefreshCommand("build");
      expect(refreshed).not.toBe(command);
      expect(klass.commands()["build"]).toBe(refreshed);
      expect(klass.findAndRefreshCommand("build")).toBe(refreshed);
      expect(klass.commandScopeMember("options", { for: "build" })).toBe(refreshed.options);
      expect(() => klass.findAndRefreshCommand("nope")).toThrow(
        new ArgumentError(
          'You supplied :for => "nope", but the command "nope" could not be found.',
        ),
      );
    });
  });

  describe(".commands / .all_commands", () => {
    it("keeps each class's own commands and merges the parent's on every call", () => {
      const parent = baseclass();
      const child = subclass(parent);
      child.prototype.build = () => {};
      child.methodAdded("build");
      expect(Object.keys(child.allCommands())).toEqual(["build"]);
      expect(parent.commands()).toEqual({});

      child.removeCommand("build");
      expect(child.allCommands()).toEqual({});
    });

    it("undefines the method under :undefine", () => {
      const klass = baseclass();
      klass.prototype.build = () => {};
      klass.methodAdded("build");
      klass.removeCommand("build", { undefine: true });
      expect(klass.prototype.build).toBeUndefined();
    });
  });

  describe(".method_added", () => {
    it("registers a defined method as a command and the class as a subclass", () => {
      const klass = baseclass();
      klass.methodAdded("missing");
      expect(Base.subclasses()).not.toContain(klass);

      klass.prototype.build = () => {};
      klass.methodAdded("build");
      expect(klass.commands()["build"]).toBeInstanceOf(Command);
      expect(Base.subclasses()).toContain(klass);
    });

    it("skips a method declared inside no_commands", () => {
      const klass = baseclass();
      klass.prototype.helper = () => {};
      klass.noCommands(() => klass.methodAdded("helper"));
      expect(klass.isNoCommands()).toBe(false);
      expect(klass.commands()).toEqual({});
      klass.attrAccessor("name");
      expect(klass.commands()).toEqual({});
    });

    it("raises for a Thor reserved word", () => {
      const klass = baseclass();
      klass.prototype.invoke = () => {};
      expect(() => klass.methodAdded("invoke")).toThrow(RuntimeError);
    });

    it("calls initialize_added for initialize", () => {
      const klass = baseclass();
      const initializeAdded = vi.spyOn(klass, "initializeAdded");
      klass.methodAdded("initialize");
      expect(initializeAdded).toHaveBeenCalledOnce();
      expect(klass.commands()).toEqual({});
    });
  });

  describe(".public_command", () => {
    it("re-exposes the parent's method on the class and registers it", () => {
      const parent = baseclass();
      parent.prototype.build = (name: string) => `built ${name}`;
      const child = subclass(parent);
      child.publicCommand("build");
      expect(Object.hasOwn(child.prototype, "build")).toBe(true);
      expect((new child() as Instance & { build(name: string): string }).build("app")).toBe(
        "built app",
      );
      expect(Object.keys(child.commands())).toEqual(["build"]);

      parent.prototype.build = (name: string) => `rebuilt ${name}`;
      expect((new child() as Instance & { build(name: string): string }).build("app")).toBe(
        "rebuilt app",
      );
      child.publicCommand("nope");
      expect(() => (new child() as Instance & { nope(): void }).nope()).toThrow(NoMethodError);
    });
  });

  describe(".namespace", () => {
    it("derives from the class name, and registers the class when set explicitly", () => {
      const klass = baseclass();
      Object.defineProperty(klass, "name", { value: "Scripts::MyScript" });
      expect(baseclass().namespace()).toBe("root");
      expect(subclass(baseclass()).namespace()).toMatch(/^#<class:0x[0-9a-f]+>$/);
      expect(klass.namespace()).toBe("scripts:my_script");
      expect(Base.subclasses()).not.toContain(klass);
      expect(klass.namespace("my_scripts")).toBe("my_scripts");
      expect(klass.namespace()).toBe("my_scripts");
      expect(Base.subclasses()).toContain(klass);
    });
  });

  describe(".handle_no_command_error / .handle_argument_error", () => {
    it("raises UndefinedCommandError over all_commands", () => {
      const klass = baseclass();
      klass.prototype.build = () => {};
      klass.methodAdded("build");
      expect(() => klass.handleNoCommandError("biuld")).toThrow(UndefinedCommandError);
      expect(() => klass.handleNoCommandError("biuld", true)).toThrow(/in "root" namespace\./);
    });

    it("raises InvocationError naming the basename, the arguments and the banner", () => {
      const klass = baseclass();
      klass.basename = () => "thor";
      klass.banner = () => "thor build NAME";
      const command = new Command("build", null, null, null, "build NAME", {});
      expect(() => klass.handleArgumentError(command, null, [], 1)).toThrow(
        new InvocationError(
          'ERROR: "thor build" was called with no arguments\nUsage: "thor build NAME"',
        ),
      );
      expect(() => klass.handleArgumentError(command, null, ["a", "b"], 1)).toThrow(
        /was called with arguments \["a", "b"\]/,
      );
    });
  });

  describe(".class_options_help", () => {
    it("prints ungrouped options first, then each group, padded to the widest alias", () => {
      const klass = baseclass();
      klass.classOption("force", { type: "boolean", aliases: "-f", desc: "Overwrite" });
      klass.classOption("skip", { type: "boolean", hide: true });
      klass.classOption("orm", { type: "string", group: "runtime", default: "ar" });
      const said: unknown[] = [];
      const tables: unknown[] = [];
      const shell = {
        say: (m: unknown) => said.push(m),
        printTable: (t: unknown) => tables.push(t),
      };
      klass.classOptionsHelp(shell as never);
      expect(said).toEqual(["Options:", "", "Runtime options:", ""]);
      expect(tables).toEqual([
        [["-f, [--force]", "# Overwrite"]],
        [
          ["[--orm=ORM]", ""],
          ["", "# Default: ar"],
        ],
      ]);
    });
  });

  describe(".start", () => {
    it("prints a Thor::Error through the shell, and re-raises it under :debug", async () => {
      const klass = baseclass();
      klass.dispatch = () => {
        throw new ThorError("boom");
      };
      const givenArgs = ["build"];
      const error = vi.fn();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(klass.start(givenArgs, { shell: { error } as never })).resolves.toBeNull();
      expect(error).toHaveBeenCalledWith("boom");
      expect(givenArgs).toEqual(["build"]);
      await expect(klass.start(givenArgs, { debug: true })).rejects.toThrow(ThorError);
      vi.restoreAllMocks();
    });

    it("raises NotImplementedError from the dispatch signature", async () => {
      await expect(baseclass().start([])).rejects.toThrow("NotImplementedError");
    });
  });
});
