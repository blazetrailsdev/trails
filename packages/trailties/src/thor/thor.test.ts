import { describe, expect, it } from "vitest";
import { rbEnsure } from "@blazetrails/ruby-compat";
import { type Base, setThorRunner } from "./base.js";
import type { Command } from "./command.js";
import { HashWithIndifferentAccess } from "./core-ext/hash-with-indifferent-access.js";
import * as Script from "./test-helpers/fixtures/script.js";
import { capture } from "./test-helpers/helper.js";
import { Thor, type ThorClass } from "./thor.js";

const MyScript = Script.MyScript as unknown as ThorClass;
const MyChildScript = Script.MyChildScript as unknown as ThorClass;
const MyOptionScript = Script.MyOptionScript as unknown as ThorClass;
const PackageNameScript = Script.PackageNameScript as unknown as ThorClass;
const Scripts = { MyScript: Script.Scripts.MyScript as unknown as ThorClass };

function hash(pairs: Record<string, unknown> = {}): HashWithIndifferentAccess {
  return new HashWithIndifferentAccess(pairs);
}

function double(attributes: { name: string }): Command {
  return attributes as Command;
}

describe("Thor", () => {
  describe("#method_option", () => {
    it("sets options to the next method to be invoked", async () => {
      const args = ["foo", "bar", "--force"];
      const [, options] = (await MyScript.start(args)) as unknown[];
      expect(options).toEqual(hash({ force: true }));
    });

    describe(":lazy_default", () => {
      it("is absent when option is not specified", async () => {
        const [, options] = (await MyScript.start(["with_optional"])) as unknown[];
        expect(options).toEqual(hash({}));
      });

      it("sets a default that can be overridden for strings", async () => {
        let [, options] = (await MyScript.start(["with_optional", "--lazy"])) as unknown[];
        expect(options).toEqual(hash({ lazy: "yes" }));

        [, options] = (await MyScript.start(["with_optional", "--lazy", "yesyes!"])) as unknown[];
        expect(options).toEqual(hash({ lazy: "yesyes!" }));
      });

      it("sets a default that can be overridden for numerics", async () => {
        let [, options] = (await MyScript.start(["with_optional", "--lazy-numeric"])) as unknown[];
        expect(options).toEqual(hash({ lazy_numeric: 42 }));

        [, options] = (await MyScript.start([
          "with_optional",
          "--lazy-numeric",
          "20000",
        ])) as unknown[];
        expect(options).toEqual(hash({ lazy_numeric: 20_000 }));
      });

      it("sets a default that can be overridden for arrays", async () => {
        let [, options] = (await MyScript.start(["with_optional", "--lazy-array"])) as unknown[];
        expect(options).toEqual(hash({ lazy_array: ["eat", "at", "joes"] }));

        [, options] = (await MyScript.start([
          "with_optional",
          "--lazy-array",
          "hello",
          "there",
        ])) as unknown[];
        expect(options).toEqual(hash({ lazy_array: ["hello", "there"] }));
      });

      it("sets a default that can be overridden for hashes", async () => {
        let [, options] = (await MyScript.start(["with_optional", "--lazy-hash"])) as unknown[];
        expect(options).toEqual(hash({ lazy_hash: { swedish: "meatballs" } }));

        [, options] = (await MyScript.start([
          "with_optional",
          "--lazy-hash",
          "polish:sausage",
        ])) as unknown[];
        expect(options).toEqual(hash({ lazy_hash: { polish: "sausage" } }));
      });
    });

    describe("when :for is supplied", () => {
      it("updates an already defined command", async () => {
        const [, options] = (await MyChildScript.start(["animal", "horse", "--other=fish"])) as [
          unknown,
          Base["options"],
        ];
        expect(options.get(":other")).toEqual("fish");
      });

      describe("and the target is on the parent class", () => {
        it("updates an already defined command", async () => {
          const args = ["example_default_command", "my_param", "--new-option=verified"];
          const options = (await Scripts.MyScript.start(args)) as Base["options"];
          expect(options.get(":new_option")).toEqual("verified");
        });

        it("adds a command to the command list if the updated command is on the parent class", () => {
          expect(Scripts.MyScript.commands()["example_default_command"]).toBeTruthy();
        });

        it("clones the parent command", () => {
          expect(Scripts.MyScript.commands()["example_default_command"]).not.toEqual(
            MyChildScript.commands()["example_default_command"],
          );
        });
      });
    });
  });

  describe("#default_command", () => {
    it("sets a default command", () => {
      expect(MyScript.defaultCommand()).toEqual("example_default_command");
    });

    it("invokes the default command if no command is specified", async () => {
      expect(await MyScript.start([])).toEqual("default command");
    });

    it("invokes the default command if no command is specified even if switches are given", async () => {
      expect(await MyScript.start(["--with", "option"])).toEqual(hash({ with: "option" }));
    });

    it("inherits the default command from parent", () => {
      expect(MyChildScript.defaultCommand()).toEqual("example_default_command");
    });
  });

  describe("#stop_on_unknown_option!", () => {
    const myScript = class extends Thor {
      declare options: Base["options"];

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

      exec(...args: unknown[]) {
        return [this.options, args];
      }

      boring(...args: unknown[]) {
        return [this.options, args];
      }
    } as unknown as ThorClass;

    it("passes remaining args to command when it encounters a non-option", async () => {
      expect(await myScript.start(["exec", "command", "--verbose"])).toEqual([
        hash({}),
        ["command", "--verbose"],
      ]);
    });

    it("passes remaining args to command when it encounters an unknown option", async () => {
      expect(await myScript.start(["exec", "--foo", "command", "--bar"])).toEqual([
        hash({}),
        ["--foo", "command", "--bar"],
      ]);
    });

    it("still accepts options that are given before non-options", async () => {
      expect(await myScript.start(["exec", "--verbose", "command", "--foo"])).toEqual([
        hash({ verbose: true }),
        ["command", "--foo"],
      ]);
    });

    it("still accepts options that require a value", async () => {
      expect(await myScript.start(["exec", "--mode", "rashly", "command"])).toEqual([
        hash({ mode: "rashly" }),
        ["command"],
      ]);
    });

    it("still passes everything after -- to command", async () => {
      expect(await myScript.start(["exec", "--", "--verbose"])).toEqual([hash({}), ["--verbose"]]);
    });

    it("still passes everything after -- to command, complex", async () => {
      expect(
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
      ).toEqual([hash({}), ["command", "--mode", "z", "again", "--", "--verbose", "more"]]);
    });

    it("does not affect ordinary commands", async () => {
      expect(await myScript.start(["boring", "command", "--verbose"])).toEqual([
        hash({ verbose: true }),
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
        expect(klass.isStopOnUnknownOption(double({ name: "foo" }))).toBe(true);
        expect(klass.isStopOnUnknownOption(double({ name: "bar" }))).toBe(true);
        expect(klass.isStopOnUnknownOption(double({ name: "baz" }))).toBe(false);
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
        expect(klass.isStopOnUnknownOption(double({ name: "foo" }))).toBe(true);
        expect(klass.isStopOnUnknownOption(double({ name: "bar" }))).toBe(true);
        expect(klass.isStopOnUnknownOption(double({ name: "baz" }))).toBe(false);
      });
    });

    it("doesn't break new", () => {
      expect(new (myScript as unknown as new () => Thor)()).toBeInstanceOf(Thor);
    });

    describe("along with check_unknown_options!", () => {
      const myScript2 = class extends Thor {
        declare options: Base["options"];

        static {
          const klass = this as unknown as ThorClass;
          klass.classOption("verbose", { type: "boolean" });
          klass.classOption("mode", { type: "string" });
          klass.checkUnknownOptionsBang();
          klass.stopOnUnknownOptionBang("exec");

          klass.desc("exec", "Run a command");
          (this as unknown as ThorClass).methodAdded("exec");
        }

        exec(...args: unknown[]) {
          return [this.options, args];
        }

        static isExitOnFailure(): boolean {
          return false;
        }
      } as unknown as ThorClass;

      it("passes remaining args to command when it encounters a non-option", async () => {
        expect(await myScript2.start(["exec", "command", "--verbose"])).toEqual([
          hash({}),
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
        expect(await myScript2.start(["exec", "--verbose", "command"])).toEqual([
          hash({ verbose: true }),
          ["command"],
        ]);
      });

      it("still accepts when non-options are given after real options and argument", async () => {
        expect(await myScript2.start(["exec", "--verbose", "command", "--foo"])).toEqual([
          hash({ verbose: true }),
          ["command", "--foo"],
        ]);
      });

      it("does not accept when non-option looks like an option and is after real options", async () => {
        expect(
          (await capture(":stderr", () => myScript2.start(["exec", "--verbose", "--foo"]))).trim(),
        ).toEqual('Unknown switches "--foo"');
      });

      it("still accepts options that require a value", async () => {
        expect(await myScript2.start(["exec", "--mode", "rashly", "command"])).toEqual([
          hash({ mode: "rashly" }),
          ["command"],
        ]);
      });

      it("still passes everything after -- to command", async () => {
        expect(await myScript2.start(["exec", "--", "--verbose"])).toEqual([
          hash({}),
          ["--verbose"],
        ]);
      });

      it("still passes everything after -- to command, complex", async () => {
        expect(
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
        ).toEqual([hash({}), ["command", "--mode", "z", "again", "--", "--verbose", "more"]]);
      });
    });
  });

  describe("#check_unknown_options!", () => {
    const myScript = class extends Thor {
      declare options: Base["options"];

      static {
        const klass = this as unknown as ThorClass;
        klass.classOption("verbose", { type: "boolean" });
        klass.classOption("mode", { type: "string" });
        klass.checkUnknownOptionsBang();

        klass.desc("checked", "a command with checked");
        (this as unknown as ThorClass).methodAdded("checked");
      }

      checked(...args: unknown[]) {
        return [this.options, args];
      }

      static isExitOnFailure(): boolean {
        return false;
      }
    } as unknown as ThorClass;

    it("still accept options and arguments", async () => {
      expect(await myScript.start(["checked", "command", "--verbose"])).toEqual([
        hash({ verbose: true }),
        ["command"],
      ]);
    });

    it("still accepts options that are given before arguments", async () => {
      expect(await myScript.start(["checked", "--verbose", "command"])).toEqual([
        hash({ verbose: true }),
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
      expect(await myScript.start(["checked", "--mode", "rashly", "command"])).toEqual([
        hash({ mode: "rashly" }),
        ["command"],
      ]);
    });

    it("still passes everything after -- to command", async () => {
      expect(await myScript.start(["checked", "--", "--verbose"])).toEqual([
        hash({}),
        ["--verbose"],
      ]);
    });

    it("still passes everything after -- to command, complex", async () => {
      expect(
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
      ).toEqual([hash({ mode: "z" }), ["command", "again", "--verbose", "more"]]);
    });
  });

  describe("#disable_required_check!", () => {
    const myScript = class extends Thor {
      declare options: Base["options"];

      static {
        const klass = this as unknown as ThorClass;
        klass.classOption("foo", { required: true });

        klass.disableRequiredCheckBang("boring");

        klass.desc("exec", "Run a command");
        (this as unknown as ThorClass).methodAdded("exec");

        klass.desc("boring", "An ordinary command");
        (this as unknown as ThorClass).methodAdded("boring");
      }

      exec(...args: unknown[]) {
        return [this.options, args];
      }

      boring(...args: unknown[]) {
        return [this.options, args];
      }

      static isExitOnFailure(): boolean {
        return false;
      }
    } as unknown as ThorClass;

    it("does not check the required option in the given command", async () => {
      expect(await myScript.start(["boring", "command"])).toEqual([hash({}), ["command"]]);
    });

    it("does check the required option of the remaining command", async () => {
      const content = await capture(":stderr", () => myScript.start(["exec", "command"]));
      expect(content).toEqual("No value provided for required options '--foo'\n");
    });

    it("does affects help by default", () => {
      expect(myScript.isDisableRequiredCheck(double({ name: "help" }))).toBe(true);
    });

    describe("when provided with multiple command names", () => {
      const klass = class extends Thor {
        static {
          (this as unknown as ThorClass).disableRequiredCheckBang("foo", "bar");
        }
      } as unknown as ThorClass;

      it("affects all specified commands", () => {
        expect(klass.isDisableRequiredCheck(double({ name: "help" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "foo" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "bar" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "baz" }))).toBe(false);
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
        expect(klass.isDisableRequiredCheck(double({ name: "help" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "foo" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "bar" }))).toBe(true);
        expect(klass.isDisableRequiredCheck(double({ name: "baz" }))).toBe(false);
      });
    });
  });

  describe("#command_exists?", () => {
    it("returns true for a command that is defined in the class", () => {
      expect(MyScript.isCommandExists("zoo")).toBe(true);
      expect(MyScript.isCommandExists("name-with-dashes")).toBe(true);
      expect(MyScript.isCommandExists("animal_prison")).toBe(true);
    });

    it("returns false for a command that is not defined in the class", () => {
      expect(MyScript.isCommandExists("animal_heaven")).toBe(false);
    });
  });

  describe("#map", () => {
    it("calls the alias of a method if one is provided", async () => {
      expect(await MyScript.start(["-T", "fish"])).toEqual(["fish"]);
    });

    it("calls the alias of a method if several are provided via #map", async () => {
      expect(await MyScript.start(["-f", "fish"])).toEqual(["fish", hash({})]);
      expect(await MyScript.start(["--foo", "fish"])).toEqual(["fish", hash({})]);
    });

    it("inherits all mappings from parent", () => {
      expect(MyChildScript.defaultCommand()).toEqual("example_default_command");
    });
  });

  describe("#package_name", () => {
    it("provides a proper description for a command when the package_name is assigned", async () => {
      const content = await capture(":stdout", () => PackageNameScript.start(["help"]));
      expect(content).toMatch(/Baboon commands:/m);
    });

    it("provides a proper description for a command when the package_name is NOT assigned", async () => {
      const content = await capture(":stdout", () => MyScript.start(["help"]));
      expect(content).toMatch(/Commands:/m);
    });
  });

  describe("#desc", () => {
    it("provides description for a command", async () => {
      const content = await capture(":stdout", () => MyScript.start(["help"]));
      expect(content).toMatch(/thor my_script:zoo\s+# zoo around/m);
    });

    it("provides no namespace if $thor_runner is false", async () => {
      await rbEnsure(
        async () => {
          setThorRunner(false);
          const content = await capture(":stdout", () => MyScript.start(["help"]));
          expect(content).toMatch(/thor zoo\s+# zoo around/m);
        },
        () => {
          setThorRunner(true);
        },
      );
    });

    describe("when :for is supplied", () => {
      it("overwrites a previous defined command", async () => {
        expect(await capture(":stdout", () => MyChildScript.start(["help"]))).toMatch(
          /animal KIND \s+# fish around/m,
        );
      });
    });

    describe("when :hide is supplied", () => {
      it("does not show the command in help", async () => {
        expect(await capture(":stdout", () => MyScript.start(["help"]))).not.toMatch(
          /this is hidden/m,
        );
      });

      it("but the command is still invocable, does not show the command in help", async () => {
        expect(await MyScript.start(["hidden", "yesyes"])).toEqual(["yesyes"]);
      });
    });
  });

  describe("#method_options", () => {
    it("sets default options if called before an initializer", () => {
      const options = MyChildScript.classOptions();
      expect(options["force"].type).toEqual("boolean");
      expect(options["param"].type).toEqual("numeric");
    });

    it("overwrites default options if called on the method scope", async () => {
      const args = ["zoo", "--force", "--param", "feathers"];
      const options = await MyChildScript.start(args);
      expect(options).toEqual(hash({ force: true, param: "feathers" }));
    });

    it("allows default options to be merged with method options", async () => {
      const args = ["animal", "bird", "--force", "--param", "1.0", "--other", "tweets"];
      const [arg, options] = (await MyChildScript.start(args)) as unknown[];
      expect(arg).toEqual("bird");
      expect(options).toEqual(hash({ force: true, param: 1.0, other: "tweets" }));
    });
  });

  describe("#method_exclusive", () => {
    it("returns the exclusive option names for the class", () => {
      const cmd = MyOptionScript.commands()["exclusive"];
      const exclusives = cmd.optionsRelation["exclusiveOptionNames"]!;
      expect(exclusives.length).toBe(2);
      expect(exclusives[0]).toEqual(["one", "two", "three"]);
      expect(exclusives[exclusives.length - 1]).toEqual(["after1", "after2"]);
    });
  });

  describe("#method_at_least_one", () => {
    it("returns the at least one of option names for the class", () => {
      const cmd = MyOptionScript.commands()["at_least_one"];
      const atLeastOnes = cmd.optionsRelation["atLeastOneOptionNames"]!;
      expect(atLeastOnes.length).toBe(2);
      expect(atLeastOnes[0]).toEqual(["one", "two", "three"]);
      expect(atLeastOnes[atLeastOnes.length - 1]).toEqual(["after1", "after2"]);
    });
  });
});
