import type {} from "@blazetrails/vitest-matchers";
import { File } from "@blazetrails/ruby-compat";
import { MiniMagick } from "./mini-magick.js";
import { Shell } from "./shell.js";
import "./test-helpers/spec-helper.js";
import { imagePath } from "./test-helpers/support/helpers.js";
import { Tool, type CliTool } from "./tool.js";
import { beforeEach, expect, it, vi, describe, afterEach } from "vitest";

describe("MiniMagick::Tool", () => {
  let subject: CliTool;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    subject = MiniMagick.identify() as CliTool;
  });

  describe("#call", () => {
    it("calls the shell to run the command", async () => {
      subject.append(imagePath("gif"));
      const output = await subject.call();
      expect(output).toMatch("GIF");
    });

    it("strips the output", async () => {
      subject.append(imagePath());
      const output = await subject.call();
      expect((output as string).endsWith("\n")).toBe(false);
    });

    it("accepts a block, and yields stdin, stdout and exit status", async () => {
      vi.spyOn(Shell.prototype, "execute").mockResolvedValue(["stdout", "stderr", 0]);
      await expect((block: (...args: unknown[]) => unknown) =>
        subject.call({}, block),
      ).toYieldWithArgs("stdout", "stderr", 0);
      expect(await subject.call({}, () => {})).toEqual("stdout");
    });

    it("accepts stdin", async () => {
      subject.append("-");
      const output = await subject.call({ stdin: File.binread(imagePath()) });
      expect(output).toMatch(/JPEG/);
    });
  });

  describe(".new", () => {
    it("accepts a block, and immediately executes the command", async () => {
      const output = await Tool.new("identify", (builder: Tool) => {
        builder.append(imagePath("gif"));
      });
      expect(output).toMatch("GIF");
    });
  });

  describe("#command", () => {
    it("includes the executable and the arguments", () => {
      vi.spyOn(subject as Tool, "args", "get").mockReturnValue(["-list", "Command"]);
      expect(subject.command()).toEqual(expect.arrayContaining(["identify", "-list", "Command"]));
    });
  });

  describe("#executable", () => {
    it("prepends 'magick' to the command when using ImageMagick 7", () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(true);
      expect(subject.executable()).toEqual(["magick", "identify"]);
      expect((MiniMagick.convert() as Tool).executable()).toEqual(["magick"]);
    });

    it("prepends 'gm' to the command when using GraphicsMagick", () => {
      vi.spyOn(MiniMagick, "graphicsmagick", "get").mockReturnValue(true);
      expect(subject.executable()).toEqual(["gm", "identify"]);
      expect((MiniMagick.convert() as Tool).executable()).toEqual(["gm", "convert"]);
    });

    it("respects #cli_prefix as a string", () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(false);
      vi.spyOn(MiniMagick, "cliPrefix", "get").mockReturnValue("firejail");
      expect(subject.executable()).toEqual(["firejail", "identify"]);
    });

    it("respects #cli_prefix as an array", () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(false);
      vi.spyOn(MiniMagick, "cliPrefix", "get").mockReturnValue(["firejail", "--force"]);
      expect(subject.executable()).toEqual(["firejail", "--force", "identify"]);
    });
  });

  describe("#<<", () => {
    it("adds argument to the args list", () => {
      subject
        .append("foo")
        .append("bar")
        .append(123 as unknown as string);
      expect(subject.args).toEqual(["foo", "bar", "123"]);
    });
  });

  describe("#merge!", () => {
    it("adds arguments to the args list", () => {
      subject.append("pre-existing");
      subject.mergeBang(["foo", 123]);
      expect(subject.args).toEqual(["pre-existing", "foo", "123"]);
    });
  });

  describe("#+", () => {
    it("switches the last option to + form", () => {
      subject.help();
      subject.help().plus();
      subject.debug().plus("foo");
      subject.debug().plus(8, "bar");
      expect(subject.args).toEqual(["-help", "+help", "+debug", "foo", "+debug", "8", "bar"]);
    });
  });

  describe("#stdin", () => {
    it("appends the '-' pseudo-filename", () => {
      subject.stdin();
      expect(subject.args).toEqual(["-"]);
    });
  });

  describe("#stdout", () => {
    it("appends the '-' pseudo-filename", () => {
      subject.stdout();
      expect(subject.args).toEqual(["-"]);
    });
  });

  describe("#stack", () => {
    it("it surrounds added arguments with parentheses", () => {
      subject.stack((stack: Tool) => {
        stack.append("foo");
        stack.append("bar");
      });
      expect(subject.args).toEqual(["(", "foo", "bar", ")"]);
    });

    it("accepts hash of options", () => {
      subject.stack({ foo: "bar", a: ["b", "c"] }, "foo.gif");
      expect(subject.args).toEqual(["(", "-foo", "bar", "-a", "b", "c", "foo.gif", ")"]);
    });
  });

  describe("#clone", () => {
    it("adds an option instead of the default behaviour", () => {
      subject.clone();
      expect(subject.args).toEqual(["-clone"]);
    });

    it("accepts arguments", () => {
      subject.clone(0);
      expect(subject.args).toEqual(["-clone", "0"]);
    });

    it("is convertible to plus version", () => {
      subject.clone().plus();
      expect(subject.args).toEqual(["+clone"]);
    });
  });

  describe("#method_missing", () => {
    it("adds CLI options", () => {
      subject.fooBar("baz");
      expect(subject.args).toEqual(["-foo-bar", "baz"]);
    });
  });

  it("defines creation operator methods", () => {
    subject.radialGradient().canvas("khaki");
    expect(subject.args).toEqual(["radial-gradient:", "canvas:khaki"]);
  });
});
