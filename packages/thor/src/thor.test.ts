import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, isEmpty } from "@blazetrails/ruby-compat";
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
