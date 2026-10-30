import { describe, expect, it } from "vitest";
import { puts, stdout as $stdout } from "@blazetrails/ruby-compat";
import { capture } from "./test-helpers/helper.js";
import { Scripts } from "./test-helpers/fixtures/script.js";
import { TestSubcommands } from "./test-helpers/fixtures/subcommand.js";
import { Thor, type ThorClass } from "./thor.js";

const myDefaults = Scripts.MyDefaults as unknown as ThorClass;
const parent = TestSubcommands.Parent as unknown as ThorClass;

describe("Thor", () => {
  describe("#subcommand", () => {
    it("maps a given subcommand to another Thor subclass", async () => {
      const barnHelp = await capture(":stdout", () => myDefaults.start(["barn"]));
      expect(barnHelp).toContain(
        "barn help [COMMAND]  # Describe subcommands or one specific subcommand",
      );
    });

    it("passes commands to subcommand classes", async () => {
      expect((await capture(":stdout", () => myDefaults.start(["barn", "open"]))).trim()).toEqual(
        "Open sesame!",
      );
    });

    it("passes arguments to subcommand classes", async () => {
      expect(
        (await capture(":stdout", () => myDefaults.start(["barn", "open", "shotgun"]))).trim(),
      ).toEqual("That's going to leave a mark.");
    });

    it("ignores unknown options (the subcommand class will handle them)", async () => {
      expect(
        (
          await capture(":stdout", () =>
            myDefaults.start(["barn", "paint", "blue", "--coats", "4"]),
          )
        ).trim(),
      ).toEqual("4 coats of blue paint");
    });

    it("passes parsed options to subcommands", async () => {
      const output = await capture(":stdout", () =>
        parent.start(["sub", "print_opt", "--opt", "output"]),
      );
      expect(output).toEqual("output");
    });

    it("accepts the help switch and calls the help command on the subcommand", async () => {
      const output = await capture(":stdout", () => parent.start(["sub", "print_opt", "--help"]));
      const subHelp = await capture(":stdout", () => parent.start(["sub", "help", "print_opt"]));
      expect(output).toEqual(subHelp);
    });

    it("accepts the help short switch and calls the help command on the subcommand", async () => {
      const output = await capture(":stdout", () => parent.start(["sub", "print_opt", "-h"]));
      const subHelp = await capture(":stdout", () => parent.start(["sub", "help", "print_opt"]));
      expect(output).toEqual(subHelp);
    });

    it("the help command on the subcommand and after it should result in the same output", async () => {
      const output = await capture(":stdout", () => parent.start(["sub", "help"]));
      const subHelp = await capture(":stdout", () => parent.start(["help", "sub"]));
      expect(output).toEqual(subHelp);
    });
  });

  describe("subcommand with an arg", () => {
    class Child1 extends Thor {
      static {
        (this as unknown as ThorClass).desc("foo NAME", "Fooo");
        (this as unknown as ThorClass).methodAdded("foo");
      }

      foo(name: unknown) {
        puts.call($stdout, `${name} was given`);
      }
    }

    class Parent extends Thor {
      static {
        (this as unknown as ThorClass).desc("child1", "child1 description");
        (this as unknown as ThorClass).subcommand("child1", Child1 as unknown as ThorClass);
      }

      static isExitOnFailure(): boolean {
        return false;
      }
    }

    it("shows subcommand name and method name", async () => {
      const subHelp = await capture(":stderr", () =>
        (Parent as unknown as ThorClass).start(["child1", "foo"]),
      );
      expect(subHelp).toEqual(
        [
          'ERROR: "thor child1 foo" was called with no arguments',
          'Usage: "thor child1 foo NAME"',
          "",
        ].join("\n"),
      );
    });
  });
});
