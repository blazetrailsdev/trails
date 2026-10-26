import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { stdin as $stdin, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Basic } from "./basic.js";

describe("Thor::LineEditor::Basic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe(".available?", () => {
    it("returns true", () => {
      assertPredicate(Basic, (klass) => klass.isAvailable());
    });
  });

  describe("#readline", () => {
    it("uses $stdin and $stdout to get input from the user", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      const gets = vi.spyOn($stdin, "gets").mockResolvedValue("George");
      const noecho = vi.spyOn($stdin, "noecho");
      const editor = new Basic("Enter your name ", {});
      expect(await editor.readline()).toEqual("George");
      expect(print).toHaveBeenCalledWith("Enter your name ");
      expect(gets).toHaveBeenCalled();
      expect(noecho).not.toHaveBeenCalled();
    });

    it("disables echo when asked to", async () => {
      const print = vi.spyOn($stdout, "write").mockReturnValue(true);
      const noechoStdin = { gets: vi.fn().mockResolvedValue("secret") };
      const noecho = vi
        .spyOn($stdin, "noecho")
        .mockImplementation((block) => block(noechoStdin as unknown as typeof $stdin));
      const editor = new Basic("Password: ", { echo: false });
      expect(await editor.readline()).toEqual("secret");
      expect(print).toHaveBeenCalledWith("Password: ");
      expect(noechoStdin.gets).toHaveBeenCalled();
      expect(noecho).toHaveBeenCalled();
    });
  });
});
