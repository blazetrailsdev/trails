import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { chomp, env, setEnv, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Color } from "./color.js";

describe("Thor::Shell::Color", () => {
  let _shell: Color | undefined;
  const shell = () => (_shell ??= new Color());
  let tty: MockInstance<() => boolean>;
  let origEnv: Record<string, string | undefined>;

  beforeEach(() => {
    _shell = undefined;
    tty = vi.spyOn($stdout, "isTTY", "get").mockReturnValue(true);
    origEnv = { TERM: env["TERM"], NO_COLOR: env["NO_COLOR"] };
    setEnv("NO_COLOR", undefined);
    setEnv("TERM", "ansi");
  });

  afterEach(() => {
    tty.mockRestore();
    setEnv("TERM", origEnv["TERM"]);
    setEnv("NO_COLOR", origEnv["NO_COLOR"]);
  });

  describe("#say", () => {
    it("set the color if specified and tty?", async () => {
      const out = await capture(":stdout", () => {
        shell().say("Wow! Now we have colors!", ":green");
      });

      expect(chomp(out)).toEqual("\x1b[32mWow! Now we have colors!\x1b[0m");
    });

    it("does not set the color if output is not a tty", async () => {
      const out = await capture(":stdout", () => {
        tty.mockReturnValue(false);
        shell().say("Wow! Now we have colors!", ":green");
        expect(tty).toHaveBeenCalled();
      });

      expect(chomp(out)).toEqual("Wow! Now we have colors!");
    });

    it("does not set the color if NO_COLOR is set to any value that is not an empty string", async () => {
      setEnv("NO_COLOR", "non-empty string value");
      const out = await capture(":stdout", () => {
        shell().say("NO_COLOR is enforced! We should not have colors!", ":green");
      });

      expect(chomp(out)).toEqual("NO_COLOR is enforced! We should not have colors!");
    });

    it("colors are still used and NO_COLOR is ignored if the environment variable is nil", async () => {
      setEnv("NO_COLOR", undefined);
      const out = await capture(":stdout", () => {
        shell().say("NO_COLOR is ignored! We have colors!", ":green");
      });

      expect(chomp(out)).toEqual("\x1b[32mNO_COLOR is ignored! We have colors!\x1b[0m");
    });

    it("colors are still used and NO_COLOR is ignored if the environment variable is an empty-string", async () => {
      setEnv("NO_COLOR", "");
      const out = await capture(":stdout", () => {
        shell().say("NO_COLOR is ignored! We have colors!", ":green");
      });

      expect(chomp(out)).toEqual("\x1b[32mNO_COLOR is ignored! We have colors!\x1b[0m");
    });

    it("does not use a new line even with colors", async () => {
      const out = await capture(":stdout", () => {
        shell().say("Wow! Now we have colors! ", ":green");
      });

      expect(chomp(out)).toEqual("\x1b[32mWow! Now we have colors! \x1b[0m");
    });

    it("handles an Array of colors", async () => {
      const out = await capture(":stdout", () => {
        shell().say("Wow! Now we have colors *and* background colors", [
          ":green",
          ":on_red",
          ":bold",
        ]);
      });

      expect(chomp(out)).toEqual(
        "\x1b[32m\x1b[41m\x1b[1mWow! Now we have colors *and* background colors\x1b[0m",
      );
    });

    it("supports the legacy color syntax", async () => {
      const out = await capture(":stdout", () => {
        shell().say("Wow! This still works?", [":blue", true]);
      });

      expect(chomp(out)).toEqual("\x1b[1m\x1b[34mWow! This still works?\x1b[0m");
    });
  });

  describe("#say_status", () => {
    it("uses color to say status", async () => {
      const out = await capture(":stdout", () => {
        shell().sayStatus("conflict", "README", ":red");
      });

      expect(chomp(out)).toEqual("\x1b[1m\x1b[31m    conflict\x1b[0m  README");
    });
  });

  describe("#set_color", () => {
    it("colors a string with a foreground color", () => {
      const red = shell().setColor("hi!", ":red");
      expect(red).toEqual("\x1b[31mhi!\x1b[0m");
    });

    it("colors a string with a background color", () => {
      const onRed = shell().setColor("hi!", ":white", ":on_red");
      expect(onRed).toEqual("\x1b[37m\x1b[41mhi!\x1b[0m");
    });

    it("colors a string with a bold color", () => {
      let bold = shell().setColor("hi!", ":white", true);
      expect(bold).toEqual("\x1b[1m\x1b[37mhi!\x1b[0m");

      bold = shell().setColor("hi!", ":white", ":bold");
      expect(bold).toEqual("\x1b[37m\x1b[1mhi!\x1b[0m");

      bold = shell().setColor("hi!", ":white", ":on_red", ":bold");
      expect(bold).toEqual("\x1b[37m\x1b[41m\x1b[1mhi!\x1b[0m");
    });

    it("does nothing when there are no colors", () => {
      let colorless = shell().setColor("hi!", null);
      expect(colorless).toEqual("hi!");

      colorless = shell().setColor("hi!");
      expect(colorless).toEqual("hi!");
    });

    it("does nothing when stdout is not a tty", () => {
      tty.mockReturnValue(false);
      const colorless = shell().setColor("hi!", ":white");
      expect(colorless).toEqual("hi!");
    });

    it("does nothing when the TERM environment variable is set to 'dumb'", () => {
      setEnv("TERM", "dumb");
      const colorless = shell().setColor("hi!", ":white");
      expect(colorless).toEqual("hi!");
    });

    it("does nothing when the NO_COLOR environment variable is set to a non-empty string", () => {
      setEnv("NO_COLOR", "non-empty value");
      tty.mockReturnValue(true);
      const colorless = shell().setColor("hi!", ":white");
      expect(colorless).toEqual("hi!");
    });

    it("sets color when the NO_COLOR environment variable is ignored for being nil", () => {
      setEnv("NO_COLOR", undefined);
      tty.mockReturnValue(true);

      const red = shell().setColor("hi!", ":red");
      expect(red).toEqual("\x1b[31mhi!\x1b[0m");

      const onRed = shell().setColor("hi!", ":white", ":on_red");
      expect(onRed).toEqual("\x1b[37m\x1b[41mhi!\x1b[0m");
    });

    it("sets color when the NO_COLOR environment variable is ignored for being an empty string", () => {
      setEnv("NO_COLOR", "");
      tty.mockReturnValue(true);

      const red = shell().setColor("hi!", ":red");
      expect(red).toEqual("\x1b[31mhi!\x1b[0m");

      const onRed = shell().setColor("hi!", ":white", ":on_red");
      expect(onRed).toEqual("\x1b[37m\x1b[41mhi!\x1b[0m");
    });
  });
});
