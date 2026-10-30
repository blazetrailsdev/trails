import { afterEach, describe, expect, it } from "vitest";
import { isEmpty, rbObjRespondTo, RuntimeError, setEnv } from "@blazetrails/ruby-compat";
import { Base as ThorBase } from "./base.js";
import {
  AtLeastOneRequiredArgumentError,
  ExclusiveArgumentError,
  UndefinedCommandError,
} from "./error.js";
import { Group } from "./group.js";
import { Base } from "./shell.js";
import type { Basic } from "./shell/basic.js";
import { capture } from "./test-helpers/helper.js";
import { Amazing } from "./test-helpers/fixtures/command.js";
import { Enum } from "./test-helpers/fixtures/enum.js";
import { BrokenCounter, ClearCounter, MyCounter } from "./test-helpers/fixtures/group.js";
import { B } from "./test-helpers/fixtures/invoke.js";
import {
  Barn,
  MyChildScript,
  MyClassOptionScript,
  MyScript,
  Scripts,
} from "./test-helpers/fixtures/script.js";
import type { ThorClass } from "./thor.js";

type AnyClass = Record<string, any> & (new (...args: unknown[]) => any);

const myCounter = MyCounter as unknown as AnyClass;
const brokenCounter = BrokenCounter as unknown as AnyClass;
const clearCounter = ClearCounter as unknown as AnyClass;
const myScript = MyScript as unknown as AnyClass;
const myChildScript = MyChildScript as unknown as AnyClass;
const scriptsMyScript = Scripts.MyScript as unknown as AnyClass;
const myClassOptionScript = MyClassOptionScript as unknown as AnyClass;

function assertEmpty(obj: object | string): void {
  if (!isEmpty(obj)) throw new globalThis.Error(`Expected ${JSON.stringify(obj)} to be empty.`);
}

function assertRespondTo(obj: object, meth: string): void {
  if (!rbObjRespondTo(obj, meth)) throw new globalThis.Error(`Expected to respond to ${meth}.`);
}

function assertNotRespondTo(obj: object, meth: string): void {
  if (rbObjRespondTo(obj, meth)) throw new globalThis.Error(`Expected not to respond to ${meth}.`);
}

function raiseError(klass: unknown, message: unknown): ReturnType<typeof expect.objectContaining> {
  return expect.objectContaining({ constructor: klass, message });
}

function shellNew(): Basic {
  return new (Base.shell as unknown as new () => Basic)();
}

describe("Thor::Base", () => {
  afterEach(() => {
    setEnv("THOR_DEBUG", undefined);
  });

  describe("#initialize", () => {
    it("sets arguments array", () => {
      const base = new myCounter([1, 2]);
      expect(base.first).toEqual(1);
      expect(base.second).toEqual(2);
    });

    it("sets arguments default values", () => {
      const base = new myCounter([1]);
      expect(base.second).toEqual(2);
    });

    it("sets options default values", () => {
      const base = new myCounter([1, 2]);
      expect(base.options["third"]).toEqual(3);
    });

    it("allows options to be given as symbols or strings", () => {
      let base = new myCounter([1, 2], { third: 4 });
      expect(base.options["third"]).toEqual(4);

      base = new myCounter([1, 2], { third: 4 });
      expect(base.options["third"]).toEqual(4);
    });

    it("creates options with indifferent access", () => {
      const base = new myCounter([1, 2], { third: 3 });
      expect(base.options["third"]).toEqual(3);
    });

    it("creates options with magic predicates", () => {
      const base = new myCounter([1, 2], { third: 3 });
      expect(base.options.third).toEqual(3);
    });
  });

  describe("#no_commands", () => {
    it("avoids methods being added as commands", () => {
      expect(Object.keys(myScript.commands())).toContain("animal");
      expect(Object.keys(myScript.commands())).not.toContain("this_is_not_a_command");
      expect(Object.keys(myScript.commands())).not.toContain("neither_is_this");
    });
  });

  describe("#argument", () => {
    it("sets a value as required and creates an accessor for it", async () => {
      expect(((await myCounter.start(["1", "2", "--third", "3"])) as unknown[])[0]).toEqual(1);
      expect(
        await scriptsMyScript.start(["zoo", "my_special_param", "--param=normal_param"]),
      ).toEqual("my_special_param");
    });

    it("does not set a value in the options hash", async () => {
      expect(((await brokenCounter.start(["1", "2", "--third", "3"])) as unknown[])[0]).toBeNull();
    });
  });

  describe("#arguments", () => {
    it("returns the arguments for the class", () => {
      expect(myCounter.arguments().length).toBe(2);
    });
  });

  describe("#class_exclusive_option_names", () => {
    it("returns the exclusive option names for the class", () => {
      expect(myClassOptionScript.classExclusiveOptionNames().length).toBe(1);
      expect(myClassOptionScript.classExclusiveOptionNames()[0].length).toBe(2);
    });
  });

  describe("#class_at_least_one_option_names", () => {
    it("returns the at least one of option names for the class", () => {
      expect(myClassOptionScript.classAtLeastOneOptionNames().length).toBe(1);
      expect(myClassOptionScript.classAtLeastOneOptionNames()[0].length).toBe(2);
    });
  });

  describe("#class_exclusive", () => {
    it("raise error when exclusive options are given", async () => {
      setEnv("THOR_DEBUG", "1");
      await expect(
        myClassOptionScript.start(["mix", "--one", "--two", "--three", "--five"]),
      ).rejects.toThrow(
        raiseError(ExclusiveArgumentError, "Found exclusive options '--one', '--two'"),
      );

      await expect(
        myClassOptionScript.start(["mix", "--one", "--three", "--five", "--six"]),
      ).rejects.toThrow(
        raiseError(ExclusiveArgumentError, "Found exclusive options '--five', '--six'"),
      );
    });
  });

  describe("#class_at_least_one", () => {
    it("raise error when at least one of required options are not given", async () => {
      setEnv("THOR_DEBUG", "1");
      await expect(myClassOptionScript.start(["mix", "--five"])).rejects.toThrow(
        raiseError(
          AtLeastOneRequiredArgumentError,
          "Not found at least one of required options '--three', '--four'",
        ),
      );

      await expect(myClassOptionScript.start(["mix", "--one", "--three"])).rejects.toThrow(
        raiseError(
          AtLeastOneRequiredArgumentError,
          "Not found at least one of required options '--five', '--six', '--seven'",
        ),
      );
    });
  });

  describe(":aliases", () => {
    it("supports string aliases without a dash prefix", async () => {
      expect(((await myCounter.start(["1", "2", "-z", "3"])) as unknown[])[4]).toEqual(3);
    });

    it("supports symbol aliases", async () => {
      expect(((await myCounter.start(["1", "2", "-y", "3"])) as unknown[])[5]).toEqual(3);
      expect(((await myCounter.start(["1", "2", "-r", "3"])) as unknown[])[5]).toEqual(3);
    });
  });

  describe("#class_option", () => {
    it("sets options class wise", async () => {
      expect(((await myCounter.start(["1", "2", "--third", "3"])) as unknown[])[2]).toEqual(3);
    });

    it("does not create an accessor for it", async () => {
      expect(((await brokenCounter.start(["1", "2", "--third", "3"])) as unknown[])[3]).toBe(false);
    });
  });

  describe("#class_options", () => {
    it("sets default options overwriting superclass definitions", () => {
      const options = scriptsMyScript.classOptions() as Record<string, { isRequired(): boolean }>;
      expect(options["force"].isRequired()).toBeFalsy();
    });
  });

  describe("#remove_argument", () => {
    it("removes previously defined arguments from class", () => {
      assertEmpty(clearCounter.arguments());
    });

    it("undefine accessors if required", () => {
      assertNotRespondTo(new clearCounter(), "first");
      assertNotRespondTo(new clearCounter(), "second");
    });
  });

  describe("#remove_class_option", () => {
    it("removes previous defined class option", () => {
      expect((clearCounter.classOptions() as Record<string, unknown>)["third"]).toBeUndefined();
    });
  });

  describe("#class_options_help", () => {
    function content(): Promise<string> {
      return capture(":stdout", () => (MyCounter as unknown as ThorClass).help(shellNew()));
    }

    it("shows option's description", async () => {
      expect(await content()).toMatch(/# The third argument/);
    });

    it("shows usage with banner content", async () => {
      expect(await content()).toMatch(/\[--third=THREE\]/);
    });

    it("shows default values below descriptions", async () => {
      expect(await content()).toMatch(/# Default: 3/);
    });

    it("prints arrays as copy pasteables", async () => {
      expect(await content()).toMatch(/Default: "foo" "bar"/);
    });

    it("shows options in different groups", async () => {
      const c = await content();
      expect(c).toMatch(/Options:/);
      expect(c).toMatch(/Runtime options:/);
      expect(c).toMatch(/-p, \[--pretend\]/);
    });

    it("use padding in options that do not have aliases", async () => {
      const c = await content();
      expect(c).toMatch(/^ {2}-t, {5}\[--third/m);
      expect(c).toMatch(/^ {10}\[--fourth/m);
      expect(c).toMatch(/^ {2}-y, -r, \[--symbolic/m);
    });

    it("allows extra options to be given", async () => {
      const hash = new Map([
        ["Foo", [...Object.values((B as unknown as AnyClass).classOptions() as object)]],
      ]);

      const content = await capture(":stdout", () =>
        myCounter.classOptionsHelp(shellNew(), hash as never),
      );
      expect(content).toMatch(/Foo options:/);
      expect(content).toMatch(/--last-name=LAST_NAME/);
    });

    it("displays choices for enums", async () => {
      const content = await capture(":stdout", () =>
        (Enum as unknown as ThorClass).help(shellNew()),
      );
      expect(content).toMatch(/Possible values: apple, banana/);
    });
  });

  describe("#namespace", () => {
    it("returns the default class namespace", () => {
      expect(scriptsMyScript.namespace()).toEqual("scripts:my_script");
    });

    it("sets a namespace to the class", () => {
      expect((Scripts.MyDefaults as unknown as AnyClass).namespace()).toEqual("default");
    });
  });

  describe("#group", () => {
    it("sets a group", () => {
      expect(myScript.group()).toEqual("script");
    });

    it("inherits the group from parent", () => {
      expect(myChildScript.group()).toEqual("script");
    });

    it("defaults to standard if no group is given", () => {
      expect((Amazing as unknown as AnyClass).group()).toEqual("standard");
    });
  });

  describe("#subclasses", () => {
    it("tracks its subclasses in an Array", () => {
      expect(ThorBase.subclasses()).toContain(MyScript);
      expect(ThorBase.subclasses()).toContain(MyChildScript);
      expect(ThorBase.subclasses()).toContain(Scripts.MyScript);
    });
  });

  describe("#commands", () => {
    it("returns a list with all commands defined in this class", () => {
      assertRespondTo(new myChildScript(), "animal");
      expect(Object.keys(myChildScript.commands())).toContain("animal");
    });

    it("raises an error if a command with reserved word is defined", () => {
      expect(() => {
        const klass = class extends Group {} as unknown as AnyClass;
        klass.prototype.shell = function () {};
        klass.methodAdded("shell");
      }).toThrow(
        expect.objectContaining({
          constructor: RuntimeError,
          message: expect.stringMatching(
            /"shell" is a Thor reserved word and cannot be defined as command/,
          ),
        }),
      );
    });
  });

  describe("#all_commands", () => {
    it("returns a list with all commands defined in this class plus superclasses", () => {
      assertRespondTo(new myChildScript(), "foo");
      expect(Object.keys(myChildScript.allCommands())).toContain("foo");
    });
  });

  describe("#remove_command", () => {
    it("removes the command from its commands hash", () => {
      expect(Object.keys(myChildScript.allCommands())).not.toContain("name_with_dashes");
      expect(Object.keys(myChildScript.commands())).not.toContain("boom");
    });

    it("undefines the method if desired", () => {
      assertNotRespondTo(new myChildScript(), "boom");
    });
  });

  describe("#from_superclass", () => {
    it("does not send a method to the superclass if the superclass does not respond to it", () => {
      expect((MyCounter as unknown as { getFromSuper(): unknown }).getFromSuper()).toEqual(13);
    });
  });

  describe("#start", () => {
    it("raises an error instead of rescuing if THOR_DEBUG=1 is given", async () => {
      setEnv("THOR_DEBUG", "1");

      await expect(myScript.start(["what", "--debug"])).rejects.toThrow(
        raiseError(
          UndefinedCommandError,
          'Could not find command "what" in "my_script" namespace.',
        ),
      );
    });

    it("raises an error instead of rescuing if :debug option is given", async () => {
      await expect(myScript.start(["what"], { debug: true })).rejects.toThrow(
        raiseError(
          UndefinedCommandError,
          'Could not find command "what" in "my_script" namespace.',
        ),
      );
    });

    it("suggests commands that are similar if there is a typo", async () => {
      const expected =
        'Could not find command "paintz" in "barn" namespace.\nDid you mean?  "paint"\n';

      expect(
        await capture(":stderr", () => (Barn as unknown as AnyClass).start(["paintz"])),
      ).toEqual(expected);
    });

    it("does not steal args", async () => {
      const args = ["foo", "bar", "--force", "true"];
      await myScript.start(args);
      expect(args).toEqual(["foo", "bar", "--force", "true"]);
    });

    it("checks unknown options", async () => {
      expect(
        (
          await capture(":stderr", () =>
            myScript.start(["foo", "bar", "--force", "true", "--unknown", "baz"]),
          )
        ).trim(),
      ).toEqual('Unknown switches "--unknown"');
    });

    it("checks unknown options except specified", async () => {
      assertEmpty(
        (
          await capture(":stderr", async () => {
            const [name, options, args] = (await myScript.start([
              "with_optional",
              "NAME",
              "--omg",
              "--invalid",
            ])) as [unknown, Map<string, unknown>, unknown];
            expect([name, Object.fromEntries(options), args]).toEqual([
              "NAME",
              {},
              ["--omg", "--invalid"],
            ]);
          })
        ).trim(),
      );
    });
  });

  describe("attr_*", () => {
    it("does not add attr_reader as a command", async () => {
      expect(await capture(":stderr", () => myScript.start(["another_attribute"]))).toMatch(
        /Could not find/,
      );
    });

    it("does not add attr_writer as a command", async () => {
      expect(await capture(":stderr", () => myScript.start(["another_attribute=", "foo"]))).toMatch(
        /Could not find/,
      );
    });

    it("does not add attr_accessor as a command", async () => {
      expect(await capture(":stderr", () => myScript.start(["some_attribute"]))).toMatch(
        /Could not find/,
      );
      expect(await capture(":stderr", () => myScript.start(["some_attribute=", "foo"]))).toMatch(
        /Could not find/,
      );
    });
  });
});
