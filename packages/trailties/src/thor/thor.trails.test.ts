import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, STDOUT } from "@blazetrails/ruby-compat";
import { HELP_MAPPINGS } from "./base.js";
import { Command, HiddenCommand } from "./command.js";
import { Thor, type ThorClass } from "./thor.js";

function thor(block: (klass: ThorClass) => void, parent: ThorClass = Thor as ThorClass): ThorClass {
  const klass = class extends (parent as typeof Thor) {
    zoo() {}
    animal() {}
    helper() {}
  } as unknown as ThorClass;
  block(klass);
  return klass;
}

describe("Thor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (Thor as { Group?: unknown }).Group;
  });

  describe(".desc and .create_command", () => {
    it("consumes the pending usage, description and method options and clears them", () => {
      const klass = thor((k) => {
        k.desc("zoo", "zoo around");
        k.longDesc("a long zoo", { wrap: false });
        k.methodOption("random", { type: "boolean" });
        k.methodAdded("zoo");
        k.desc("animal TYPE", "horse around");
        k.methodAdded("animal");
      });
      const zoo = klass.commands().zoo;
      expect(zoo).toBeInstanceOf(Command);
      expect(zoo.usage).toBe("zoo");
      expect(zoo.description).toBe("zoo around");
      expect(zoo.longDescription).toBe("a long zoo");
      expect(zoo.wrapLongDescription).toBeNull();
      expect(Object.keys(zoo.options)).toEqual(["random"]);
      expect(klass.commands().animal.options).toEqual({});
      expect(klass.commands().animal.longDescription).toBeNull();
      expect(klass._usage).toBeNull();
      expect(klass._methodOptions).toBeNull();
    });

    it("builds a HiddenCommand under hide: true", () => {
      const klass = thor((k) => {
        k.desc("zoo", "zoo around", { hide: true });
        k.methodAdded("zoo");
      });
      expect(klass.commands().zoo).toBeInstanceOf(HiddenCommand);
    });

    it("amends an existing command through for:, cloning an inherited one", () => {
      const parent = thor((k) => {
        k.desc("zoo", "zoo around");
        k.methodAdded("zoo");
      });
      const child = thor((k) => {
        k.desc("zoo NAME", null, { for: "zoo" });
        k.longDesc("longer", { for: "zoo" });
        k.methodOption("cage", { for: "zoo", type: "string" });
      }, parent);
      expect(child.commands().zoo.usage).toBe("zoo NAME");
      expect(child.commands().zoo.description).toBe("zoo around");
      expect(child.commands().zoo.longDescription).toBe("longer");
      expect(Object.keys(child.commands().zoo.options)).toEqual(["cage"]);
      expect(parent.commands().zoo.usage).toBe("zoo");
      expect(parent.commands().zoo.options).toEqual({});
    });

    it("warns and registers nothing for a method with no usage or description", () => {
      const write = vi.spyOn(STDOUT, "write").mockImplementation(() => 0 as never);
      const klass = thor((k) => k.methodAdded("zoo"));
      expect(klass.commands()).toEqual({});
      expect(write.mock.calls.flat().join("")).toMatch(
        /^\[WARNING\] Attempted to create command "zoo" without usage or description\. Call desc if you want this method to be available as command or declare it inside a no_commands\{\} block\. Invoked from ".*"\.\n$/,
      );
    });

    it("registers no command inside no_commands", () => {
      const klass = thor((k) => k.noCommands(() => k.methodAdded("helper")));
      expect(klass.commands()).toEqual({});
    });

    it("rejects a method option name that is not a String", () => {
      expect(() => thor((k) => k.methodOption(1 as never))).toThrow(
        new ArgumentError("Expected a Symbol or String, got 1"),
      );
    });
  });

  describe(".method_exclusive and .method_at_least_one", () => {
    it("records the relations on the next command", () => {
      const klass = thor((k) => {
        k.desc("zoo", "zoo around");
        k.exclusive(() => {
          k.option("one");
          k.option("two");
        });
        k.option("three");
        k.atLeastOne("two", "three");
        k.methodAdded("zoo");
      });
      const zoo = klass.commands().zoo;
      expect(zoo.methodExclusiveOptionNames()).toEqual([["one", "two"]]);
      expect(zoo.methodAtLeastOneOptionNames()).toEqual([["two", "three"]]);
      expect(klass.methodExclusiveOptionNames()).toEqual([]);
    });
  });

  describe(".map", () => {
    it("maps each subkey of an Array key and inherits a copy", () => {
      const parent = thor((k) => {
        k.map(new Map([[HELP_MAPPINGS, "help"]]));
        k.map({ "-T": "list" });
      });
      const child = thor((k) => k.map(null, { "-v": "version" }), parent);
      expect(parent.map()).toEqual({
        "-h": "help",
        "-?": "help",
        "--help": "help",
        "-D": "help",
        "-T": "list",
      });
      expect(child.map()["-T"]).toBe("list");
      expect(child.map()["-v"]).toBe("version");
      expect(parent.map()["-v"]).toBeUndefined();
    });
  });

  describe(".map with mappings and keywords", () => {
    it("merges an Array-keyed mapping into the keywords", () => {
      const klass = thor((k) => k.map(new Map([[["-a", "-b"], "zoo"]]), { "-v": "version" }));
      expect(klass.map()).toEqual({ "-a": "zoo", "-b": "zoo", "-v": "version" });
    });
  });

  describe(".command_exists?", () => {
    it("looks the normalized name up in the class's own commands", () => {
      const parent = thor((k) => {
        k.desc("animal TYPE", "horse around");
        k.methodAdded("animal");
      });
      const klass = thor((k) => {
        k.desc("zoo", "zoo around");
        k.methodAdded("zoo");
      }, parent);
      klass.normalizeCommandName = (meth) => String(meth).replaceAll("-", "_");
      expect(klass.isCommandExists("zoo")).toBe(true);
      expect(klass.isCommandExists("animal")).toBe(false);
    });
  });

  describe(".package_name and .default_command", () => {
    it("stores a package name and clears it for an empty one", () => {
      expect(thor((k) => k.packageName("Trails"))._packageName).toBe("Trails");
      expect(thor((k) => k.packageName(""))._packageName).toBeNull();
    });

    it("defaults to help, maps none to help, and inherits", () => {
      const parent = thor((k) => k.defaultCommand("zoo"));
      expect(thor(() => {}).defaultCommand()).toBe("help");
      expect(thor((k) => k.defaultTask(":none")).defaultCommand()).toBe("help");
      expect(thor(() => {}, parent).defaultCommand()).toBe("zoo");
    });
  });

  describe(".subcommand and .register", () => {
    it("registers the subcommand, its class and a help command on that class", () => {
      const sub = thor((k) => {
        k.desc("zoo", "zoo around");
        k.methodAdded("zoo");
      });
      const klass = thor((k) => {
        k.desc("sub SUBCOMMAND", "runs sub");
        k.subcommand("sub", sub);
      });
      expect(klass.subcommands()).toEqual(["sub"]);
      expect(klass.subtasks()).toBe(klass.subcommands());
      expect(klass.subcommandClasses()).toEqual({ sub });
      expect(klass.commands().sub.usage).toBe("sub SUBCOMMAND");
      expect(sub.commands().zoo.ancestorName).toBe("sub");
      expect(sub.commands().help.usage).toBe("help [COMMAND]");
      expect(sub.commands().help.description).toBe(
        "Describe subcommands or one specific subcommand",
      );
      expect(Object.hasOwn(sub.prototype, "help")).toBe(true);
    });

    it("forwards the subcommand to invoke, moving --help to the front", () => {
      const sub = thor(() => {});
      const klass = thor((k) => {
        k.desc("sub SUBCOMMAND", "runs sub");
        k.subcommand("sub", sub);
      });
      const invoke = vi.fn();
      const options = { verbose: true };
      (klass.prototype as unknown as Record<string, (...args: unknown[]) => unknown>).sub.call(
        { invoke, options },
        "zoo",
        "--help",
      );
      expect(invoke).toHaveBeenCalledWith(sub, "help", ["zoo"], [], {
        invokedViaSubcommand: true,
        classOptions: options,
      });
    });

    it("registers a Thor::Group as a command that invokes it, and a Thor as a subcommand", () => {
      class Group {}
      const group = class extends Group {} as unknown as ThorClass;
      const sub = thor(() => {});
      Thor.Group = Group;
      const klass = thor((k) => {
        k.register(group, "gen", "gen NAME", "generates");
        k.register(sub, "sub", "sub SUBCOMMAND", "runs sub");
      });
      expect(klass.commands().gen.usage).toBe("gen NAME");
      expect(klass.subcommands()).toEqual(["sub"]);
      const invoke = vi.fn();
      (klass.prototype as unknown as Record<string, (...args: unknown[]) => unknown>).gen.call(
        { invoke },
        "name",
      );
      expect(invoke).toHaveBeenCalledWith(group, ["name"]);
    });
  });

  describe(".check_unknown_options!, .stop_on_unknown_option! and .disable_required_check!", () => {
    const command = (name: string) => new Command(name, null, null, null, name, {});

    it("checks unknown options except for, or only for, the named commands", () => {
      const klass = thor((k) => {
        k.desc("sub SUBCOMMAND", "runs sub");
        k.subcommand(
          "sub",
          thor(() => {}),
        );
      });
      expect(klass.isCheckUnknownOptions({ currentCommand: command("zoo") })).toBe(false);
      klass.checkUnknownOptionsBang();
      expect(klass.isCheckUnknownOptions({})).toBe(true);
      expect(klass.isCheckUnknownOptions({ currentCommand: command("zoo") })).toBe(true);
      expect(klass.isCheckUnknownOptions({ currentCommand: command("sub") })).toBe(false);
      klass.checkUnknownOptionsBang({ except: "zoo", only: ["zoo"] });
      expect(klass.isCheckUnknownOptions({ currentCommand: command("zoo") })).toBe(false);
      expect(klass.isCheckUnknownOptions({ currentCommand: command("animal") })).toBe(true);
      klass.checkUnknownOptionsBang({ except: null });
      expect(klass.isCheckUnknownOptions({ currentCommand: command("zoo") })).toBe(true);
      expect(klass.isCheckUnknownOptions({ currentCommand: command("animal") })).toBe(false);
    });

    it("unions the command names", () => {
      const klass = thor((k) => {
        k.stopOnUnknownOptionBang("zoo");
        k.stopOnUnknownOptionBang("zoo", "animal");
        k.disableRequiredCheckBang("zoo");
      });
      expect(klass._stopOnUnknownOption).toEqual(["zoo", "animal"]);
      expect(klass.isStopOnUnknownOption(command("zoo"))).toBe(true);
      expect(klass.isStopOnUnknownOption(command("help"))).toBe(false);
      expect(klass.isStopOnUnknownOption(null)).toBe(false);
      expect(klass._disableRequiredCheck).toEqual(["help", "zoo"]);
      expect(klass.isDisableRequiredCheck(command("help"))).toBe(true);
      expect(klass.isDisableRequiredCheck(null)).toBe(false);
    });
  });

  describe(".initialize_added", () => {
    it("merges the pending method options into the class options", () => {
      const klass = thor((k) => {
        k.methodOption("force", { type: "boolean" });
        k.methodAdded("initialize");
      });
      expect(Object.keys(klass.classOptions())).toEqual(["force"]);
      expect(klass.methodOptions()).toEqual({});
    });
  });
});
