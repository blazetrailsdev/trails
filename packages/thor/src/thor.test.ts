import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, isEmpty, rbGvSet } from "@blazetrails/ruby-compat";
import type { Command } from "./command.js";
import type { Base as ThorBase } from "./base.js";
import { UndefinedCommandError } from "./error.js";
import { Base } from "./shell.js";
import type { Basic } from "./shell/basic.js";
import * as Terminal from "./shell/terminal.js";
import { capture } from "./test-helpers/helper.js";
import { Amazing } from "./test-helpers/fixtures/command.js";
import {
  MyChildScript,
  MyClassOptionScript,
  MyOptionScript,
  MyScript,
  PackageNameScript,
  Scripts,
} from "./test-helpers/fixtures/script.js";
import { Thor, type ThorClass } from "./thor.js";

vi.mock("./shell/terminal.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Terminal>()),
}));

const myScript = MyScript as unknown as ThorClass;
const myChildScript = MyChildScript as unknown as ThorClass;
const scriptsMyScript = Scripts.MyScript as unknown as ThorClass;
const myClassOptionScript = MyClassOptionScript as unknown as ThorClass;

type Opts = Map<string, unknown>;

function h(options: Opts): Record<string, unknown> {
  return Object.fromEntries(options);
}

function r(result: unknown): unknown[] {
  return (result as unknown[]).map((x) => (x instanceof Map ? h(x as Opts) : x));
}

function double(name: string): Command {
  return { name } as Command;
}

function assertEmpty(obj: string): void {
  if (!isEmpty(obj)) throw new globalThis.Error(`Expected ${JSON.stringify(obj)} to be empty.`);
}

async function assertOutputToStderr(block: () => unknown, expected: RegExp): Promise<void> {
  const actual = await capture(":stderr", block);
  if (actual.search(expected) === -1) throw new globalThis.Error(`no ${expected} in ${actual}`);
}

async function assertNoOutputToStderr(block: () => unknown): Promise<void> {
  const actual = await capture(":stderr", block);
  if (actual !== "") throw new globalThis.Error(`expected no stderr output, got ${actual}`);
}

describe("Thor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("#method_option", () => {
    it("sets options to the next method to be invoked", async () => {
      const [, options] = r(await myScript.start(["foo", "bar", "--force"]));
      expect(options).toEqual({ force: true });
    });

    describe(":lazy_default", () => {
      it("is absent when option is not specified", async () => {
        const [, options] = r(await myScript.start(["with_optional"]));
        expect(options).toEqual({});
      });

      it("sets a default that can be overridden for strings", async () => {
        let [, options] = r(await myScript.start(["with_optional", "--lazy"]));
        expect(options).toEqual({ lazy: "yes" });

        [, options] = r(await myScript.start(["with_optional", "--lazy", "yesyes!"]));
        expect(options).toEqual({ lazy: "yesyes!" });
      });

      it("sets a default that can be overridden for numerics", async () => {
        let [, options] = r(await myScript.start(["with_optional", "--lazy-numeric"]));
        expect(options).toEqual({ lazy_numeric: 42 });

        [, options] = r(await myScript.start(["with_optional", "--lazy-numeric", "20000"]));
        expect(options).toEqual({ lazy_numeric: 20_000 });
      });

      it("sets a default that can be overridden for arrays", async () => {
        let [, options] = r(await myScript.start(["with_optional", "--lazy-array"]));
        expect(options).toEqual({ lazy_array: ["eat", "at", "joes"] });

        [, options] = r(await myScript.start(["with_optional", "--lazy-array", "hello", "there"]));
        expect(options).toEqual({ lazy_array: ["hello", "there"] });
      });

      it("sets a default that can be overridden for hashes", async () => {
        let [, options] = r(await myScript.start(["with_optional", "--lazy-hash"]));
        expect(options).toEqual({ lazy_hash: { swedish: "meatballs" } });

        [, options] = r(await myScript.start(["with_optional", "--lazy-hash", "polish:sausage"]));
        expect(options).toEqual({ lazy_hash: { polish: "sausage" } });
      });
    });

    describe("when :for is supplied", () => {
      it("updates an already defined command", async () => {
        const [, options] = r(await myChildScript.start(["animal", "horse", "--other=fish"]));
        expect((options as Record<string, unknown>).other).toEqual("fish");
      });

      describe("and the target is on the parent class", () => {
        it("updates an already defined command", async () => {
          const args = ["example_default_command", "my_param", "--new-option=verified"];
          const options = (await scriptsMyScript.start(args)) as Opts;
          expect(h(options).new_option).toEqual("verified");
        });

        it("adds a command to the command list if the updated command is on the parent class", () => {
          expect(scriptsMyScript.commands()["example_default_command"]).toBeTruthy();
        });

        it("clones the parent command", () => {
          expect(scriptsMyScript.commands()["example_default_command"]).not.toBe(
            myChildScript.commands()["example_default_command"],
          );
        });
      });
    });
  });

  describe("#default_command", () => {
    it("sets a default command", () => {
      expect(myScript.defaultCommand()).toEqual("example_default_command");
    });

    it("invokes the default command if no command is specified", async () => {
      expect(await myScript.start([])).toEqual("default command");
    });

    it("invokes the default command if no command is specified even if switches are given", async () => {
      expect(h((await myScript.start(["--with", "option"])) as Opts)).toEqual({ with: "option" });
    });

    it("inherits the default command from parent", () => {
      expect(myChildScript.defaultCommand()).toEqual("example_default_command");
    });
  });

  describe("#stop_on_unknown_option!", () => {
    const myScript = class extends Thor {
      static {
        const klass = this as unknown as ThorClass;
        klass.classOption("verbose", { type: "boolean" });
        klass.classOption("mode", { type: "string" });

        klass.stopOnUnknownOptionBang("exec");

        klass.desc("exec", "Run a command");
        (this as unknown as ThorClass).methodAdded("exec");

        klass.desc("boring", "An ordinary command");
        (this as unknown as ThorClass).methodAdded("boring");
      }
      declare options: ThorBase["options"];
      exec(...args: unknown[]) {
        return [this.options, args];
      }
      boring(...args: unknown[]) {
        return [this.options, args];
      }
    } as unknown as ThorClass;

    it("passes remaining args to command when it encounters a non-option", async () => {
      expect(r(await myScript.start(["exec", "command", "--verbose"]))).toEqual([
        {},
        ["command", "--verbose"],
      ]);
    });

    it("passes remaining args to command when it encounters an unknown option", async () => {
      expect(r(await myScript.start(["exec", "--foo", "command", "--bar"]))).toEqual([
        {},
        ["--foo", "command", "--bar"],
      ]);
    });

    it("still accepts options that are given before non-options", async () => {
      expect(r(await myScript.start(["exec", "--verbose", "command", "--foo"]))).toEqual([
        { verbose: true },
        ["command", "--foo"],
      ]);
    });

    it("still accepts options that require a value", async () => {
      expect(r(await myScript.start(["exec", "--mode", "rashly", "command"]))).toEqual([
        { mode: "rashly" },
        ["command"],
      ]);
    });

    it("still passes everything after -- to command", async () => {
      expect(r(await myScript.start(["exec", "--", "--verbose"]))).toEqual([{}, ["--verbose"]]);
    });

    it("still passes everything after -- to command, complex", async () => {
      expect(
        r(
          await myScript.start([
            "exec",
            "command",
            "--mode",
            "z",
            "again",
            "--",
            "--verbose",
            "more",
          ]),
        ),
      ).toEqual([{}, ["command", "--mode", "z", "again", "--", "--verbose", "more"]]);
    });

    it("does not affect ordinary commands", async () => {
      expect(r(await myScript.start(["boring", "command", "--verbose"]))).toEqual([
        { verbose: true },
        ["command"],
      ]);
    });

    describe("when provided with multiple command names", () => {
      const klass = class extends Thor {
        static {
          (this as unknown as ThorClass).stopOnUnknownOptionBang("foo", "bar");
        }
      } as unknown as ThorClass;
      it("affects all specified commands", () => {
        expect(klass.isStopOnUnknownOption(double("foo"))).toBe(true);
        expect(klass.isStopOnUnknownOption(double("bar"))).toBe(true);
        expect(klass.isStopOnUnknownOption(double("baz"))).toBe(false);
      });
    });

    describe("when invoked several times", () => {
      const klass = class extends Thor {
        static {
          (this as unknown as ThorClass).stopOnUnknownOptionBang("foo");
          (this as unknown as ThorClass).stopOnUnknownOptionBang("bar");
        }
      } as unknown as ThorClass;
      it("affects all specified commands", () => {
        expect(klass.isStopOnUnknownOption(double("foo"))).toBe(true);
        expect(klass.isStopOnUnknownOption(double("bar"))).toBe(true);
        expect(klass.isStopOnUnknownOption(double("baz"))).toBe(false);
      });
    });

    it("doesn't break new", () => {
      expect(new (myScript as unknown as new () => Thor)()).toBeInstanceOf(Thor);
    });

    describe("along with check_unknown_options!", () => {
      const myScript2 = class extends Thor {
        static {
          const klass = this as unknown as ThorClass;
          klass.classOption("verbose", { type: "boolean" });
          klass.classOption("mode", { type: "string" });
          klass.checkUnknownOptionsBang();
          klass.stopOnUnknownOptionBang("exec");

          klass.desc("exec", "Run a command");
          (this as unknown as ThorClass).methodAdded("exec");
        }
        declare options: ThorBase["options"];
        exec(...args: unknown[]) {
          return [this.options, args];
        }
        static isExitOnFailure() {
          return false;
        }
      } as unknown as ThorClass;

      it("passes remaining args to command when it encounters a non-option", async () => {
        expect(r(await myScript2.start(["exec", "command", "--verbose"]))).toEqual([
          {},
          ["command", "--verbose"],
        ]);
      });

      it("does not accept if first non-option looks like an option, but only refuses that invalid option", async () => {
        expect(
          (
            await capture(":stderr", () => myScript2.start(["exec", "--foo", "command", "--bar"]))
          ).trim(),
        ).toEqual('Unknown switches "--foo"');
      });

      it("still accepts options that are given before non-options", async () => {
        expect(r(await myScript2.start(["exec", "--verbose", "command"]))).toEqual([
          { verbose: true },
          ["command"],
        ]);
      });

      it("still accepts when non-options are given after real options and argument", async () => {
        expect(r(await myScript2.start(["exec", "--verbose", "command", "--foo"]))).toEqual([
          { verbose: true },
          ["command", "--foo"],
        ]);
      });

      it("does not accept when non-option looks like an option and is after real options", async () => {
        expect(
          (await capture(":stderr", () => myScript2.start(["exec", "--verbose", "--foo"]))).trim(),
        ).toEqual('Unknown switches "--foo"');
      });

      it("still accepts options that require a value", async () => {
        expect(r(await myScript2.start(["exec", "--mode", "rashly", "command"]))).toEqual([
          { mode: "rashly" },
          ["command"],
        ]);
      });

      it("still passes everything after -- to command", async () => {
        expect(r(await myScript2.start(["exec", "--", "--verbose"]))).toEqual([{}, ["--verbose"]]);
      });

      it("still passes everything after -- to command, complex", async () => {
        expect(
          r(
            await myScript2.start([
              "exec",
              "command",
              "--mode",
              "z",
              "again",
              "--",
              "--verbose",
              "more",
            ]),
          ),
        ).toEqual([{}, ["command", "--mode", "z", "again", "--", "--verbose", "more"]]);
      });
    });
  });

  describe("#check_unknown_options!", () => {
    const myScript = class extends Thor {
      static {
        const klass = this as unknown as ThorClass;
        klass.classOption("verbose", { type: "boolean" });
        klass.classOption("mode", { type: "string" });
        klass.checkUnknownOptionsBang();

        klass.desc("checked", "a command with checked");
        (this as unknown as ThorClass).methodAdded("checked");
      }
      declare options: ThorBase["options"];
      checked(...args: unknown[]) {
        return [this.options, args];
      }
      static isExitOnFailure() {
        return false;
      }
    } as unknown as ThorClass;

    it("still accept options and arguments", async () => {
      expect(r(await myScript.start(["checked", "command", "--verbose"]))).toEqual([
        { verbose: true },
        ["command"],
      ]);
    });

    it("still accepts options that are given before arguments", async () => {
      expect(r(await myScript.start(["checked", "--verbose", "command"]))).toEqual([
        { verbose: true },
        ["command"],
      ]);
    });

    it("does not accept if non-option that looks like an option is before the arguments", async () => {
      expect(
        (
          await capture(":stderr", () => myScript.start(["checked", "--foo", "command", "--bar"]))
        ).trim(),
      ).toEqual('Unknown switches "--foo", "--bar"');
    });

    it("does not accept if non-option that looks like an option is after an argument", async () => {
      expect(
        (
          await capture(":stderr", () => myScript.start(["checked", "command", "--foo", "--bar"]))
        ).trim(),
      ).toEqual('Unknown switches "--foo", "--bar"');
    });

    it("does not accept when non-option that looks like an option is after real options", async () => {
      expect(
        (await capture(":stderr", () => myScript.start(["checked", "--verbose", "--foo"]))).trim(),
      ).toEqual('Unknown switches "--foo"');
    });

    it("does not accept when non-option that looks like an option is before real options", async () => {
      expect(
        (await capture(":stderr", () => myScript.start(["checked", "--foo", "--verbose"]))).trim(),
      ).toEqual('Unknown switches "--foo"');
    });

    it("still accepts options that require a value", async () => {
      expect(r(await myScript.start(["checked", "--mode", "rashly", "command"]))).toEqual([
        { mode: "rashly" },
        ["command"],
      ]);
    });

    it("still passes everything after -- to command", async () => {
      expect(r(await myScript.start(["checked", "--", "--verbose"]))).toEqual([{}, ["--verbose"]]);
    });

    it("still passes everything after -- to command, complex", async () => {
      expect(
        r(
          await myScript.start([
            "checked",
            "command",
            "--mode",
            "z",
            "again",
            "--",
            "--verbose",
            "more",
          ]),
        ),
      ).toEqual([{ mode: "z" }, ["command", "again", "--verbose", "more"]]);
    });
  });

  describe("#disable_required_check!", () => {
    const myScript = class extends Thor {
      static {
        const klass = this as unknown as ThorClass;
        klass.classOption("foo", { required: true });

        klass.disableRequiredCheckBang("boring");

        klass.desc("exec", "Run a command");
        (this as unknown as ThorClass).methodAdded("exec");

        klass.desc("boring", "An ordinary command");
        (this as unknown as ThorClass).methodAdded("boring");
      }
      declare options: ThorBase["options"];
      exec(...args: unknown[]) {
        return [this.options, args];
      }
      boring(...args: unknown[]) {
        return [this.options, args];
      }
      static isExitOnFailure() {
        return false;
      }
    } as unknown as ThorClass;

    it("does not check the required option in the given command", async () => {
      expect(r(await myScript.start(["boring", "command"]))).toEqual([{}, ["command"]]);
    });

    it("does check the required option of the remaining command", async () => {
      const content = await capture(":stderr", () => myScript.start(["exec", "command"]));
      expect(content).toEqual("No value provided for required options '--foo'\n");
    });

    it("does affects help by default", () => {
      expect(myScript.isDisableRequiredCheck(double("help"))).toBe(true);
    });

    describe("when provided with multiple command names", () => {
      const klass = class extends Thor {
        static {
          (this as unknown as ThorClass).disableRequiredCheckBang("foo", "bar");
        }
      } as unknown as ThorClass;

      it("affects all specified commands", () => {
        expect(klass.isDisableRequiredCheck(double("help"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("foo"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("bar"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("baz"))).toBe(false);
      });
    });

    describe("when invoked several times", () => {
      const klass = class extends Thor {
        static {
          (this as unknown as ThorClass).disableRequiredCheckBang("foo");
          (this as unknown as ThorClass).disableRequiredCheckBang("bar");
        }
      } as unknown as ThorClass;

      it("affects all specified commands", () => {
        expect(klass.isDisableRequiredCheck(double("help"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("foo"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("bar"))).toBe(true);
        expect(klass.isDisableRequiredCheck(double("baz"))).toBe(false);
      });
    });
  });

  describe("#command_exists?", () => {
    it("returns true for a command that is defined in the class", () => {
      expect(myScript.isCommandExists("zoo")).toBe(true);
      expect(myScript.isCommandExists("name-with-dashes")).toBe(true);
      expect(myScript.isCommandExists("animal_prison")).toBe(true);
    });

    it("returns false for a command that is not defined in the class", () => {
      expect(myScript.isCommandExists("animal_heaven")).toBe(false);
    });
  });

  describe("#map", () => {
    it("calls the alias of a method if one is provided", async () => {
      expect(await myScript.start(["-T", "fish"])).toEqual(["fish"]);
    });

    it("calls the alias of a method if several are provided via #map", async () => {
      expect(r(await myScript.start(["-f", "fish"]))).toEqual(["fish", {}]);
      expect(r(await myScript.start(["--foo", "fish"]))).toEqual(["fish", {}]);
    });

    it("inherits all mappings from parent", () => {
      expect(myChildScript.defaultCommand()).toEqual("example_default_command");
    });
  });

  describe("#package_name", () => {
    it("provides a proper description for a command when the package_name is assigned", async () => {
      const content = await capture(":stdout", () =>
        (PackageNameScript as unknown as ThorClass).start(["help"]),
      );
      expect(content).toMatch(/Baboon commands:/m);
    });

    it("provides a proper description for a command when the package_name is NOT assigned", async () => {
      const content = await capture(":stdout", () => myScript.start(["help"]));
      expect(content).toMatch(/Commands:/m);
    });
  });

  describe("#desc", () => {
    it("provides description for a command", async () => {
      const content = await capture(":stdout", () => myScript.start(["help"]));
      expect(content).toMatch(/thor my_script:zoo\s+# zoo around/m);
    });

    it("provides no namespace if $thor_runner is false", async () => {
      try {
        rbGvSet("$thor_runner", false);
        const content = await capture(":stdout", () => myScript.start(["help"]));
        expect(content).toMatch(/thor zoo\s+# zoo around/m);
      } finally {
        rbGvSet("$thor_runner", true);
      }
    });

    describe("when :for is supplied", () => {
      it("overwrites a previous defined command", async () => {
        expect(await capture(":stdout", () => myChildScript.start(["help"]))).toMatch(
          /animal KIND \s+# fish around/m,
        );
      });
    });

    describe("when :hide is supplied", () => {
      it("does not show the command in help", async () => {
        expect(await capture(":stdout", () => myScript.start(["help"]))).not.toMatch(
          /this is hidden/m,
        );
      });

      it("but the command is still invocable, does not show the command in help", async () => {
        expect(await myScript.start(["hidden", "yesyes"])).toEqual(["yesyes"]);
      });
    });
  });

  describe("#method_options", () => {
    it("sets default options if called before an initializer", () => {
      const options = myChildScript.classOptions();
      expect(options["force"].type).toEqual("boolean");
      expect(options["param"].type).toEqual("numeric");
    });

    it("overwrites default options if called on the method scope", async () => {
      const args = ["zoo", "--force", "--param", "feathers"];
      const options = h((await myChildScript.start(args)) as Opts);
      expect(options).toEqual({ force: true, param: "feathers" });
    });

    it("allows default options to be merged with method options", async () => {
      const args = ["animal", "bird", "--force", "--param", "1.0", "--other", "tweets"];
      const [arg, options] = r(await myChildScript.start(args));
      expect(arg).toEqual("bird");
      expect(options).toEqual({ force: true, param: 1.0, other: "tweets" });
    });
  });

  describe("#method_exclusive", () => {
    it("returns the exclusive option names for the class", () => {
      const cmd = (MyOptionScript as unknown as ThorClass).commands()["exclusive"];
      const exclusives = cmd.optionsRelation["exclusiveOptionNames"]!;
      expect(exclusives.length).toBe(2);
      expect(exclusives[0]).toEqual(["one", "two", "three"]);
      expect(exclusives.at(-1)).toEqual(["after1", "after2"]);
    });
  });

  describe("#method_at_least_one", () => {
    it("returns the at least one of option names for the class", () => {
      const cmd = (MyOptionScript as unknown as ThorClass).commands()["at_least_one"];
      const atLeastOnes = cmd.optionsRelation["atLeastOneOptionNames"]!;
      expect(atLeastOnes.length).toBe(2);
      expect(atLeastOnes[0]).toEqual(["one", "two", "three"]);
      expect(atLeastOnes.at(-1)).toEqual(["after1", "after2"]);
    });
  });

  describe("#start", () => {
    it("calls a no-param method when no params are passed", async () => {
      expect(await myScript.start(["zoo"])).toEqual(true);
    });

    it("calls a single-param method when a single param is passed", async () => {
      expect(await myScript.start(["animal", "fish"])).toEqual(["fish"]);
    });

    it("does not set options in attributes", async () => {
      const [name, options, args] = (await myScript.start(["with_optional", "--all"])) as [
        unknown,
        Map<string, unknown>,
        unknown[],
      ];
      expect([name, Object.fromEntries(options), args]).toEqual([null, { all: true }, []]);
    });

    it("raises an error if the wrong number of params are provided", async () => {
      const arityAsserter = async (args: string[], msg: string) => {
        const stderr = await capture(":stderr", () =>
          (Scripts.Arities as unknown as ThorClass).start(args),
        );
        expect(stderr.trim()).toEqual(msg);
      };
      await arityAsserter(
        ["zero_args", "one"],
        'ERROR: "thor zero_args" was called with arguments ["one"]\nUsage: "thor scripts:arities:zero_args"',
      );
      await arityAsserter(
        ["one_arg"],
        'ERROR: "thor one_arg" was called with no arguments\nUsage: "thor scripts:arities:one_arg ARG"',
      );
      await arityAsserter(
        ["one_arg", "one", "two"],
        'ERROR: "thor one_arg" was called with arguments ["one", "two"]\nUsage: "thor scripts:arities:one_arg ARG"',
      );
      await arityAsserter(
        ["one_arg", "one", "two"],
        'ERROR: "thor one_arg" was called with arguments ["one", "two"]\nUsage: "thor scripts:arities:one_arg ARG"',
      );
      await arityAsserter(
        ["two_args", "one"],
        'ERROR: "thor two_args" was called with arguments ["one"]\nUsage: "thor scripts:arities:two_args ARG1 ARG2"',
      );
      await arityAsserter(
        ["optional_arg", "one", "two"],
        'ERROR: "thor optional_arg" was called with arguments ["one", "two"]\nUsage: "thor scripts:arities:optional_arg [ARG]"',
      );
      await arityAsserter(
        ["multiple_usages"],
        'ERROR: "thor multiple_usages" was called with no arguments\nUsage: "thor scripts:arities:multiple_usages ARG --foo"\n       "thor scripts:arities:multiple_usages ARG --bar"',
      );
    });

    it("raises an error if the invoked command does not exist", async () => {
      expect(
        (
          await capture(":stderr", () => (Amazing as unknown as ThorClass).start(["animal"]))
        ).trim(),
      ).toEqual('Could not find command "animal" in "amazing" namespace.');
    });

    it("calls method_missing if an unknown method is passed in", async () => {
      expect(await myScript.start(["unk", "hello"])).toEqual(["unk", ["hello"]]);
    });

    it("does not call a private method no matter what", async () => {
      expect((await capture(":stderr", () => myScript.start(["what"]))).trim()).toEqual(
        'Could not find command "what" in "my_script" namespace.',
      );
    });

    it("uses command default options", async () => {
      const options = ((await myChildScript.start(["animal", "fish"])) as unknown[]).at(-1);
      expect(Object.fromEntries(options as Map<string, unknown>)).toEqual({
        other: "method default",
      });
    });

    it("raises when an exception happens within the command call", async () => {
      await expect(myScript.start(["call_myself_with_wrong_arity"])).rejects.toThrow(ArgumentError);
    });

    describe("when the user enters an unambiguous substring of a command", () => {
      it("invokes a command", async () => {
        expect(await myScript.start(["z"])).toEqual(await myScript.start(["zoo"]));
      });

      it("invokes a command, even when there's an alias it resolves to the same command", async () => {
        expect(await myScript.start(["hi", "arg"])).toEqual(
          await myScript.start(["hidden", "arg"]),
        );
      });

      it("invokes an alias", async () => {
        expect(await myScript.start(["animal_pri"])).toEqual(await myScript.start(["zoo"]));
      });
    });

    describe("when the user enters an ambiguous substring of a command", () => {
      it("raises an exception and displays a message that explains the ambiguity", async () => {
        const shell = new Base.shell!();
        const error = vi.spyOn(shell, "error").mockImplementation(() => {});
        await myScript.start(["call"], { shell: shell });
        expect(error).toHaveBeenCalledWith(
          "Ambiguous command call matches [call_myself_with_wrong_arity, call_unexistent_method]",
        );
      });

      it("raises an exception when there is an alias", async () => {
        const shell = new Base.shell!();
        const error = vi.spyOn(shell, "error").mockImplementation(() => {});
        await myScript.start(["f"], { shell: shell });
        expect(error).toHaveBeenCalledWith("Ambiguous command f matches [foo, fu]");
      });
    });
  });

  describe("#help", () => {
    let memo: Basic | undefined;
    beforeEach(() => {
      memo = undefined;
    });
    function shell(): Basic {
      return (memo ??= new Base.shell!());
    }

    describe("on general", () => {
      let content: string;
      beforeEach(async () => {
        content = await capture(":stdout", () => myScript.help(shell()));
      });

      it("provides useful help info for the help method itself", () => {
        expect(content).toMatch(/help \[COMMAND\]\s+# Describe available commands/);
      });

      it("provides useful help info for a method with params", () => {
        expect(content).toMatch(/animal TYPE\s+# horse around/);
      });

      it("uses the maximum terminal size to show commands", async () => {
        const terminalWidth = vi.spyOn(Terminal, "terminalWidth").mockReturnValue(80);
        const content = await capture(":stdout", () => myScript.help(shell()));
        expect(terminalWidth).toHaveBeenCalled();
        expect(content).toMatch(/aaa\.\.\.$/m);
      });

      it("provides description for commands from classes in the same namespace", () => {
        expect(content).toMatch(/baz\s+# do some bazing/);
      });

      it("shows superclass commands", async () => {
        const content = await capture(":stdout", () => myChildScript.help(shell()));
        expect(content).toMatch(/foo BAR \s+# do some fooing/);
      });

      it("shows class options information", async () => {
        const content = await capture(":stdout", () => myChildScript.help(shell()));
        expect(content).toMatch(/Options:/);
        expect(content).toMatch(/\[--param=N\]/);
      });

      it("injects class arguments into default usage", async () => {
        const content = await capture(":stdout", () => scriptsMyScript.help(shell()));
        expect(content).toMatch(/zoo ACCESSOR --param=PARAM/);
      });

      it("prints class exclusive options", async () => {
        const content = await capture(":stdout", () => myClassOptionScript.help(shell()));
        expect(content).toMatch(/Exclusive Options:\n\s+--one\s+--two\n/);
      });

      it("does not print class exclusive options", async () => {
        const content = await capture(":stdout", () => scriptsMyScript.help(shell()));
        expect(content).not.toMatch(/Exclusive Options:/);
      });

      it("prints class at least one of requred options", async () => {
        const content = await capture(":stdout", () => myClassOptionScript.help(shell()));
        expect(content).toMatch(/Required At Least One:\n\s+--three\s+--four\n/);
      });

      it("does not print class at least one of required options", async () => {
        const content = await capture(":stdout", () => scriptsMyScript.help(shell()));
        expect(content).not.toMatch(/Required At Least One:/);
      });
    });

    describe("for a specific command", () => {
      it("provides full help info when talking about a specific command", async () => {
        expect(await capture(":stdout", () => myScript.commandHelp(shell(), "foo"))).toEqual(
          "Usage:\n" +
            "  thor my_script:foo BAR\n" +
            "\n" +
            "Options:\n" +
            "  [--force]  # Force to do some fooing\n" +
            "\n" +
            "do some fooing\n" +
            "  This is more info!\n" +
            "  Everyone likes more info!\n",
        );
      });

      it("provides full help info when talking about a specific command with multiple usages", async () => {
        expect(await capture(":stdout", () => myScript.commandHelp(shell(), "baz"))).toEqual(
          "Usage:\n" +
            "  thor my_script:baz THING\n" +
            "  thor my_script:baz --all\n" +
            "\n" +
            "Options:\n" +
            "  [--all=ALL]  # Do bazing for all the things\n" +
            "\n" +
            "super cool\n",
        );
      });

      it("raises an error if the command can't be found", () => {
        expect(() => {
          myScript.commandHelp(shell(), "unknown");
        }).toThrow(
          new UndefinedCommandError("unknown", Object.keys(myScript.allCommands()), "my_script"),
        );
      });

      it("normalizes names before claiming they don't exist", async () => {
        expect(
          await capture(":stdout", () => myScript.commandHelp(shell(), "name-with-dashes")),
        ).toMatch(/thor my_script:name-with-dashes/);
      });

      it("uses the long description if it exists", async () => {
        expect(
          await capture(":stdout", () => myScript.commandHelp(shell(), "long_description")),
        ).toEqual(
          "Usage:\n" +
            "  thor my_script:long_description\n" +
            "\n" +
            "Description:\n" +
            "  This is a really really really long description. Here you go. So very long.\n" +
            "\n" +
            "  It even has two paragraphs.\n",
        );
      });

      it("prints long description unwrapped if asked for", async () => {
        expect(
          await capture(":stdout", () =>
            myScript.commandHelp(shell(), "long_description_unwrapped"),
          ),
        ).toEqual(
          "Usage:\n" +
            "  thor my_script:long_description\n" +
            "\n" +
            "Description:\n" +
            "No added indentation,   Inline\n" +
            "whatespace not merged,\n" +
            "Linebreaks preserved\n" +
            "  and\n" +
            "    indentation\n" +
            "  too\n",
        );
      });

      it("doesn't assign the long description to the next command without one", async () => {
        expect(
          await capture(":stdout", () => {
            myScript.commandHelp(shell(), "name_with_dashes");
          }),
        ).not.toMatch(/so very long/i);
      });

      it("prints exclusive and at least one options", async () => {
        const message = expect(
          await capture(":stdout", () => {
            myClassOptionScript.commandHelp(shell(), "mix");
          }),
        );
        message.toMatch(/Exclusive Options:\n\s+--five\s+--six\s+--seven\n\s+--one\s+--two/);
        message.toMatch(/Required At Least One:\n\s+--five\s+--six\s+--seven\n\s+--three\s+--four/);
      });
      it("does not print exclusive and at least one options", async () => {
        const message = expect(
          await capture(":stdout", () => {
            (MyOptionScript as unknown as ThorClass).commandHelp(shell(), "no_relations");
          }),
        );
        message.not.toMatch(/Exclusive Options:/);
        message.not.toMatch(/Rquired At Least One:/);
      });
    });

    describe("instance method", () => {
      it("calls the class method", async () => {
        expect(await capture(":stdout", () => myScript.start(["help"]))).toMatch(/Commands:/);
      });

      it("calls the class method", async () => {
        expect(await capture(":stdout", () => myScript.start(["help", "foo"]))).toMatch(/Usage:/);
      });
    });

    describe("with required class_options", () => {
      const klass = () =>
        class extends Thor {
          static {
            const klass = this as unknown as ThorClass;
            klass.classOption("foo", { required: true });

            klass.desc("bar", "do something");
            (this as unknown as ThorClass).methodAdded("bar");
          }
          bar() {}
        } as unknown as ThorClass;

      it("shows the command help", async () => {
        const content = await capture(":stdout", () => klass().start(["help"]));
        expect(content).toMatch(/Commands:/);
      });
    });
  });

  describe("subcommands", () => {
    it("triggers a subcommand help when passed --help", async () => {
      const parent = (() => class extends Thor {})() as unknown as ThorClass;
      const child = (() => class extends Thor {})() as unknown as ThorClass;
      parent.desc("child", "child subcommand");
      parent.subcommand("child", child);
      parent.desc("dummy", "dummy");
      const help = vi.spyOn(child, "help").mockImplementation(() => {});
      await parent.start(["child", "--help"]);
      expect(help).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });
  });

  describe("when creating commands", () => {
    it("prints a warning if a public method is created without description or usage", async () => {
      expect(
        await capture(":stdout", () => {
          class _ extends Thor {
            static {
              (this as unknown as ThorClass).methodAdded("hello_from_thor");
            }
            hello_from_thor() {}
          }
        }),
      ).toMatch(
        /\[WARNING\] Attempted to create command "hello_from_thor" without usage or description/,
      );
    });

    it("does not print if overwriting a previous command", async () => {
      assertEmpty(
        await capture(":stdout", () => {
          class _ extends Thor {
            static {
              (this as unknown as ThorClass).methodAdded("help");
            }
            help() {}
          }
        }),
      );
    });
  });

  describe("edge-cases", () => {
    it("can handle boolean options followed by arguments", async () => {
      const klass = class extends Thor {
        declare options: ThorBase["options"];
        static {
          const klass = this as unknown as ThorClass;
          klass.methodOption("loud", { type: "boolean" });
          klass.desc("hi NAME", "say hi to name");
          (this as unknown as ThorClass).methodAdded("hi");
        }
        hi(name: string) {
          if (this.options["loud"]) name = name.toUpperCase();
          return `Hi ${name}`;
        }
      } as unknown as ThorClass;

      expect(await klass.start(["hi", "jose"])).toEqual("Hi jose");
      expect(await klass.start(["hi", "jose", "--loud"])).toEqual("Hi JOSE");
      expect(await klass.start(["hi", "--loud", "jose"])).toEqual("Hi JOSE");
    });

    it("method_option raises an ArgumentError if name is not a Symbol or String", () => {
      expect(() => {
        class _ extends Thor {
          static {
            (this as unknown as ThorClass).methodOption({
              ":loud": true,
              ":type": ":boolean",
            } as never);
          }
        }
      }).toThrow(
        new ArgumentError("Expected a Symbol or String, got {:loud=>true, :type=>:boolean}"),
      );
    });

    it("class_option raises an ArgumentError if name is not a Symbol or String", () => {
      expect(() => {
        class _ extends Thor {
          static {
            (this as unknown as ThorClass).classOption({
              ":loud": true,
              ":type": ":boolean",
            } as never);
          }
        }
      }).toThrow(
        new ArgumentError("Expected a Symbol or String, got {:loud=>true, :type=>:boolean}"),
      );
    });

    it("passes through unknown options", async () => {
      const klass = class extends Thor {
        static {
          const klass = this as unknown as ThorClass;
          klass.desc("unknown", "passing unknown options");
          (this as unknown as ThorClass).methodAdded("unknown");
        }
        unknown(...args: unknown[]) {
          return args;
        }
      } as unknown as ThorClass;

      expect(await klass.start(["unknown", "foo", "--bar", "baz", "bat", "--bam"])).toEqual([
        "foo",
        "--bar",
        "baz",
        "bat",
        "--bam",
      ]);
      expect(await klass.start(["unknown", "--bar", "baz"])).toEqual(["--bar", "baz"]);
    });

    it("does not pass through unknown options with strict args", async () => {
      const klass = class extends Thor {
        static {
          const klass = this as unknown as ThorClass;
          klass.strictArgsPositionBang();

          klass.desc("unknown", "passing unknown options");
          (this as unknown as ThorClass).methodAdded("unknown");
        }
        unknown(...args: unknown[]) {
          return args;
        }
      } as unknown as ThorClass;

      expect(await klass.start(["unknown", "--bar", "baz"])).toEqual([]);
      expect(await klass.start(["unknown", "foo", "--bar", "baz"])).toEqual(["foo"]);
    });

    it("strict args works in the inheritance chain", async () => {
      const parent = class extends Thor {
        static {
          (this as unknown as ThorClass).strictArgsPositionBang();
        }
      };

      const klass = class extends parent {
        static {
          const klass = this as unknown as ThorClass;
          klass.desc("unknown", "passing unknown options");
          (this as unknown as ThorClass).methodAdded("unknown");
        }
        unknown(...args: unknown[]) {
          return args;
        }
      } as unknown as ThorClass;

      expect(await klass.start(["unknown", "--bar", "baz"])).toEqual([]);
      expect(await klass.start(["unknown", "foo", "--bar", "baz"])).toEqual(["foo"]);
    });

    it("issues a deprecation warning on incompatible types by default", async () => {
      await assertOutputToStderr(() => {
        class _ extends Thor {
          static {
            (this as unknown as ThorClass).option("bar", { type: "numeric", default: "foo" });
          }
        }
      }, /^Deprecation warning/m);
    });

    it("allows incompatible types if allow_incompatible_default_type! is called", async () => {
      await assertNoOutputToStderr(() => {
        class _ extends Thor {
          static {
            const klass = this as unknown as ThorClass;
            klass.allowIncompatibleDefaultTypeBang();

            klass.option("bar", { type: "numeric", default: "foo" });
          }
        }
      });
    });

    it("allows incompatible types if `check_default_type: false` is given", async () => {
      await assertNoOutputToStderr(() => {
        class _ extends Thor {
          static {
            (this as unknown as ThorClass).option("bar", {
              type: "numeric",
              default: "foo",
              checkDefaultType: false,
            });
          }
        }
      });
    });

    it("checks the default type when check_default_type! is called", () => {
      expect(() => {
        class _ extends Thor {
          static {
            const klass = this as unknown as ThorClass;
            klass.checkDefaultTypeBang();

            klass.option("bar", { type: "numeric", default: "foo" });
          }
        }
      }).toThrow(
        new ArgumentError("Expected numeric default value for '--bar'; got \"foo\" (string)"),
      );
    });

    it("send as a command name", async () => {
      expect(await myScript.start(["send"])).toEqual(true);
    });
  });

  describe("without an exit_on_failure? method", () => {
    const myScript = class extends Thor {
      static {
        const klass = this as unknown as ThorClass;
        klass.desc("no arg", "do nothing");
        (this as unknown as ThorClass).methodAdded("no_arg");
      }
      no_arg() {}
    } as unknown as ThorClass;

    it("outputs a deprecation warning on error", async () => {
      await assertOutputToStderr(async () => {
        await myScript.start(["no_arg", "one"]);
      }, /^Deprecation.*exit_on_failure/m);
    });
  });
});
