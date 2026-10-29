import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stderr as $stderr, stdin as $stdin, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Basic } from "./basic.js";
import { Group } from "../group.js";
import type * as LineEditor from "../line-editor.js";

const { readline } = vi.hoisted(() => ({ readline: vi.fn() }));

vi.mock("../line-editor.js", () => ({ readline }));

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
});
