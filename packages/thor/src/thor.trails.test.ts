import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, STDOUT, rbGvSet } from "@blazetrails/ruby-compat";
import { HELP_MAPPINGS } from "./base.js";
import { Command, HiddenCommand } from "./command.js";
import { AmbiguousCommandError, UndefinedCommandError } from "./error.js";
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

    const zooParent = () =>
      thor((k) => {
        k.desc("zoo", "zoo around");
        k.methodAdded("zoo");
      });

    it("desc for: amends an existing command, cloning an inherited one", () => {
      const parent = zooParent();
      const child = thor((k) => k.desc("zoo NAME", null, { for: "zoo" }), parent);
      expect(child.commands().zoo.usage).toBe("zoo NAME");
      expect(child.commands().zoo.description).toBe("zoo around");
      expect(parent.commands().zoo.usage).toBe("zoo");
    });

    it("long_desc for: sets the long description of an existing command", () => {
      const parent = zooParent();
      const child = thor((k) => k.longDesc("longer", { for: "zoo", wrap: false }), parent);
      expect(child.commands().zoo.longDescription).toBe("longer");
      expect(parent.commands().zoo.longDescription).toBeNull();
      expect(Object.hasOwn(child, "_longDesc")).toBe(false);
    });

    it("method_option for: adds the option to an existing command", () => {
      const parent = zooParent();
      const child = thor((k) => k.methodOption("cage", { for: "zoo", type: "string" }), parent);
      expect(Object.keys(child.commands().zoo.options)).toEqual(["cage"]);
      expect(parent.commands().zoo.options).toEqual({});
      expect(child.methodOptions()).toEqual({});
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

    it("maps each subkey of a Set key", () => {
      const klass = thor((k) => k.map(new Map([[new Set(["-a", "-b"]), "zoo"]])));
      expect(klass.map()["-a"]).toBe("zoo");
      expect(klass.map()["-b"]).toBe("zoo");
    });

    it("yields each pair of a Hash key", () => {
      const klass = thor((k) => k.map(new Map([[{ "-a": "-b" }, "zoo"]])));
      expect(klass.map()[String(["-a", "-b"])]).toBe("zoo");
    });
  });

  describe(".map with mappings and keywords", () => {
    it("merges an Array-keyed mapping into the keywords", () => {
      const klass = thor((k) => k.map(new Map([[["-a", "-b"], "zoo"]]), { "-v": "version" }));
      expect(klass.map()).toEqual({
        "-h": ":help",
        "-?": ":help",
        "--help": ":help",
        "-D": ":help",
        "-a": "zoo",
        "-b": "zoo",
        "-v": "version",
      });
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
      const group = class extends Thor.Group {} as unknown as ThorClass;
      const sub = thor(() => {});
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

  describe(".dispatch and the help screens", () => {
    const calls: unknown[][] = [];

    class Script extends Thor {
      static {
        (this as unknown as ThorClass).namespace("script");
        (this as unknown as ThorClass).desc("zoo", "zoo\n  around");
        (this as unknown as ThorClass).methodAdded("zoo");
        (this as unknown as ThorClass).desc("animal TYPE", "horse around");
        (this as unknown as ThorClass).longDesc("a long\nhorse");
        (this as unknown as ThorClass).methodExclusive("fast", "slow");
        (this as unknown as ThorClass).methodAdded("animal");
        (this as unknown as ThorClass).desc("animal_prison", "lock up", { hide: true });
        (this as unknown as ThorClass).methodAdded("animal_prison");
        (this as unknown as ThorClass).desc("exec", "run it");
        (this as unknown as ThorClass).methodAdded("exec");
        (this as unknown as ThorClass).stopOnUnknownOptionBang("exec");
        (this as unknown as ThorClass).map({ "-T": ":animal" });
      }
      zoo() {
        calls.push(["zoo"]);
        return "zoo";
      }
      async animal(type: string) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        calls.push(["animal", type]);
        return type;
      }
      animal_prison() {
        calls.push(["animal_prison"]);
      }
      exec(...args: unknown[]) {
        calls.push(["exec", ...args]);
      }
    }
    const script = Script as unknown as ThorClass;
    const b = script.basename() ?? "";

    const shell = () => {
      const said: unknown[] = [];
      const tables: unknown[] = [];
      const wrapped: unknown[] = [];
      return {
        said,
        tables,
        wrapped,
        say: (message: unknown = "") => said.push(message),
        printTable: (table: unknown) => tables.push(table),
        printWrapped: (...args: unknown[]) => wrapped.push(args),
      };
    };
    const start = (args: string[], config: Record<string, unknown> = {}) =>
      script.start(args, { shell: shell() as never, debug: true, ...config });

    afterEach(() => {
      calls.length = 0;
      rbGvSet("$thor_runner", false);
    });

    it("dispatches a command by name, by mapping and by unambiguous prefix", async () => {
      await expect(start(["zoo"])).resolves.toBe("zoo");
      await expect(start(["-T", "horse"])).resolves.toBe("horse");
      await expect(start(["z"])).resolves.toBe("zoo");
      await start(["animal-prison"]);
      expect(calls).toEqual([["zoo"], ["animal", "horse"], ["zoo"], ["animal_prison"]]);
    });

    it("prefers an exact match and raises on an ambiguous prefix", async () => {
      await expect(start(["animal", "cow"])).resolves.toBe("cow");
      await expect(start(["anim"])).rejects.toThrow(
        new AmbiguousCommandError("Ambiguous command anim matches [animal, animal_prison]"),
      );
      expect(script.findCommandPossibilities("--")).toEqual([":help"]);
      expect(script.findCommandPossibilities("h")).toEqual(["help"]);
    });

    it("hands an unknown command to a DynamicCommand, which raises", async () => {
      await expect(start(["nope"])).rejects.toThrow(UndefinedCommandError);
    });

    it("retrieves the command name unless the first argument is an unmapped switch", () => {
      let args = ["-x", "zoo"];
      expect(script.retrieveCommandName(args)).toBeNull();
      expect(args).toEqual(["-x", "zoo"]);
      args = ["-T", "horse"];
      expect(script.retrieveCommandName(args)).toBe("-T");
      expect(args).toEqual(["horse"]);
      expect(script.retrieveCommandName([])).toBeNull();
      expect(script.normalizeCommandName(null)).toBe("help");
    });

    it("yields the instance before invoking, and falls back to the default command for a subcommand", async () => {
      const yielded: unknown[] = [];
      const sub = class extends Script {} as unknown as ThorClass;
      sub.defaultCommand("animal");
      const config = { shell: shell() as never, invokedViaSubcommand: true };
      await expect(
        sub.dispatch(null, ["horse"], null, config, (instance) => yielded.push(instance)),
      ).resolves.toBe("horse");
      expect(yielded[0]).toBeInstanceOf(sub);
      expect(calls).toEqual([["animal", "horse"]]);
    });

    it("treats everything after a regular argument as arguments under stop_on_unknown_option!", async () => {
      await start(["exec", "echo", "--verbose", "foo"]);
      expect(calls).toEqual([["exec", "echo", "--verbose", "foo"]]);
    });

    it("prints the sorted command list, without hidden commands, when no command is given", async () => {
      const sh = shell();
      await start([], { shell: sh });
      await start(["-h"], { shell: sh });
      expect(sh.said).toEqual(["Commands:", "", "Commands:", ""]);
      expect(sh.tables[0]).toEqual([
        [`${b} animal TYPE`, "# horse around"],
        [`${b} exec`, "# run it"],
        [`${b} help [COMMAND]`, "# Describe available commands or one specific command"],
        [`${b} zoo`, "# zoo around"],
      ]);
      expect(script.printableCommands(false).map((item) => item[0])).toEqual([
        `${b} zoo`,
        `${b} animal TYPE`,
        `${b} exec`,
      ]);
    });

    it("prints the usage, exclusive options and description of one command", async () => {
      const sh = shell();
      await start(["help", "zoo"], { shell: sh });
      expect(sh.said).toEqual(["Usage:", `  ${b} zoo`, "", "zoo\n  around"]);
      sh.said.length = 0;
      await start(["help", "animal"], { shell: sh });
      expect(sh.said).toEqual([
        "Usage:",
        `  ${b} animal TYPE`,
        "",
        "Exclusive Options:",
        "",
        "Description:",
      ]);
      expect(sh.tables).toEqual([[["--fast", "--slow"]]]);
      expect(sh.wrapped).toEqual([["a long\nhorse", { indent: 2 }]]);
      await expect(start(["help", "nope"], { shell: sh })).rejects.toThrow(UndefinedCommandError);
    });

    it("shows the namespace in the banner under $thor_runner", () => {
      const zoo = script.allCommands().zoo;
      expect(script.banner(zoo)).toBe(`${b} zoo`);
      rbGvSet("$thor_runner", true);
      expect(script.banner(zoo)).toBe(`${b} script:zoo`);
    });
  });
});
