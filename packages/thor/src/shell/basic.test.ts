import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dir,
  getFs,
  env,
  setEnv,
  stderr as $stderr,
  stdin as $stdin,
  stdout as $stdout,
  SystemExit,
} from "@blazetrails/ruby-compat";
import { Basic } from "./basic.js";
import { Group } from "../group.js";
import { capture } from "../test-helpers/helper.js";
import type * as LineEditor from "../line-editor.js";

const { readline, rbFSystem } = vi.hoisted(() => ({ readline: vi.fn(), rbFSystem: vi.fn() }));

vi.mock("../line-editor.js", () => ({ readline }));
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  rbFSystem,
}));

type GroupClass = typeof Group & {
  argument(name: string, options?: Record<string, unknown>): void;
};
const MyCounter = class MyCounter extends Group {
  static {
    (this as unknown as GroupClass).argument("first", { type: "numeric" });
    (this as unknown as GroupClass).argument("second", { type: "numeric", default: 2 });
  }
} as unknown as new (args: unknown[]) => { options: Record<string, unknown> };

describe("Thor::Shell::Basic", () => {
  let _shell: Basic | undefined;
  const shell = () => (_shell ??= new Basic());

  beforeEach(() => {
    _shell = undefined;
    readline.mockReset();
    rbFSystem.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("#padding", () => {
    it("cannot be set to below zero", () => {
      shell().padding = 10;
      expect(shell().padding).toEqual(10);

      shell().padding = -1;
      expect(shell().padding).toEqual(0);
    });
  });

  describe("#indent", () => {
    it("sets the padding temporarily", () => {
      shell().indent(undefined, () => expect(shell().padding).toEqual(1));
      expect(shell().padding).toEqual(0);
    });

    it("derives padding from original value", () => {
      shell().padding = 6;
      shell().indent(undefined, () => expect(shell().padding).toEqual(7));
    });

    it("accepts custom indentation amounts", () => {
      shell().indent(6, () => {
        expect(shell().padding).toEqual(6);
      });
    });

    it("increases the padding when nested", () => {
      shell().indent(undefined, () => {
        expect(shell().padding).toEqual(1);

        shell().indent(undefined, () => {
          expect(shell().padding).toEqual(2);
        });
      });
      expect(shell().padding).toEqual(0);
    });
  });

  describe("#ask", () => {
    it("prints a message to the user and gets the response", async () => {
      readline.mockReturnValueOnce("Sure");
      expect(await shell().ask("Should I overwrite it?")).toEqual("Sure");
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", {});
    });

    it("prints a message to the user prefixed with the current padding", async () => {
      readline.mockReturnValueOnce("George");
      shell().padding = 2;
      await shell().ask("Enter your name:");
      expect(readline).toHaveBeenCalledWith("    Enter your name: ", {});
    });

    it("prints a message and returns nil if EOF is given as input", async () => {
      readline.mockReturnValueOnce(null);
      expect(await shell().ask("")).toEqual(null);
      expect(readline).toHaveBeenCalledWith(" ", {});
    });

    it("prints a message to the user and does not echo stdin if the echo option is set to false", async () => {
      const actual = await vi.importActual<typeof LineEditor>("../line-editor.js");
      readline.mockImplementationOnce(actual.readline);
      const noecho = vi.spyOn($stdin, "noecho").mockResolvedValue("mysecretpass" as never);
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(await shell().ask("What's your password?", { echo: false })).toEqual("mysecretpass");
      expect(print).toHaveBeenCalledWith("What's your password? ");
      expect(noecho).toHaveBeenCalled();
    });

    it("prints a message to the user with the available options, expects case-sensitive matching, and determines the correctness of the answer", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("chocolate");
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", { limitedTo: flavors }),
      ).toEqual("chocolate");
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] ",
        { limitedTo: flavors },
      );
    });

    it("prints a message to the user with the available options, expects case-sensitive matching, and reasks the question after an incorrect response", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("moose tracks").mockReturnValueOnce("chocolate");
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", {
          limitedTo: flavors,
        }),
      ).toEqual("chocolate");
      expect(print).toHaveBeenCalledWith(
        "Your response must be one of: [strawberry, chocolate, vanilla]. Please try again.\n",
      );
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] ",
        { limitedTo: flavors },
      );
    });

    it("prints a message to the user with the available options, expects case-sensitive matching, and reasks the question after a case-insensitive match", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("cHoCoLaTe").mockReturnValueOnce("chocolate");
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", {
          limitedTo: flavors,
        }),
      ).toEqual("chocolate");
      expect(print).toHaveBeenCalledWith(
        "Your response must be one of: [strawberry, chocolate, vanilla]. Please try again.\n",
      );
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] ",
        { limitedTo: flavors },
      );
    });

    it("prints a message to the user with the available options, expects case-insensitive matching, and determines the correctness of the answer", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("CHOCOLATE");
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", {
          limitedTo: flavors,
          caseInsensitive: true,
        }),
      ).toEqual("chocolate");
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] ",
        { limitedTo: flavors, caseInsensitive: true },
      );
    });

    it("prints a message to the user with the available options, expects case-insensitive matching, and reasks the question after an incorrect response", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("moose tracks").mockReturnValueOnce("chocolate");
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", {
          limitedTo: flavors,
          caseInsensitive: true,
        }),
      ).toEqual("chocolate");
      expect(print).toHaveBeenCalledWith(
        "Your response must be one of: [strawberry, chocolate, vanilla]. Please try again.\n",
      );
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] ",
        { limitedTo: flavors, caseInsensitive: true },
      );
    });

    it("prints a message to the user containing a default and sets the default if only enter is pressed", async () => {
      readline.mockReturnValueOnce("");
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", { default: "vanilla" }),
      ).toEqual("vanilla");
      expect(readline).toHaveBeenCalledWith("What's your favorite Neopolitan flavor? (vanilla) ", {
        default: "vanilla",
      });
    });

    it("prints a message to the user with the available options and reasks the question after an incorrect response and then returns the default", async () => {
      const flavors = ["strawberry", "chocolate", "vanilla"];
      readline.mockReturnValueOnce("moose tracks").mockReturnValueOnce("");
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(
        await shell().ask("What's your favorite Neopolitan flavor?", {
          default: "vanilla",
          limitedTo: flavors,
        }),
      ).toEqual("vanilla");
      expect(print).toHaveBeenCalledWith(
        "Your response must be one of: [strawberry, chocolate, vanilla]. Please try again.\n",
      );
      expect(readline).toHaveBeenCalledWith(
        "What's your favorite Neopolitan flavor? [strawberry, chocolate, vanilla] (vanilla) ",
        { default: "vanilla", limitedTo: flavors },
      );
    });
  });

  describe("#yes?", () => {
    it("asks the user and returns true if the user replies yes", async () => {
      readline.mockReturnValueOnce("y");
      expect(await shell().isYes("Should I overwrite it?")).toBe(true);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });

    it("asks the user and returns false if the user replies no", async () => {
      readline.mockReturnValueOnce("n");
      expect(await shell().isYes("Should I overwrite it?")).not.toBe(true);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });

    it("asks the user and returns false if the user replies with an answer other than yes or no", async () => {
      readline.mockReturnValueOnce("foobar");
      expect(await shell().isYes("Should I overwrite it?")).toBe(false);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });
  });

  describe("#no?", () => {
    it("asks the user and returns true if the user replies no", async () => {
      readline.mockReturnValueOnce("n");
      expect(await shell().isNo("Should I overwrite it?")).toBe(true);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });

    it("asks the user and returns false if the user replies yes", async () => {
      readline.mockReturnValueOnce("Yes");
      expect(await shell().isNo("Should I overwrite it?")).toBe(false);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });

    it("asks the user and returns false if the user replies with an answer other than yes or no", async () => {
      readline.mockReturnValueOnce("foobar");
      expect(await shell().isNo("Should I overwrite it?")).toBe(false);
      expect(readline).toHaveBeenCalledWith("Should I overwrite it? ", { addToHistory: false });
    });
  });

  describe("#say", () => {
    it("prints a message to the user", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("Running...");
      expect(print).toHaveBeenCalledWith("Running...\n");
    });

    it("prints a message to the user without new line if it ends with a whitespace", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("Running... ");
      expect(print).toHaveBeenCalledWith("Running... ");
    });

    it("does not use a new line with whitespace+newline embedded", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("It's \nRunning...");
      expect(print).toHaveBeenCalledWith("It's \nRunning...\n");
    });

    it("prints a message to the user without new line", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("Running...", null, false);
      expect(print).toHaveBeenCalledWith("Running...");
    });

    it("coerces everything to a string before printing", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("this_is_not_a_string", null, true);
      expect(print).toHaveBeenCalledWith("this_is_not_a_string\n");
    });

    it("does not print a message if muted", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().mute(() => {
        shell().say("Running...");
      });
      expect(print).not.toHaveBeenCalled();
    });

    it("does not print a message if base is set to quiet", async () => {
      shell().base = new MyCounter([1, 2]);
      const options = vi.spyOn(shell().base!, "options", "get").mockReturnValue({ quiet: true });

      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().say("Running...");
      expect(options).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });
  });

  describe("#say_error", () => {
    it("prints a message to the user", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("Running...");
      expect(print).toHaveBeenCalledWith("Running...\n");
    });

    it("prints a message to the user without new line if it ends with a whitespace", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("Running... ");
      expect(print).toHaveBeenCalledWith("Running... ");
    });

    it("does not use a new line with whitespace+newline embedded", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("It's \nRunning...");
      expect(print).toHaveBeenCalledWith("It's \nRunning...\n");
    });

    it("prints a message to the user without new line", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("Running...", null, false);
      expect(print).toHaveBeenCalledWith("Running...");
    });

    it("coerces everything to a string before printing", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("this_is_not_a_string", null, true);
      expect(print).toHaveBeenCalledWith("this_is_not_a_string\n");
    });

    it("does not print a message if muted", async () => {
      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().mute(() => {
        shell().sayError("Running...");
      });
      expect(print).not.toHaveBeenCalled();
    });

    it("does not print a message if base is set to quiet", async () => {
      shell().base = new MyCounter([1, 2]);
      const options = vi.spyOn(shell().base!, "options", "get").mockReturnValue({ quiet: true });

      const print = vi.spyOn($stderr, "write").mockReturnValue(true);
      shell().sayError("Running...");
      expect(options).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });
  });

  describe("#print_wrapped", () => {
    const message =
      "Creates a back-up of the given folder by compressing it in a .tar.gz\n" +
      "file and then uploading it to the configured Amazon S3 Bucket.\n\n" +
      "It does not verify the integrity of the generated back-up.";
    let thorColumns: string | undefined;

    beforeEach(() => {
      thorColumns = env.THOR_COLUMNS;
      setEnv("THOR_COLUMNS", "80");
    });

    afterEach(() => {
      setEnv("THOR_COLUMNS", thorColumns);
    });

    describe("without indentation", () => {
      it("properly wraps the text around the 80th column", async () => {
        const expectedOutput =
          "Creates a back-up of the given folder by compressing it in a .tar.gz file and\n" +
          "then uploading it to the configured Amazon S3 Bucket.\n\n" +
          "It does not verify the integrity of the generated back-up.\n";
        await expect(() => new Basic().printWrapped(message)).toOutput(expectedOutput, "stdout");
      });
    });

    describe("with indentation", () => {
      it("properly wraps the text around the 80th column", async () => {
        const expectedOutput =
          "    Creates a back-up of the given folder by compressing it in a .tar.gz file\n" +
          "    and then uploading it to the configured Amazon S3 Bucket.\n\n" +
          "    It does not verify the integrity of the generated back-up.\n";
        await expect(() => new Basic().printWrapped(message, { indent: 4 })).toOutput(
          expectedOutput,
          "stdout",
        );
      });
    });
  });

  describe("#say_status", () => {
    it("prints a message to the user with status", () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().sayStatus("create", "~/.thor/command.thor");
      expect(print).toHaveBeenCalledWith("      create  ~/.thor/command.thor\n");
    });

    it("always uses new line", () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().sayStatus("create", "");
      expect(print).toHaveBeenCalledWith("      create  \n");
    });

    it("indents a multiline message", () => {
      const status = "foobar";
      const lines = ["first line", "second line", "  third line", "    fourth line"];

      const print = vi.spyOn($stdout, "write").mockImplementation((string) => {
        const formattedStatus = new RegExp(`^\\s*${status}\\s*`, "m").exec(string)![0];
        const margin = " ".repeat(formattedStatus.length);

        expect(string).toEqual(formattedStatus + lines.join(`\n${margin}`) + "\n");
        return true;
      });

      shell().sayStatus(status, lines.join("\n") + "\n");
      expect(print).toHaveBeenCalled();
    });

    it("does not print a message if base is muted", () => {
      const isMute = vi.spyOn(shell(), "isMute").mockReturnValue(true);
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);

      shell().mute(() => {
        shell().sayStatus("created", "~/.thor/command.thor");
      });
      expect(isMute).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });

    it("does not print a message if base is set to quiet", () => {
      const base = new MyCounter([1, 2]);
      const options = vi.spyOn(base, "options", "get").mockReturnValue({ quiet: true });

      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().base = base;
      shell().sayStatus("created", "~/.thor/command.thor");
      expect(options).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });

    it("does not print a message if log status is set to false", () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().sayStatus("created", "~/.thor/command.thor", false);
      expect(print).not.toHaveBeenCalled();
    });

    it("uses padding to set message's left margin", () => {
      shell().padding = 2;
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      shell().sayStatus("create", "~/.thor/command.thor");
      expect(print).toHaveBeenCalledWith("      create      ~/.thor/command.thor\n");
    });
  });

  describe("#print_in_columns", () => {
    const array = [1_234_567_890, "a", "b", "c", "d", "e"];

    it("prints in columns", async () => {
      const content = await capture("stdout", () => shell().printInColumns(array));
      expect(content.trimEnd()).toEqual(
        "1234567890  a           b           c           d           e",
      );
    });
  });

  describe("#print_table", () => {
    let table: unknown[];

    beforeEach(() => {
      table = [
        ["abc", "#123", "first three"],
        ["", "#0", "empty"],
        ["xyz", "#786", "last three"],
      ];
    });

    it("prints a table", async () => {
      const content = await capture("stdout", () => shell().printTable(table));
      expect(content).toEqual("abc  #123  first three\n     #0    empty\nxyz  #786  last three\n");
    });

    it("prints a table with indentation", async () => {
      const content = await capture("stdout", () => shell().printTable(table, { indent: 2 }));
      expect(content).toEqual(
        "  abc  #123  first three\n       #0    empty\n  xyz  #786  last three\n",
      );
    });

    it("uses maximum terminal width", async () => {
      table.push(["def", "#456", "Lançam foo bar"]);
      table.push(["ghi", "#789", "بالله  عليكم"]);
      const content = await capture("stdout", () =>
        shell().printTable(table, { indent: 2, truncate: 20 }),
      );
      expect(content).toEqual(
        "  abc  #123  firs...\n" +
          "       #0    empty\n" +
          "  xyz  #786  last...\n" +
          "  def  #456  Lanç...\n" +
          "  ghi  #789  بالل...\n",
      );
    });

    it("honors the colwidth option", async () => {
      const content = await capture("stdout", () => shell().printTable(table, { colwidth: 10 }));
      expect(content).toEqual(
        "abc         #123  first three\n            #0    empty\nxyz         #786  last three\n",
      );
    });

    it("prints tables with implicit columns", async () => {
      for (let i = 0; i < 2; i++) (table[0] as unknown[]).pop();
      const content = await capture("stdout", () => shell().printTable(table));
      expect(content).toEqual(`abc${"  "}\n     #0    empty\nxyz  #786  last three\n`);
    });

    it("prints a table with small numbers and right-aligns them", async () => {
      const table = [
        ["Name", "Number", "Color"],
        ["Erik", 1, "green"],
      ];
      const content = await capture("stdout", () => shell().printTable(table));
      expect(content).toEqual("Name  Number  Color\nErik       1  green\n");
    });

    it("doesn't output extra spaces for right-aligned columns in the last column", async () => {
      const table = [
        ["Name", "Number"],
        ["Erik", 1],
      ];
      const content = await capture("stdout", () => shell().printTable(table));
      expect(content).toEqual("Name  Number\nErik       1\n");
    });

    it("prints a table with big numbers", async () => {
      const table = [
        ["Name", "Number", "Color"],
        ["Erik", 1_234_567_890_123, "green"],
      ];
      const content = await capture("stdout", () => shell().printTable(table));
      expect(content).toEqual("Name  Number         Color\nErik  1234567890123  green\n");
    });

    it("prints a table with borders", async () => {
      const content = await capture("stdout", () => shell().printTable(table, { borders: true }));
      expect(content).toEqual(
        "+-----+------+-------------+\n" +
          "| abc | #123 | first three |\n" +
          "|     | #0   | empty       |\n" +
          "| xyz | #786 | last three  |\n" +
          "+-----+------+-------------+\n",
      );
    });

    it("prints a table with borders and separators", async () => {
      table.splice(1, 0, ":separator");
      const content = await capture("stdout", () => shell().printTable(table, { borders: true }));
      expect(content).toEqual(
        "+-----+------+-------------+\n" +
          "| abc | #123 | first three |\n" +
          "+-----+------+-------------+\n" +
          "|     | #0   | empty       |\n" +
          "| xyz | #786 | last three  |\n" +
          "+-----+------+-------------+\n",
      );
    });

    it("prints a table with borders and small numbers and right-aligns them", async () => {
      const table = [
        ["Name", "Number", "Color"],
        ["Erik", 1, "green"],
      ];
      const content = await capture("stdout", () => shell().printTable(table, { borders: true }));
      expect(content).toEqual(
        "+------+--------+-------+\n" +
          "| Name | Number | Color |\n" +
          "| Erik |      1 | green |\n" +
          "+------+--------+-------+\n",
      );
    });

    it("prints a table with borders and indentation", async () => {
      const table = [
        ["Name", "Number", "Color"],
        ["Erik", 1, "green"],
      ];
      const content = await capture("stdout", () =>
        shell().printTable(table, { borders: true, indent: 2 }),
      );
      expect(content).toEqual(
        "  +------+--------+-------+\n" +
          "  | Name | Number | Color |\n" +
          "  | Erik |      1 | green |\n" +
          "  +------+--------+-------+\n",
      );
    });
  });

  describe("#file_collision", () => {
    it("shows a menu with options", async () => {
      readline.mockResolvedValueOnce("n");
      await shell().fileCollision("foo");
      expect(readline).toHaveBeenCalledWith('Overwrite foo? (enter "h" for help) [Ynaqh] ', {
        addToHistory: false,
      });
    });

    it("outputs a new line and returns true if stdin is closed", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      readline.mockResolvedValueOnce(null);
      expect(await shell().fileCollision("foo")).toBe(true);
      expect(print).toHaveBeenCalledWith("\n");
      expect(readline).toHaveBeenCalled();
    });

    it("returns true if the user chooses default option", async () => {
      readline.mockResolvedValueOnce("");
      expect(await shell().fileCollision("foo")).toBe(true);
      expect(readline).toHaveBeenCalled();
    });

    it("returns false if the user chooses no", async () => {
      readline.mockResolvedValueOnce("n");
      expect(await shell().fileCollision("foo")).toBe(false);
      expect(readline).toHaveBeenCalled();
    });

    it("returns true if the user chooses yes", async () => {
      readline.mockResolvedValueOnce("y");
      expect(await shell().fileCollision("foo")).toBe(true);
      expect(readline).toHaveBeenCalled();
    });

    it("shows help usage if the user chooses help", async () => {
      readline.mockResolvedValueOnce("h").mockResolvedValueOnce("n");
      const help = await capture("stdout", () => shell().fileCollision("foo"));
      expect(help).toMatch(/h - help, show this help/);
      expect(readline).toHaveBeenCalled();
    });

    it("quits if the user chooses quit", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      readline.mockResolvedValueOnce("q");

      await expect(shell().fileCollision("foo")).rejects.toThrow(SystemExit);
      expect(print).toHaveBeenCalledWith("Aborting...\n");
      expect(readline).toHaveBeenCalled();
    });

    it("always returns true if the user chooses always", async () => {
      readline.mockResolvedValueOnce("a");

      expect(await shell().fileCollision("foo")).toBe(true);
      expect(readline).toHaveBeenCalledWith('Overwrite foo? (enter "h" for help) [Ynaqh] ', {
        addToHistory: false,
      });

      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      expect(await shell().fileCollision("foo")).toBe(true);
      expect(print).not.toHaveBeenCalled();
    });

    describe("when a block is given", () => {
      const block = () => "";

      afterEach(() => {
        Dir.glob("foo2*").forEach((path) => getFs().rmSync(path));
      });

      const mergeTool = (value: string) =>
        vi
          .spyOn(shell() as unknown as { mergeTool(): Promise<string> }, "mergeTool")
          .mockResolvedValue(value);

      it("displays diff and merge options to the user", async () => {
        readline.mockResolvedValueOnce("s");
        readline.mockResolvedValueOnce("n");
        await capture("stdout", () => shell().fileCollision("foo", block));
        expect(readline).toHaveBeenCalledWith('Overwrite foo? (enter "h" for help) [Ynaqdhm] ', {
          addToHistory: false,
        });
      });

      it("invokes the diff command", async () => {
        readline.mockResolvedValueOnce("d").mockResolvedValueOnce("n");
        await capture("stdout", () => shell().fileCollision("foo", block));
        expect(rbFSystem).toHaveBeenCalledWith(expect.stringMatching(/diff -u/));
        expect(readline).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything());
        expect(readline).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything());
      });

      it("invokes the merge tool", async () => {
        mergeTool("meld");
        readline.mockResolvedValueOnce("m");
        await capture("stdout", () => shell().fileCollision("foo", block));
        expect(rbFSystem).toHaveBeenCalledWith(expect.stringMatching(/meld/));
        expect(readline).toHaveBeenCalled();
      });

      it("invokes the merge tool that specified at ENV['THOR_MERGE']", async () => {
        const thorMerge = env.THOR_MERGE;
        setEnv("THOR_MERGE", "meld");
        try {
          readline.mockResolvedValueOnce("m");
          await capture("stdout", () => shell().fileCollision("foo", block));
          expect(rbFSystem).toHaveBeenCalledWith(expect.stringMatching(/meld/));
          expect(readline).toHaveBeenCalled();
        } finally {
          setEnv("THOR_MERGE", thorMerge);
        }
      });

      it("show warning if user chooses merge but merge tool is not specified", async () => {
        mergeTool("");
        readline.mockResolvedValueOnce("m").mockResolvedValueOnce("n");
        const help = await capture("stdout", () => shell().fileCollision("foo", block));
        expect(help).toMatch(/Please specify merge tool to `THOR_MERGE` env/);
        expect(readline).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything());
        expect(readline).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything());
      });
    });
  });
});
